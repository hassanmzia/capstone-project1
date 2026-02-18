"""
Storage Agent.

Manages persistence of neural recording data to HDF5 files and export
to CSV, MATLAB, and NWB formats.  Subscribes to ``neural:raw_data`` via
Redis to save data in real time.

Extends :class:`BaseAgent` and runs on port 8091.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import time
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

import numpy as np
from fastapi import HTTPException
from pydantic import BaseModel, Field

from agents.base_agent import BaseAgent

from .exporters import DataExporter
from .hdf5_writer import HDF5Writer

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

DEFAULT_DATA_DIR = os.getenv("DATA_DIR", "/tmp/cnea_data")
DEFAULT_DEVICE_NAME = os.getenv("DEVICE_NAME", "CNEAv5")
NUM_CHANNELS = 4096
BATCH_SAMPLES = 512

# ---------------------------------------------------------------------------
# Pydantic request / response models
# ---------------------------------------------------------------------------


class SaveRecordingRequest(BaseModel):
    """Configure and start a new recording session."""
    device_name: str = Field(DEFAULT_DEVICE_NAME, description="Recording device name")
    experiment_mode: str = Field("Device_Test", description="Experiment mode label")
    sample_rate: float = Field(10_000.0, gt=0, description="Sample rate in Hz")
    compression: bool = Field(True, description="Enable gzip compression")
    metadata: Optional[Dict[str, Any]] = Field(None, description="Additional metadata")


class SaveRecordingResponse(BaseModel):
    recording_id: str
    file_path: str
    status: str
    message: str


class StopSavingRequest(BaseModel):
    recording_id: Optional[str] = Field(None, description="Stop a specific recording (or current)")


class StopSavingResponse(BaseModel):
    recording_id: str
    file_path: Optional[str]
    sample_count: int
    duration_seconds: float
    status: str
    message: str


class ExportDataRequest(BaseModel):
    recording_id: str = Field(..., description="Recording ID to export")
    format: str = Field(..., pattern="^(csv|mat|nwb)$", description="Export format")
    output_path: Optional[str] = Field(None, description="Custom output path")
    channels: Optional[List[int]] = Field(None, description="Channel subset to export")
    session_description: Optional[str] = Field(None, description="NWB session description")


class ExportDataResponse(BaseModel):
    recording_id: str
    format: str
    output_path: str
    elapsed_seconds: float
    message: str
    details: Optional[Dict[str, Any]] = None


class RecordingInfo(BaseModel):
    recording_id: str
    file_path: str
    file_size_mb: float
    sample_count: int
    created_at: str
    device_name: str
    experiment_mode: Optional[str] = None
    sample_rate: float = 10_000.0
    duration_seconds: Optional[float] = None


class RecordingsListResponse(BaseModel):
    recordings: List[RecordingInfo]
    total: int


class RecordingMetadataResponse(BaseModel):
    recording_id: str
    file_path: str
    metadata: Dict[str, Any]


class StorageStatsResponse(BaseModel):
    data_dir: str
    total_files: int
    total_size_mb: float
    recordings_count: int
    oldest_recording: Optional[str] = None
    newest_recording: Optional[str] = None


# ---------------------------------------------------------------------------
# Agent
# ---------------------------------------------------------------------------


class StorageAgent(BaseAgent):
    """Agent responsible for data storage, retrieval, and export."""

    def __init__(self) -> None:
        super().__init__(
            agent_name=os.getenv("AGENT_NAME", "storage"),
            agent_port=int(os.getenv("AGENT_PORT", "8091")),
            agent_type="storage",
        )

        self.data_dir = DEFAULT_DATA_DIR
        self.device_name = DEFAULT_DEVICE_NAME

        # Current writer and state
        self._writer: Optional[HDF5Writer] = None
        self._current_recording_id: Optional[str] = None
        self._is_saving: bool = False
        self._save_start_time: Optional[float] = None

        # Registry of completed recordings: {recording_id: file_path}
        self._recordings: Dict[str, str] = {}

        # Exporter
        self._exporter = DataExporter(
            num_channels=NUM_CHANNELS,
            samples_per_frame=BATCH_SAMPLES,
        )

        # Background tasks
        self._subscriber_task: Optional[asyncio.Task] = None
        self._data_queue: asyncio.Queue = asyncio.Queue(maxsize=500)
        self._writer_task: Optional[asyncio.Task] = None

        # Scan for existing recordings at startup
        self._scan_existing_recordings()

        self._register_routes()

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    async def start(self) -> None:
        await super().start()
        self._subscriber_task = asyncio.create_task(self._redis_subscriber())
        self._writer_task = asyncio.create_task(self._background_writer())
        logger.info("Storage Agent started -- subscriber and writer active.")

    async def stop(self) -> None:
        # Stop saving if active
        if self._is_saving and self._writer is not None:
            self._writer.close()
            self._is_saving = False

        for task in (self._subscriber_task, self._writer_task):
            if task is not None:
                task.cancel()
                try:
                    await task
                except asyncio.CancelledError:
                    pass
        await super().stop()

    # ------------------------------------------------------------------
    # Redis subscriber
    # ------------------------------------------------------------------

    async def _redis_subscriber(self) -> None:
        """Listen to ``neural:raw_data`` and enqueue data for saving."""
        try:
            pubsub = self.redis.pubsub()
            await pubsub.subscribe("neural:raw_data")
            logger.info("Storage agent subscribed to neural:raw_data")

            async for message in pubsub.listen():
                if message["type"] != "message":
                    continue

                if not self._is_saving:
                    continue

                try:
                    payload = json.loads(message["data"])
                    if "data" in payload:
                        try:
                            self._data_queue.put_nowait(payload["data"])
                        except asyncio.QueueFull:
                            logger.warning("Storage data queue full -- dropping frame")
                except Exception as exc:
                    logger.warning("Failed to parse raw_data for storage: %s", exc)

        except asyncio.CancelledError:
            logger.info("Storage Redis subscriber cancelled.")
        except Exception as exc:
            logger.error("Storage Redis subscriber error: %s", exc)

    # ------------------------------------------------------------------
    # Background writer
    # ------------------------------------------------------------------

    async def _background_writer(self) -> None:
        """Consume data from the queue and append to HDF5."""
        try:
            while True:
                try:
                    raw_data = await asyncio.wait_for(
                        self._data_queue.get(), timeout=1.0,
                    )
                except asyncio.TimeoutError:
                    continue

                if not self._is_saving or self._writer is None:
                    continue

                try:
                    arr = np.array(raw_data, dtype=np.uint16)
                    self._writer.append_data(arr)
                except Exception as exc:
                    logger.error("HDF5 write error: %s", exc)

        except asyncio.CancelledError:
            logger.info("Background writer cancelled.")

    # ------------------------------------------------------------------
    # Scan existing recordings
    # ------------------------------------------------------------------

    def _scan_existing_recordings(self) -> None:
        """Walk the data directory and index existing HDF5 files."""
        if not os.path.isdir(self.data_dir):
            return

        for root, _dirs, files in os.walk(self.data_dir):
            for fname in files:
                if fname.endswith((".h5", ".hdf5")):
                    fpath = os.path.join(root, fname)
                    rec_id = Path(fpath).stem
                    self._recordings[rec_id] = fpath

        logger.info(
            "Scanned %d existing recordings in %s",
            len(self._recordings),
            self.data_dir,
        )

    # ------------------------------------------------------------------
    # Routes
    # ------------------------------------------------------------------

    def _register_routes(self) -> None:

        # -- Save Recording ------------------------------------------------

        @self.app.post("/save-recording", response_model=SaveRecordingResponse)
        async def save_recording(req: SaveRecordingRequest) -> SaveRecordingResponse:
            """Configure and start saving data to HDF5."""
            if self._is_saving:
                raise HTTPException(
                    status_code=409,
                    detail="A recording is already in progress.  Stop it first.",
                )

            recording_id = f"rec_{uuid.uuid4().hex[:12]}"
            writer = HDF5Writer(
                data_dir=self.data_dir,
                device_name=req.device_name,
            )

            metadata = req.metadata or {}
            metadata.update({
                "recording_id": recording_id,
                "experiment_mode": req.experiment_mode,
                "sample_rate": req.sample_rate,
                "compression": req.compression,
            })

            file_path = writer.create_file(metadata=metadata)

            self._writer = writer
            self._current_recording_id = recording_id
            self._is_saving = True
            self._save_start_time = time.time()

            # Register in our index
            self._recordings[recording_id] = file_path

            return SaveRecordingResponse(
                recording_id=recording_id,
                file_path=file_path,
                status="recording",
                message="Recording started successfully.",
            )

        # -- Stop Saving ---------------------------------------------------

        @self.app.post("/stop-saving", response_model=StopSavingResponse)
        async def stop_saving(req: StopSavingRequest) -> StopSavingResponse:
            """Stop the current recording."""
            if not self._is_saving or self._writer is None:
                raise HTTPException(
                    status_code=404,
                    detail="No active recording to stop.",
                )

            info = self._writer.get_file_info()
            self._writer.close()

            duration = 0.0
            if self._save_start_time is not None:
                duration = round(time.time() - self._save_start_time, 2)

            rec_id = self._current_recording_id or "unknown"
            self._is_saving = False
            self._current_recording_id = None
            self._writer = None
            self._save_start_time = None

            return StopSavingResponse(
                recording_id=rec_id,
                file_path=info.get("file_path"),
                sample_count=info.get("sample_count", 0),
                duration_seconds=duration,
                status="stopped",
                message="Recording stopped and file saved.",
            )

        # -- Export Data ---------------------------------------------------

        @self.app.post("/export-data", response_model=ExportDataResponse)
        async def export_data(req: ExportDataRequest) -> ExportDataResponse:
            """Export a recording to CSV, MAT, or NWB format."""
            recording_path = self._resolve_recording(req.recording_id)

            # Determine output path
            if req.output_path:
                out_path = req.output_path
            else:
                ext_map = {"csv": ".csv", "mat": ".mat", "nwb": ".nwb"}
                base = os.path.splitext(recording_path)[0]
                out_path = base + ext_map.get(req.format, ".dat")

            try:
                if req.format == "csv":
                    details = self._exporter.export_csv(
                        recording_path, out_path, channels=req.channels,
                    )
                elif req.format == "mat":
                    details = self._exporter.export_mat(
                        recording_path, out_path, channels=req.channels,
                    )
                elif req.format == "nwb":
                    desc = req.session_description or "Neural recording from CNEA v5"
                    details = self._exporter.export_nwb(
                        recording_path, out_path,
                        channels=req.channels,
                        session_description=desc,
                    )
                else:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Unsupported export format: {req.format}",
                    )
            except FileNotFoundError as exc:
                raise HTTPException(status_code=404, detail=str(exc))
            except Exception as exc:
                logger.error("Export error: %s", exc)
                raise HTTPException(status_code=500, detail=str(exc))

            return ExportDataResponse(
                recording_id=req.recording_id,
                format=req.format,
                output_path=details["output_path"],
                elapsed_seconds=details.get("elapsed_seconds", 0.0),
                message=f"Export to {req.format.upper()} completed successfully.",
                details=details,
            )

        # -- List Recordings -----------------------------------------------

        @self.app.get("/recordings", response_model=RecordingsListResponse)
        async def list_recordings(
            device: Optional[str] = None,
            date: Optional[str] = None,
            limit: int = 50,
            offset: int = 0,
        ) -> RecordingsListResponse:
            """Query recordings with optional filtering."""
            results: List[RecordingInfo] = []

            for rec_id, fpath in self._recordings.items():
                if not os.path.exists(fpath):
                    continue

                # Apply filters
                if date and date not in fpath:
                    continue

                try:
                    file_info = HDF5Writer.read_file(fpath)
                    meta = file_info.get("metadata", {})

                    if device and meta.get("device_name", "") != device:
                        continue

                    sr = float(meta.get("sample_rate", 10000.0))
                    sc = file_info.get("sample_count", 0)
                    dur = round(sc / sr, 2) if sr > 0 and sc > 0 else None

                    results.append(
                        RecordingInfo(
                            recording_id=rec_id,
                            file_path=fpath,
                            file_size_mb=file_info.get("file_size_mb", 0.0),
                            sample_count=sc,
                            created_at=meta.get("created_at", ""),
                            device_name=meta.get("device_name", "unknown"),
                            experiment_mode=meta.get("experiment_mode"),
                            sample_rate=sr,
                            duration_seconds=dur,
                        )
                    )
                except Exception as exc:
                    logger.warning("Could not read recording %s: %s", fpath, exc)

            # Sort by creation time descending
            results.sort(key=lambda r: r.created_at, reverse=True)
            total = len(results)
            page = results[offset: offset + limit]

            return RecordingsListResponse(recordings=page, total=total)

        # -- Recording Metadata --------------------------------------------

        @self.app.get("/recordings/{recording_id}/metadata", response_model=RecordingMetadataResponse)
        async def get_recording_metadata(recording_id: str) -> RecordingMetadataResponse:
            """Get detailed metadata for a specific recording."""
            fpath = self._resolve_recording(recording_id)
            try:
                file_info = HDF5Writer.read_file(fpath)
            except FileNotFoundError as exc:
                raise HTTPException(status_code=404, detail=str(exc))

            return RecordingMetadataResponse(
                recording_id=recording_id,
                file_path=fpath,
                metadata=file_info,
            )

        # -- Storage Stats -------------------------------------------------

        @self.app.get("/storage-stats", response_model=StorageStatsResponse)
        async def storage_stats() -> StorageStatsResponse:
            """Get disk usage, file counts, and date ranges."""
            total_files = 0
            total_size = 0
            oldest: Optional[str] = None
            newest: Optional[str] = None

            if os.path.isdir(self.data_dir):
                for root, _dirs, files in os.walk(self.data_dir):
                    for fname in files:
                        fpath = os.path.join(root, fname)
                        total_files += 1
                        total_size += os.path.getsize(fpath)

                        mtime = os.path.getmtime(fpath)
                        mtime_str = datetime.fromtimestamp(mtime).isoformat()
                        if oldest is None or mtime_str < oldest:
                            oldest = mtime_str
                        if newest is None or mtime_str > newest:
                            newest = mtime_str

            return StorageStatsResponse(
                data_dir=self.data_dir,
                total_files=total_files,
                total_size_mb=round(total_size / (1024 * 1024), 2),
                recordings_count=len(self._recordings),
                oldest_recording=oldest,
                newest_recording=newest,
            )

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _resolve_recording(self, recording_id: str) -> str:
        """Look up a recording ID and return its file path."""
        # Check the registry
        if recording_id in self._recordings:
            fpath = self._recordings[recording_id]
            if os.path.exists(fpath):
                return fpath

        # Maybe the ID is a direct file path
        if os.path.exists(recording_id):
            return recording_id

        raise HTTPException(
            status_code=404,
            detail=f"Recording not found: {recording_id}",
        )

    # ------------------------------------------------------------------
    # MCP tools
    # ------------------------------------------------------------------

    def get_mcp_tools(self) -> List[Dict[str, Any]]:
        return [
            {
                "name": "storage.save_recording",
                "description": (
                    "Start saving neural recording data to an HDF5 file. "
                    "Configurable device name, experiment mode, and sample rate."
                ),
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "device_name": {
                            "type": "string",
                            "description": "Recording device name",
                            "default": "CNEAv5",
                        },
                        "experiment_mode": {
                            "type": "string",
                            "description": "Experiment mode label",
                            "default": "Device_Test",
                        },
                        "sample_rate": {
                            "type": "number",
                            "description": "Sample rate in Hz",
                            "default": 10000.0,
                        },
                        "compression": {
                            "type": "boolean",
                            "description": "Enable gzip compression",
                            "default": True,
                        },
                    },
                },
            },
            {
                "name": "storage.stop_saving",
                "description": "Stop the current recording and close the HDF5 file.",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "recording_id": {
                            "type": "string",
                            "description": "Recording ID to stop (optional, stops current)",
                        },
                    },
                },
            },
            {
                "name": "storage.export_data",
                "description": (
                    "Export a neural recording to CSV, MATLAB (.mat), or "
                    "NWB format.  Supports channel subset selection."
                ),
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "recording_id": {
                            "type": "string",
                            "description": "Recording ID to export",
                        },
                        "format": {
                            "type": "string",
                            "enum": ["csv", "mat", "nwb"],
                            "description": "Export format",
                        },
                        "channels": {
                            "type": "array",
                            "items": {"type": "integer"},
                            "description": "Channel indices to export (default: all)",
                        },
                    },
                    "required": ["recording_id", "format"],
                },
            },
            {
                "name": "storage.query_recordings",
                "description": (
                    "Query stored neural recordings with optional filtering "
                    "by device name and date."
                ),
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "device": {
                            "type": "string",
                            "description": "Filter by device name",
                        },
                        "date": {
                            "type": "string",
                            "description": "Filter by date string (e.g. '2025_10_18')",
                        },
                        "limit": {
                            "type": "integer",
                            "description": "Maximum results to return",
                            "default": 50,
                        },
                    },
                },
            },
            {
                "name": "storage.get_recording_metadata",
                "description": "Retrieve full metadata for a specific neural recording.",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "recording_id": {
                            "type": "string",
                            "description": "Recording ID",
                        },
                    },
                    "required": ["recording_id"],
                },
            },
            {
                "name": "storage.get_storage_stats",
                "description": (
                    "Get storage statistics: disk usage, file counts, "
                    "date ranges for all recordings."
                ),
                "input_schema": {
                    "type": "object",
                    "properties": {},
                },
            },
        ]


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------


def main() -> None:
    agent = StorageAgent()
    agent.run()


if __name__ == "__main__":
    main()
