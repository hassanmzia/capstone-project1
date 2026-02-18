"""
Data Acquisition Agent – full implementation.

Manages FPGA data streaming, ring-buffer management, Redis publishing,
and exposes both REST endpoints and MCP tool definitions for the
orchestrator.
"""

import asyncio
import json
import logging
import os
import time
import uuid
from enum import Enum
from typing import Any, Dict, List, Optional

import numpy as np
from fastapi import HTTPException
from pydantic import BaseModel, Field

from agents.base_agent import BaseAgent
from agents.data_acquisition.fpga_interface import FPGAInterface, DeviceInfo
from agents.data_acquisition.ring_buffer import RingBuffer
from agents.data_acquisition.usb_reader import USBReader

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Pydantic request / response models
# ---------------------------------------------------------------------------


class StartRecordingRequest(BaseModel):
    channel_mask: int = Field(
        default=0xFFFFFFFF,
        description="Bitmask of channels to record (default: all)",
    )
    sample_rate_hz: float = Field(
        default=10_000.0,
        description="Sampling rate in Hz",
    )
    duration_s: Optional[float] = Field(
        default=None,
        description="Recording duration in seconds (None = indefinite)",
    )


class StartRecordingResponse(BaseModel):
    session_id: str
    status: str
    message: str


class StopRecordingRequest(BaseModel):
    session_id: Optional[str] = Field(
        default=None,
        description="Session ID to stop (None = current session)",
    )


class StopRecordingResponse(BaseModel):
    session_id: str
    status: str
    iterations: int
    elapsed_s: float
    message: str


class StreamStatusResponse(BaseModel):
    is_recording: bool
    session_id: Optional[str]
    iteration_count: int
    elapsed_s: float
    throughput_mbps: float
    buffer_fill_pct: float
    buffer_stats: dict
    reader_stats: dict
    device_info: dict


class ConfigureDDR3Request(BaseModel):
    buffer_size_mb: int = Field(
        default=160,
        ge=1,
        le=1024,
        description="Ring buffer size in megabytes",
    )
    mode: str = Field(
        default="circular",
        description="Buffer write mode",
        pattern="^(circular|linear)$",
    )


class ConfigureDDR3Response(BaseModel):
    status: str
    buffer_size_mb: int
    mode: str
    message: str


# ---------------------------------------------------------------------------
# Agent
# ---------------------------------------------------------------------------


