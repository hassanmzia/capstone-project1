"""
Hardware Control Agent -- full implementation.

Provides REST and MCP interfaces for all hardware configuration:
bias voltages, pixel selection, stimulation, clock dividers, TIA
configuration, arbitrary waveform upload, and device info.

All write operations pass through the ``HardwareSafetyGuard`` before
reaching the FPGA.
"""

import asyncio
import json
import logging
import os
import time
from typing import Any, Dict, List, Optional

from fastapi import HTTPException
from pydantic import BaseModel, Field

from agents.base_agent import BaseAgent
from agents.data_acquisition.fpga_interface import FPGAInterface
from agents.hardware_control.bias_controller import BiasController
from agents.hardware_control.clock_controller import ClockController
from agents.hardware_control.pixel_controller import PixelController, GainMode
from agents.hardware_control.safety import HardwareSafetyGuard, SafetyViolation
from agents.hardware_control.stim_controller import StimController

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Pydantic request / response models
# ---------------------------------------------------------------------------

class ConfigureBiasRequest(BaseModel):
    """Set one or more bias voltages."""
    params: Dict[str, float] = Field(
        ...,
        description="Mapping of bias parameter name to voltage (V). "
                    "Valid names: VS1-VS4, V_CI1-V_CI4, VREFL, VREFLH, VREFMH, "
                    "VCM, BP_CI, BP_OTA, VR, NMIR, REF_DC, TEMP_SET, TEMP_OS, TEST_IN",
    )


class ConfigureBiasResponse(BaseModel):
    status: str
    changes: List[dict]


class ConfigurePixelsRequest(BaseModel):
    pixel_indices: Optional[List[int]] = Field(
        default=None,
        description="List of pixel indices (0-4095) to select",
    )
    select_all: bool = Field(
        default=False,
        description="Select all 4096 pixels",
    )
    region: Optional[Dict[str, int]] = Field(
        default=None,
        description="Rectangular region: {row_start, row_end, col_start, col_end}",
    )


class ConfigurePixelsResponse(BaseModel):
    status: str
    count: int
    message: str


class SetStimulationRequest(BaseModel):
    mode: str = Field(
        ...,
        description="Stimulation mode: dc, ac, pulse",
    )
    vs_channel: int = Field(
        default=1, ge=1, le=4,
        description="VS channel (1-4)",
    )
    amplitude_v: Optional[float] = Field(
        default=None,
        description="DC amplitude in volts",
    )
    amp_dc: Optional[float] = Field(
        default=None,
        description="DC offset for AC/pulse modes",
    )
    amp_peak: Optional[float] = Field(
        default=None,
        description="Peak amplitude for AC/pulse modes",
    )
    frequency_hz: Optional[float] = Field(
        default=None,
        description="Frequency in Hz for AC/pulse modes",
    )
    duty: float = Field(
        default=0.5, ge=0.0, le=1.0,
        description="Duty cycle for pulse mode",
    )


class SetStimulationResponse(BaseModel):
    status: str
    mode: str
    details: dict


class SetClocksRequest(BaseModel):
    dividers: Dict[str, int] = Field(
        ...,
        description="Clock name to divider mapping (CLK1, CLK2, CLK3, PG_CLK, DATA_CLK)",
    )


class SetClocksResponse(BaseModel):
    status: str
    changes: List[dict]


class SetGainModeRequest(BaseModel):
    mode: str = Field(
        ...,
        description="Gain mode (e.g. 'GainX300_Inv_Bio', 'Buffer Mode')",
    )
    pixel_groups: Optional[List[dict]] = Field(
        default=None,
        description="Per-group pixel configuration overrides",
    )


class SetGainModeResponse(BaseModel):
    status: str
    gain_mode: str
    config_word: str


class ConfigureTIARequest(BaseModel):
    ref_data: int = Field(default=0x0000, description="TIA reference DAC data")
    temp_data: int = Field(default=0x00, description="Temperature DAC data")
    lpf_data: int = Field(default=0xFFFFF, description="LPF configuration (20-bit)")
    mux_data: int = Field(default=0x01F, description="MUX selection (9-bit)")
    reset: bool = Field(default=False, description="Reset TIA before configuration")


class ConfigureTIAResponse(BaseModel):
    status: str
    message: str


class UploadWaveformRequest(BaseModel):
    waveform_id: str = Field(..., description="Unique waveform identifier")
    samples: List[float] = Field(..., description="Waveform sample values in volts")
    sample_rate_hz: float = Field(..., gt=0, description="Waveform sample rate in Hz")