class DataAcquisitionAgent(BaseAgent):
    """Agent that handles FPGA data acquisition."""

    def __init__(self) -> None:
        super().__init__(
            agent_name=os.getenv("AGENT_NAME", "data_acquisition"),
            agent_port=int(os.getenv("AGENT_PORT", "8088")),
            agent_type="data_acquisition",
        )

        # FPGA backend (real or simulated)
        self._fpga = FPGAInterface.create()

        # Ring buffer (default 160 MB)
        self._ring_buffer = RingBuffer()

        # USB reader thread
        self._usb_reader = USBReader(
            fpga=self._fpga,
            ring_buffer=self._ring_buffer,
            redis=None,  # set during start()
        )

        # Recording state
        self._is_recording = False
        self._session_id: Optional[str] = None
        self._iteration_count = 0
        self._start_time: float = 0.0
        self._channel_mask: int = 0xFFFFFFFF
        self._sample_rate_hz: float = 10_000.0

        # DDR3 buffer mode
        self._buffer_mode = "circular"

        self._register_routes()

    # ------------------------------------------------------------------
    # Lifecycle overrides
    # ------------------------------------------------------------------

    async def start(self) -> None:
        await super().start()

        # Provide the Redis client to the USB reader
        self._usb_reader._redis = self.redis

        # Initialise FPGA
        if not self._fpga.initialize_device():
            logger.error("FPGA initialisation failed (continuing in degraded mode)")
        else:
            self._fpga.send_reset()
            logger.info("FPGA initialised and reset")

    async def stop(self) -> None:
        if self._is_recording:
            await self._do_stop_recording()
        self._fpga.device_close()
        await super().stop()

    # ------------------------------------------------------------------
    # Route registration
    # ------------------------------------------------------------------

    def _register_routes(self) -> None:

        @self.app.post("/start-recording", response_model=StartRecordingResponse)
        async def start_recording(req: StartRecordingRequest):
            return await self._handle_start_recording(req)

        @self.app.post("/stop-recording", response_model=StopRecordingResponse)
        async def stop_recording(req: StopRecordingRequest = StopRecordingRequest()):
            return await self._handle_stop_recording(req)

        @self.app.get("/stream-status", response_model=StreamStatusResponse)
        async def stream_status():
            return await self._handle_stream_status()

        @self.app.post("/configure-ddr3", response_model=ConfigureDDR3Response)
        async def configure_ddr3(req: ConfigureDDR3Request):
            return await self._handle_configure_ddr3(req)

    # ------------------------------------------------------------------
    # Endpoint handlers
    # ------------------------------------------------------------------

    async def _handle_start_recording(
        self, req: StartRecordingRequest
    ) -> StartRecordingResponse:
        if self._is_recording:
            raise HTTPException(
                status_code=409,
                detail=f"Recording already in progress (session {self._session_id})",
            )

        self._session_id = str(uuid.uuid4())
        self._channel_mask = req.channel_mask
        self._sample_rate_hz = req.sample_rate_hz
        self._iteration_count = 0
        self._start_time = time.time()
        self._is_recording = True

        # Reset ring buffer
        self._ring_buffer.reset()

        # Prepare FPGA for streaming (mirrors legacy SerialThread.set_recording)
        self._fpga.send_wire(0x0D, 0x00, 0x00000004)  # clear DDR3 reset
        self._fpga.send_wire(0x00, 1, 0x01)            # clear FIFO reset
        self._fpga.send_wire(0x10, 0x0008_0000, 0x0008_0000)  # bypass R_CLK
        await asyncio.sleep(0.005)

        self._fpga.send_wire(0x0D, 0x02, 0x00000002)   # enable DDR3 writing
        await asyncio.sleep(0.005)
        self._fpga.send_wire(0x00, 0x00010000, 0x00010000)  # start_conv
        self._fpga.send_wire(0x0D, 0x01, 0x00000001)   # enable DDR3 reading

        # Start USB reader thread
        loop = asyncio.get_running_loop()
        self._usb_reader.start(loop=loop)

        # Publish state change
        if self.redis:
            await self.redis.publish(
                "neural:recording_state",
                json.dumps({
                    "event": "recording_started",
                    "session_id": self._session_id,
                    "channel_mask": self._channel_mask,
                    "sample_rate_hz": self._sample_rate_hz,
                    "ts": time.time(),
                }),
            )

        logger.info("Recording started – session %s", self._session_id)

        return StartRecordingResponse(
            session_id=self._session_id,
            status="recording",
            message="Data acquisition started",
        )

    async def _handle_stop_recording(
        self, req: StopRecordingRequest
    ) -> StopRecordingResponse:
        if not self._is_recording:
            raise HTTPException(status_code=409, detail="No recording in progress")

        if req.session_id and req.session_id != self._session_id:
            raise HTTPException(
                status_code=404,
                detail=f"Session {req.session_id} not found (active: {self._session_id})",
            )

        return await self._do_stop_recording()

    async def _do_stop_recording(self) -> StopRecordingResponse:
        """Internal stop implementation."""
        session_id = self._session_id or "unknown"
        elapsed = time.time() - self._start_time

        # Stop USB reader
        self._usb_reader.stop()

        # Stop FPGA streaming (mirrors legacy SerialThread.set_recording(False))
        self._fpga.send_wire(0x00, 0, 0x01)            # reset FIFO
        await asyncio.sleep(0.005)
        self._fpga.send_wire(0x00, 0x00000000, 0x00010000)  # stop start_conv
        self._fpga.send_wire(0x10, 0x0000_0000, 0x0008_0000)  # disable R_CLK bypass
        self._fpga.send_wire(0x0D, 0x04, 0x00000004)   # reset DDR3

        iterations = self._usb_reader._stats.packets_received
        self._is_recording = False

        # Publish state change
        if self.redis:
            await self.redis.publish(
                "neural:recording_state",
                json.dumps({
                    "event": "recording_stopped",
                    "session_id": session_id,
                    "iterations": iterations,
                    "elapsed_s": round(elapsed, 2),
                    "ts": time.time(),
                }),
            )

        logger.info(
            "Recording stopped – session %s, %d iterations, %.1f s",
            session_id, iterations, elapsed,
        )

        self._session_id = None

        return StopRecordingResponse(
            session_id=session_id,
            status="stopped",
            iterations=iterations,
            elapsed_s=round(elapsed, 2),
            message="Data acquisition stopped",
        )

    async def _handle_stream_status(self) -> StreamStatusResponse:
        elapsed = time.time() - self._start_time if self._is_recording else 0.0
        reader_stats = self._usb_reader.get_stats()
        buffer_stats = self._ring_buffer.get_stats()
        device_info = self._fpga.get_device_info().to_dict()

        return StreamStatusResponse(
            is_recording=self._is_recording,
            session_id=self._session_id,
            iteration_count=reader_stats.get("packets_received", 0),
            elapsed_s=round(elapsed, 2),
            throughput_mbps=reader_stats.get("throughput_mbps", 0.0),
            buffer_fill_pct=buffer_stats.get("fill_pct", 0.0),
            buffer_stats=buffer_stats,
            reader_stats=reader_stats,
            device_info=device_info,
        )

    async def _handle_configure_ddr3(
        self, req: ConfigureDDR3Request
    ) -> ConfigureDDR3Response:
        if self._is_recording:
            raise HTTPException(
                status_code=409,
                detail="Cannot reconfigure DDR3 while recording is active",
            )

        new_size = req.buffer_size_mb * 1024 * 1024
        self._ring_buffer = RingBuffer(capacity=new_size)
        self._usb_reader._ring = self._ring_buffer
        self._buffer_mode = req.mode

        logger.info("DDR3 buffer reconfigured: %d MB, mode=%s", req.buffer_size_mb, req.mode)

        return ConfigureDDR3Response(
            status="configured",
            buffer_size_mb=req.buffer_size_mb,
            mode=req.mode,
            message=f"Ring buffer resized to {req.buffer_size_mb} MB ({req.mode} mode)",
        )

    # ------------------------------------------------------------------
    # MCP tools
    # ------------------------------------------------------------------

    def get_mcp_tools(self) -> List[Dict[str, Any]]:
        return [
            {
                "name": "data_acquisition.start_recording",
                "description": "Start recording neural data from the electrode array.",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "channel_mask": {
                            "type": "integer",
                            "description": "Bitmask of channels to record (default: all)",
                        },
                        "sample_rate_hz": {
                            "type": "number",
                            "description": "Sampling rate in Hz (default: 10000)",
                        },
                        "duration_s": {
                            "type": "number",
                            "description": "Recording duration in seconds (null = indefinite)",
                        },
                    },
                },
            },
            {
                "name": "data_acquisition.stop_recording",
                "description": "Stop the current neural data recording session.",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "session_id": {
                            "type": "string",
                            "description": "Active recording session ID (optional)",
                        },
                    },
                },
            },
            {
                "name": "data_acquisition.get_stream_status",
                "description": (
                    "Get live status of the neural data stream including "
                    "throughput, buffer usage, and packet loss statistics."
                ),
                "input_schema": {
                    "type": "object",
                    "properties": {},
                },
            },
            {
                "name": "data_acquisition.configure_ddr3",
                "description": "Configure the DDR3 ring buffer for high-speed neural data capture.",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "buffer_size_mb": {
                            "type": "integer",
                            "description": "Buffer size in megabytes (1-1024)",
                        },
                        "mode": {
                            "type": "string",
                            "enum": ["circular", "linear"],
                            "description": "Buffer write mode",
                        },
                    },
                    "required": ["buffer_size_mb"],
                },
            },
        ]

    # ------------------------------------------------------------------
    # Health
    # ------------------------------------------------------------------

    async def health_check(self) -> Dict[str, Any]:
        base = await super().health_check()
        base.update({
            "is_recording": self._is_recording,
            "session_id": self._session_id,
            "buffer_fill_pct": self._ring_buffer.get_fill_fraction() * 100,
            "device_simulated": self._fpga.get_device_info().is_simulated,
        })
        return base


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------


def main() -> None:
    agent = DataAcquisitionAgent()
    agent.run()


if __name__ == "__main__":
    main()