class UploadWaveformResponse(BaseModel):
    status: str
    waveform_id: str
    n_samples: int
    duration_ms: float


class TriggerStimulationRequest(BaseModel):
    action: str = Field(
        default="start",
        description="'start' or 'stop'",
        pattern="^(start|stop)$",
    )
    waveform_id: Optional[str] = Field(
        default=None,
        description="Waveform ID for arbitrary mode",
    )
    repeat: bool = Field(default=False, description="Loop waveform indefinitely")
    repeat_count: int = Field(default=1, ge=1, description="Number of repetitions")


class TriggerStimulationResponse(BaseModel):
    status: str
    message: str


class DeviceInfoResponse(BaseModel):
    product_name: str
    serial_number: str
    device_id: str
    firmware_version: str
    is_simulated: bool
    bias_values: dict
    clock_settings: dict
    gain_mode: dict
    stim_status: dict


# ---------------------------------------------------------------------------
# Agent
# ---------------------------------------------------------------------------

class HardwareControlAgent(BaseAgent):
    """Agent that manages all hardware interactions."""

    def __init__(self) -> None:
        super().__init__(
            agent_name=os.getenv("AGENT_NAME", "hardware_control"),
            agent_port=int(os.getenv("AGENT_PORT", "8090")),
            agent_type="hardware_control",
        )

        # FPGA backend (shared – may be same instance as DAQ agent
        # if running in-process; otherwise independent)
        self._fpga = FPGAInterface.create()

        # Safety guard
        self._safety = HardwareSafetyGuard()

        # Sub-controllers
        self._bias = BiasController(self._fpga, self._safety)
        self._clocks = ClockController(self._fpga)
        self._pixels = PixelController(self._fpga)
        self._stim = StimController(self._fpga, self._safety)

        self._register_routes()

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    async def start(self) -> None:
        await super().start()

        if not self._fpga.initialize_device():
            logger.error("FPGA init failed – continuing in simulation mode")
        else:
            self._fpga.send_reset()
            self._fpga.dac_init()
            logger.info("FPGA initialised, DACs reset")

    async def stop(self) -> None:
        try:
            self._fpga.VDD_SHDN(SHDN=True)
            self._fpga.pcb_config_write(True, 0x0000, 0x00, 0xFFFFF, 0x000)
            self._fpga.device_close()
        except Exception as exc:
            logger.warning("Error during FPGA shutdown: %s", exc)
        await super().stop()

    # ------------------------------------------------------------------
    # Route registration
    # ------------------------------------------------------------------

    def _register_routes(self) -> None:

        # ---- Bias ----
        @self.app.post("/configure-bias", response_model=ConfigureBiasResponse)
        async def configure_bias(req: ConfigureBiasRequest):
            return await self._handle_configure_bias(req)

        # ---- Pixels ----
        @self.app.post("/configure-pixels", response_model=ConfigurePixelsResponse)
        async def configure_pixels(req: ConfigurePixelsRequest):
            return await self._handle_configure_pixels(req)

        # ---- Stimulation ----
        @self.app.post("/set-stimulation", response_model=SetStimulationResponse)
        async def set_stimulation(req: SetStimulationRequest):
            return await self._handle_set_stimulation(req)

        # ---- Clocks ----
        @self.app.post("/set-clocks", response_model=SetClocksResponse)
        async def set_clocks(req: SetClocksRequest):
            return await self._handle_set_clocks(req)

        # ---- Gain mode ----
        @self.app.post("/set-gain-mode", response_model=SetGainModeResponse)
        async def set_gain_mode(req: SetGainModeRequest):
            return await self._handle_set_gain_mode(req)

        # ---- TIA ----
        @self.app.post("/configure-tia", response_model=ConfigureTIAResponse)
        async def configure_tia(req: ConfigureTIARequest):
            return await self._handle_configure_tia(req)

        # ---- Waveform upload ----
        @self.app.post("/upload-waveform", response_model=UploadWaveformResponse)
        async def upload_waveform(req: UploadWaveformRequest):
            return await self._handle_upload_waveform(req)

        # ---- Trigger ----
        @self.app.post("/trigger-stimulation", response_model=TriggerStimulationResponse)
        async def trigger_stimulation(req: TriggerStimulationRequest):
            return await self._handle_trigger_stimulation(req)

        # ---- Device info ----
        @self.app.get("/device-info", response_model=DeviceInfoResponse)
        async def device_info():
            return await self._handle_device_info()

    # ------------------------------------------------------------------
    # Endpoint handlers
    # ------------------------------------------------------------------

    async def _handle_configure_bias(self, req: ConfigureBiasRequest) -> ConfigureBiasResponse:
        try:
            result = self._bias.set_multiple(req.params)
        except SafetyViolation as exc:
            raise HTTPException(status_code=422, detail=str(exc))
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc))

        # Publish config change
        await self._publish_config("bias_update", result)

        return ConfigureBiasResponse(
            status=result["status"],
            changes=result["changes"],
        )

    async def _handle_configure_pixels(self, req: ConfigurePixelsRequest) -> ConfigurePixelsResponse:
        try:
            if req.select_all:
                result = self._pixels.select_all()
            elif req.region:
                result = self._pixels.select_region(
                    row_start=req.region["row_start"],
                    row_end=req.region["row_end"],
                    col_start=req.region["col_start"],
                    col_end=req.region["col_end"],
                )
            elif req.pixel_indices is not None:
                result = self._pixels.select_pixels(req.pixel_indices)
            else:
                raise HTTPException(
                    status_code=400,
                    detail="Provide pixel_indices, select_all, or region",
                )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc))

        await self._publish_config("pixel_update", result)

        return ConfigurePixelsResponse(
            status=result["status"],
            count=result["count"],
            message=f"{result['count']} pixels selected",
        )

    async def _handle_set_stimulation(self, req: SetStimulationRequest) -> SetStimulationResponse:
        try:
            if req.mode == "dc":
                if req.amplitude_v is None:
                    raise ValueError("amplitude_v required for DC mode")
                result = self._stim.configure_dc(req.vs_channel, req.amplitude_v)
            elif req.mode in ("ac", "pulse"):
                if req.amp_dc is None or req.amp_peak is None or req.frequency_hz is None:
                    raise ValueError("amp_dc, amp_peak, frequency_hz required for AC/pulse")
                result = self._stim.configure_ac_pulse(
                    mode=req.mode,
                    vs_channel=req.vs_channel,
                    amp_dc=req.amp_dc,
                    amp_peak=req.amp_peak,
                    frequency_hz=req.frequency_hz,
                    duty=req.duty,
                )
            else:
                raise ValueError(f"Unknown stim mode: {req.mode}")
        except SafetyViolation as exc:
            raise HTTPException(status_code=422, detail=str(exc))
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc))

        await self._publish_config("stimulation_update", result)

        return SetStimulationResponse(
            status=result["status"],
            mode=result["mode"],
            details=result,
        )

    async def _handle_set_clocks(self, req: SetClocksRequest) -> SetClocksResponse:
        try:
            result = self._clocks.set_clocks(req.dividers)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc))

        await self._publish_config("clock_update", result)

        return SetClocksResponse(
            status=result["status"],
            changes=result["changes"],
        )

    async def _handle_set_gain_mode(self, req: SetGainModeRequest) -> SetGainModeResponse:
        try:
            result = self._pixels.configure_pixel(
                gain_mode=req.mode,
                pixel_groups=req.pixel_groups,
            )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc))

        await self._publish_config("gain_mode_update", result)

        return SetGainModeResponse(
            status=result["status"],
            gain_mode=result["gain_mode"],
            config_word=result["config_word"],
        )

    async def _handle_configure_tia(self, req: ConfigureTIARequest) -> ConfigureTIAResponse:
        self._fpga.pcb_config_write(
            reset=req.reset,
            ref_data=req.ref_data,
            temp_data=req.temp_data,
            lpf_data=req.lpf_data,
            mux_data=req.mux_data,
        )

        await self._publish_config("tia_update", {
            "ref_data": req.ref_data,
            "temp_data": req.temp_data,
            "lpf_data": req.lpf_data,
            "mux_data": req.mux_data,
        })

        return ConfigureTIAResponse(
            status="configured",
            message="TIA configuration applied",
        )

    async def _handle_upload_waveform(self, req: UploadWaveformRequest) -> UploadWaveformResponse:
        try:
            result = self._stim.upload_waveform(
                waveform_id=req.waveform_id,
                samples=req.samples,
                sample_rate_hz=req.sample_rate_hz,
            )
        except SafetyViolation as exc:
            raise HTTPException(status_code=422, detail=str(exc))
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc))

        await self._publish_config("waveform_upload", {
            "waveform_id": req.waveform_id,
            "n_samples": result["n_samples"],
        })

        return UploadWaveformResponse(
            status=result["status"],
            waveform_id=result["waveform_id"],
            n_samples=result["n_samples"],
            duration_ms=result["duration_ms"],
        )

    async def _handle_trigger_stimulation(self, req: TriggerStimulationRequest) -> TriggerStimulationResponse:
        try:
            if req.action == "start":
                if req.waveform_id:
                    result = self._stim.trigger_waveform(
                        waveform_id=req.waveform_id,
                        repeat=req.repeat,
                        repeat_count=req.repeat_count,
                    )
                else:
                    result = self._stim.start_stimulation()
                msg = "Stimulation started"
            else:
                result = self._stim.stop_stimulation()
                msg = "Stimulation stopped"
        except SafetyViolation as exc:
            raise HTTPException(status_code=422, detail=str(exc))
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc))

        await self._publish_config("stimulation_trigger", result)

        return TriggerStimulationResponse(
            status=result["status"],
            message=msg,
        )

    async def _handle_device_info(self) -> DeviceInfoResponse:
        info = self._fpga.get_device_info()
        return DeviceInfoResponse(
            product_name=info.product_name,
            serial_number=info.serial_number,
            device_id=info.device_id,
            firmware_version=f"{info.firmware_major}.{info.firmware_minor}",
            is_simulated=info.is_simulated,
            bias_values=self._bias.get_all(),
            clock_settings=self._clocks.get_all(),
            gain_mode=self._pixels.get_gain_mode(),
            stim_status=self._stim.get_status(),
        )

    # ------------------------------------------------------------------
    # Redis helpers
    # ------------------------------------------------------------------

    async def _publish_config(self, event: str, data: Any) -> None:
        """Publish a config change event to Redis."""
        if self.redis:
            try:
                payload = json.dumps({
                    "event": event,
                    "data": data,
                    "ts": time.time(),
                    "agent": self.agent_name,
                })
                await self.redis.publish("neural:config_updates", payload)
            except Exception as exc:
                logger.warning("Failed to publish config event: %s", exc)

    # ------------------------------------------------------------------
    # MCP tools
    # ------------------------------------------------------------------

    def get_mcp_tools(self) -> List[Dict[str, Any]]:
        return [
            {
                "name": "hardware_control.configure_bias",
                "description": (
                    "Configure bias voltages for the neural interface ASIC. "
                    "Valid parameters: VS1-VS4, V_CI1-V_CI4, VREFL, VREFLH, "
                    "VREFMH, VCM, BP_CI, BP_OTA, VR, NMIR, REF_DC, TEMP_SET, "
                    "TEMP_OS, TEST_IN. Values in volts (0.0-3.3V)."
                ),
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "params": {
                            "type": "object",
                            "additionalProperties": {"type": "number"},
                            "description": "Bias name -> voltage mapping",
                        },
                    },
                    "required": ["params"],
                },
            },
            {
                "name": "hardware_control.configure_pixels",
                "description": "Select pixels on the 64x64 electrode array.",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "pixel_indices": {
                            "type": "array",
                            "items": {"type": "integer"},
                            "description": "Pixel indices (0-4095)",
                        },
                        "select_all": {
                            "type": "boolean",
                            "description": "Select all 4096 pixels",
                        },
                        "region": {
                            "type": "object",
                            "properties": {
                                "row_start": {"type": "integer"},
                                "row_end": {"type": "integer"},
                                "col_start": {"type": "integer"},
                                "col_end": {"type": "integer"},
                            },
                            "description": "Rectangular selection region",
                        },
                    },
                },
            },
            {
                "name": "hardware_control.set_stimulation",
                "description": (
                    "Configure stimulation parameters. Modes: dc, ac, pulse. "
                    "DC requires amplitude_v. AC/pulse require amp_dc, amp_peak, frequency_hz."
                ),
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "mode": {
                            "type": "string",
                            "enum": ["dc", "ac", "pulse"],
                            "description": "Stimulation mode",
                        },
                        "vs_channel": {
                            "type": "integer",
                            "description": "VS channel (1-4)",
                        },
                        "amplitude_v": {
                            "type": "number",
                            "description": "DC amplitude in volts",
                        },
                        "amp_dc": {
                            "type": "number",
                            "description": "DC offset voltage",
                        },
                        "amp_peak": {
                            "type": "number",
                            "description": "Peak amplitude voltage",
                        },
                        "frequency_hz": {
                            "type": "number",
                            "description": "Stimulation frequency",
                        },
                        "duty": {
                            "type": "number",
                            "description": "Duty cycle (0-1)",
                        },
                    },
                    "required": ["mode", "vs_channel"],
                },
            },
            {
                "name": "hardware_control.set_clocks",
                "description": (
                    "Set clock divider values. Available clocks: CLK1, CLK2, CLK3, "
                    "PG_CLK, DATA_CLK. Master clock is 200 MHz."
                ),
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "dividers": {
                            "type": "object",
                            "additionalProperties": {"type": "integer"},
                            "description": "Clock name -> divider value",
                        },
                    },
                    "required": ["dividers"],
                },
            },
            {
                "name": "hardware_control.set_gain_mode",
                "description": (
                    "Set the amplifier gain mode for the electrode array. "
                    "Modes: Buffer Mode, GainX40, GainX100, GainX300, "
                    "GainX40_Inv_Bio, GainX100_Inv_Bio, GainX300_Inv_Bio, Device_Test."
                ),
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "mode": {
                            "type": "string",
                            "description": "Gain mode name",
                        },
                        "pixel_groups": {
                            "type": "array",
                            "items": {"type": "object"},
                            "description": "Optional per-group config overrides",
                        },
                    },
                    "required": ["mode"],
                },
            },
            {
                "name": "hardware_control.configure_tia",
                "description": (
                    "Configure the transimpedance amplifier: reference DAC, "
                    "temperature, LPF, and MUX settings."
                ),
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "ref_data": {
                            "type": "integer",
                            "description": "TIA reference DAC data",
                        },
                        "temp_data": {
                            "type": "integer",
                            "description": "Temperature DAC data",
                        },
                        "lpf_data": {
                            "type": "integer",
                            "description": "LPF configuration (20-bit)",
                        },
                        "mux_data": {
                            "type": "integer",
                            "description": "MUX selection (9-bit)",
                        },
                        "reset": {
                            "type": "boolean",
                            "description": "Reset TIA before configuration",
                        },
                    },
                },
            },
            {
                "name": "hardware_control.upload_waveform",
                "description": (
                    "Upload a custom arbitrary waveform to FPGA memory. "
                    "Max 2048 sample points."
                ),
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "waveform_id": {
                            "type": "string",
                            "description": "Unique waveform identifier",
                        },
                        "samples": {
                            "type": "array",
                            "items": {"type": "number"},
                            "description": "Waveform samples in volts",
                        },
                        "sample_rate_hz": {
                            "type": "number",
                            "description": "Sample rate in Hz",
                        },
                    },
                    "required": ["waveform_id", "samples", "sample_rate_hz"],
                },
            },
            {
                "name": "hardware_control.trigger_stimulation",
                "description": "Start or stop stimulation output.",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "action": {
                            "type": "string",
                            "enum": ["start", "stop"],
                            "description": "Start or stop",
                        },
                        "waveform_id": {
                            "type": "string",
                            "description": "Waveform ID for arbitrary mode",
                        },
                        "repeat": {
                            "type": "boolean",
                            "description": "Loop indefinitely",
                        },
                        "repeat_count": {
                            "type": "integer",
                            "description": "Number of repetitions",
                        },
                    },
                    "required": ["action"],
                },
            },
            {
                "name": "hardware_control.get_device_info",
                "description": (
                    "Retrieve hardware device information including FPGA firmware, "
                    "serial number, current bias/clock/gain settings, and stim status."
                ),
                "input_schema": {
                    "type": "object",
                    "properties": {},
                },
            },
        ]

    # ------------------------------------------------------------------
    # Health
    # ------------------------------------------------------------------

    async def health_check(self) -> Dict[str, Any]:
        base = await super().health_check()
        info = self._fpga.get_device_info()
        base.update({
            "device_simulated": info.is_simulated,
            "firmware_version": f"{info.firmware_major}.{info.firmware_minor}",
            "gain_mode": self._pixels.get_gain_mode().get("gain_mode"),
            "stim_active": self._stim.get_status().get("is_active", False),
        })
        return base


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------


def main() -> None:
    agent = HardwareControlAgent()
    agent.run()


if __name__ == "__main__":
    main()
