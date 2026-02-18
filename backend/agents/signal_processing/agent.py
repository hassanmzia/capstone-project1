"""
Signal Processing Agent.

Provides filtering, FFT, spike detection, noise reduction, and
statistical analysis on incoming neural data streams from the CNEA v5
electrode array (4096 channels, 512-sample batches).

Extends :class:`BaseAgent` and runs on port 8089.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import time
from typing import Any, Dict, List, Optional

import numpy as np
from fastapi import HTTPException
from pydantic import BaseModel, Field

from agents.base_agent import BaseAgent

from .fft_analyzer import FFTAnalyzer
from .filters import SignalFilter
from .noise_reduction import NoiseReducer
from .spike_detector import SpikeDetector

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

NUM_CHANNELS = 4096
BATCH_SAMPLES = 512
DEFAULT_SAMPLE_RATE = 10_000.0  # 10 kHz

# ---------------------------------------------------------------------------
# Pydantic request / response models
# ---------------------------------------------------------------------------


class DetectSpikesRequest(BaseModel):
    """Request body for ``POST /detect-spikes``."""
    data: Optional[List[List[float]]] = Field(
        None,
        description="Optional inline data (channels x samples).  "
                    "If omitted the latest Redis buffer is used.",
    )
    sigma: float = Field(5.0, ge=1.0, le=10.0, description="Threshold multiplier (sigma)")
    window_size: int = Field(512, gt=0, description="Detection window size in samples")
    return_events: bool = Field(False, description="Return individual spike events")


class DetectSpikesResponse(BaseModel):
    spike_counts: List[float]
    total_spikes: int
    sigma: float
    window_size: int
    events: Optional[List[Dict[str, Any]]] = None


class ComputeFFTRequest(BaseModel):
    data: Optional[List[List[float]]] = None
    channels: Optional[List[int]] = Field(None, description="Channel indices to analyse")
    sample_rate: float = Field(DEFAULT_SAMPLE_RATE, gt=0)


class ComputeFFTResponse(BaseModel):
    frequencies: List[float]
    magnitudes: Dict[str, List[float]]
    num_channels: int
    sample_rate: float


class FilterSignalRequest(BaseModel):
    data: Optional[List[List[float]]] = None
    filter_type: str = Field(..., pattern="^(bandpass|highpass|lowpass|notch)$")
    low_freq: Optional[float] = Field(None, description="Low cutoff (Hz) for bandpass")
    high_freq: Optional[float] = Field(None, description="High cutoff (Hz) for bandpass")
    cutoff: Optional[float] = Field(None, description="Cutoff (Hz) for highpass / lowpass")
    freq: Optional[float] = Field(None, description="Notch centre frequency (Hz)")
    quality_factor: float = Field(30.0, gt=0, description="Notch quality factor Q")
    order: int = Field(4, ge=1, le=10, description="Butterworth filter order")
    sample_rate: float = Field(DEFAULT_SAMPLE_RATE, gt=0)


class FilterSignalResponse(BaseModel):
    filter_type: str
    num_channels: int
    num_samples: int
    sample_rate: float
    data: Optional[List[List[float]]] = Field(
        None,
        description="Filtered data (only if input was inline)",
    )
    message: str = "Filter applied successfully"


class ComputeStatisticsRequest(BaseModel):
    data: Optional[List[List[float]]] = None
    channels: Optional[List[int]] = None
    sample_rate: float = Field(DEFAULT_SAMPLE_RATE, gt=0)


class ChannelStatistics(BaseModel):
    channel: int
    rms: float
    mean: float
    std: float
    snr_db: float
    noise_floor: float
    min_val: float
    max_val: float
    peak_to_peak: float


class ComputeStatisticsResponse(BaseModel):
    statistics: List[ChannelStatistics]
    num_channels: int


class ReduceNoiseRequest(BaseModel):
    data: Optional[List[List[float]]] = None
    method: str = Field("car", pattern="^(car|median|artifact|moving_average|full)$")
    artifact_threshold: float = Field(10.0, gt=0)
    smooth_window: int = Field(5, ge=1)


class ReduceNoiseResponse(BaseModel):
    method: str
    steps_applied: List[str]
    artifact_count: int
    num_channels: int
    num_samples: int
    data: Optional[List[List[float]]] = None
    message: str = "Noise reduction applied successfully"


# ---------------------------------------------------------------------------
# Agent
# ---------------------------------------------------------------------------


class SignalProcessingAgent(BaseAgent):
    """Agent that handles signal processing tasks."""

    def __init__(self) -> None:
        super().__init__(
            agent_name=os.getenv("AGENT_NAME", "signal_processing"),
            agent_port=int(os.getenv("AGENT_PORT", "8089")),
            agent_type="signal_processing",
        )

        # Processing modules
        self.spike_detector = SpikeDetector(
            sigma=5.0,
            window_size=BATCH_SAMPLES,
            sample_rate=DEFAULT_SAMPLE_RATE,
        )
        self.signal_filter = SignalFilter(
            default_order=4,
            default_sample_rate=DEFAULT_SAMPLE_RATE,
        )
        self.fft_analyzer = FFTAnalyzer(default_sample_rate=DEFAULT_SAMPLE_RATE)
        self.noise_reducer = NoiseReducer(num_channels=NUM_CHANNELS)

        # Latest data buffer (populated via Redis subscriber)
        self._latest_data: Optional[np.ndarray] = None
        self._latest_timestamp: float = 0.0

        # Background tasks
        self._subscriber_task: Optional[asyncio.Task] = None
        self._processing_loop_task: Optional[asyncio.Task] = None
        self._processing_enabled: bool = True

        self._register_routes()

    # ------------------------------------------------------------------
    # Lifecycle overrides
    # ------------------------------------------------------------------

    async def start(self) -> None:
        await super().start()
        # Start Redis subscriber and background processing
        self._subscriber_task = asyncio.create_task(self._redis_subscriber())
        self._processing_loop_task = asyncio.create_task(self._background_processing_loop())
        logger.info("Signal Processing Agent started -- subscriber and processing loop active.")

    async def stop(self) -> None:
        self._processing_enabled = False
        for task in (self._subscriber_task, self._processing_loop_task):
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
        """Listen to ``neural:raw_data`` and cache the latest frame."""
        try:
            pubsub = self.redis.pubsub()
            await pubsub.subscribe("neural:raw_data")
            logger.info("Subscribed to neural:raw_data")

            async for message in pubsub.listen():
                if message["type"] != "message":
                    continue
                try:
                    payload = json.loads(message["data"])
                    if "data" in payload:
                        arr = np.array(payload["data"], dtype=np.float64)
                        if arr.ndim == 2:
                            self._latest_data = arr
                        elif arr.ndim == 1:
                            # Attempt reshape to (NUM_CHANNELS, BATCH_SAMPLES)
                            total = arr.size
                            if total == NUM_CHANNELS * BATCH_SAMPLES:
                                self._latest_data = arr.reshape(NUM_CHANNELS, BATCH_SAMPLES)
                            else:
                                self._latest_data = arr.reshape(1, -1)
                        self._latest_timestamp = time.time()
                except Exception as exc:
                    logger.warning("Failed to parse raw_data message: %s", exc)
        except asyncio.CancelledError:
            logger.info("Redis subscriber cancelled.")
        except Exception as exc:
            logger.error("Redis subscriber error: %s", exc)

    # ------------------------------------------------------------------
    # Background processing loop
    # ------------------------------------------------------------------

    async def _background_processing_loop(self) -> None:
        """Continuously process incoming data and publish results."""
        last_processed: float = 0.0
        try:
            while self._processing_enabled:
                await asyncio.sleep(0.05)  # 50 ms poll interval

                if self._latest_data is None:
                    continue
                if self._latest_timestamp <= last_processed:
                    continue

                data = self._latest_data
                last_processed = self._latest_timestamp

                try:
                    # Run spike detection
                    result = self.spike_detector.detect(data)

                    # Publish processed data
                    processed_payload = json.dumps({
                        "timestamp": last_processed,
                        "num_channels": int(data.shape[0]),
                        "num_samples": int(data.shape[1]),
                        "spike_total": result.total_spikes,
                    })
                    await self.redis.publish("neural:processed_data", processed_payload)

                    # Publish spike events if any
                    if result.total_spikes > 0:
                        spike_payload = json.dumps({
                            "timestamp": last_processed,
                            "spike_counts": result.spike_counts.tolist(),
                            "total_spikes": result.total_spikes,
                            "sigma": result.sigma,
                        })
                        await self.redis.publish("neural:spike_events", spike_payload)

                except Exception as exc:
                    logger.error("Background processing error: %s", exc)

        except asyncio.CancelledError:
            logger.info("Background processing loop cancelled.")

    # ------------------------------------------------------------------
    # Helper: get data from request or buffer
    # ------------------------------------------------------------------

    def _get_data(self, inline_data: Optional[List[List[float]]]) -> np.ndarray:
        """Resolve data from the request body or the internal buffer."""
        if inline_data is not None:
            return np.array(inline_data, dtype=np.float64)
        if self._latest_data is not None:
            return self._latest_data.copy()
        raise HTTPException(
            status_code=400,
            detail="No data provided and no buffered data available.  "
                   "Pass 'data' in the request body or ensure the Redis stream is active.",
        )

    # ------------------------------------------------------------------
    # Routes
    # ------------------------------------------------------------------

    def _register_routes(self) -> None:

        # -- Spike Detection -----------------------------------------------

        @self.app.post("/detect-spikes", response_model=DetectSpikesResponse)
        async def detect_spikes(req: DetectSpikesRequest) -> DetectSpikesResponse:
            """Run spike detection with configurable threshold."""
            data = self._get_data(req.data)
            result = self.spike_detector.detect(
                data,
                sigma=req.sigma,
                window_size=req.window_size,
                return_events=req.return_events,
            )
            events = None
            if req.return_events:
                events = [
                    {
                        "site_id": e.site_id,
                        "amplitude": e.amplitude,
                        "timestamp_sample": e.timestamp_sample,
                        "threshold_used": e.threshold_used,
                        "polarity": e.polarity,
                    }
                    for e in result.events
                ]
            return DetectSpikesResponse(
                spike_counts=result.spike_counts.tolist(),
                total_spikes=result.total_spikes,
                sigma=result.sigma,
                window_size=result.window_size,
                events=events,
            )

        # -- FFT -----------------------------------------------------------

        @self.app.post("/compute-fft", response_model=ComputeFFTResponse)
        async def compute_fft(req: ComputeFFTRequest) -> ComputeFFTResponse:
            """Frequency-domain analysis on selected channels."""
            data = self._get_data(req.data)
            result = self.fft_analyzer.compute_fft(
                data,
                sample_rate=req.sample_rate,
                channels=req.channels,
            )
            return ComputeFFTResponse(
                frequencies=result["frequencies"],
                magnitudes=result["magnitudes"],
                num_channels=result["num_channels"],
                sample_rate=result["sample_rate"],
            )

        # -- Filter --------------------------------------------------------

        @self.app.post("/filter-signal", response_model=FilterSignalResponse)
        async def filter_signal(req: FilterSignalRequest) -> FilterSignalResponse:
            """Apply bandpass / notch / lowpass / highpass filters."""
            data = self._get_data(req.data)

            if req.filter_type == "bandpass":
                if req.low_freq is None or req.high_freq is None:
                    raise HTTPException(
                        status_code=400,
                        detail="bandpass requires 'low_freq' and 'high_freq'",
                    )
                filtered = self.signal_filter.bandpass(
                    data, req.low_freq, req.high_freq,
                    sample_rate=req.sample_rate, order=req.order,
                )
            elif req.filter_type == "highpass":
                if req.cutoff is None:
                    raise HTTPException(status_code=400, detail="highpass requires 'cutoff'")
                filtered = self.signal_filter.highpass(
                    data, req.cutoff,
                    sample_rate=req.sample_rate, order=req.order,
                )
            elif req.filter_type == "lowpass":
                if req.cutoff is None:
                    raise HTTPException(status_code=400, detail="lowpass requires 'cutoff'")
                filtered = self.signal_filter.lowpass(
                    data, req.cutoff,
                    sample_rate=req.sample_rate, order=req.order,
                )
            elif req.filter_type == "notch":
                if req.freq is None:
                    raise HTTPException(status_code=400, detail="notch requires 'freq'")
                filtered = self.signal_filter.notch(
                    data, req.freq,
                    sample_rate=req.sample_rate,
                    quality_factor=req.quality_factor,
                )
            else:
                raise HTTPException(status_code=400, detail=f"Unknown filter type: {req.filter_type}")

            response_data = filtered.tolist() if req.data is not None else None

            # Publish filtered data to Redis
            if self.redis:
                try:
                    pub_payload = json.dumps({
                        "timestamp": time.time(),
                        "filter_type": req.filter_type,
                        "num_channels": int(filtered.shape[0]) if filtered.ndim == 2 else 1,
                        "num_samples": int(filtered.shape[-1]),
                    })
                    await self.redis.publish("neural:processed_data", pub_payload)
                except Exception as exc:
                    logger.warning("Failed to publish filtered data: %s", exc)

            return FilterSignalResponse(
                filter_type=req.filter_type,
                num_channels=int(filtered.shape[0]) if filtered.ndim == 2 else 1,
                num_samples=int(filtered.shape[-1]),
                sample_rate=req.sample_rate,
                data=response_data,
                message=f"{req.filter_type} filter applied successfully",
            )

        # -- Statistics ----------------------------------------------------

        @self.app.post("/compute-statistics", response_model=ComputeStatisticsResponse)
        async def compute_statistics(req: ComputeStatisticsRequest) -> ComputeStatisticsResponse:
            """Compute RMS, SNR, noise floor per channel."""
            data = self._get_data(req.data)
            if data.ndim == 1:
                data = data.reshape(1, -1)

            if req.channels is not None:
                channels = req.channels
                data_subset = data[channels, :]
            else:
                channels = list(range(data.shape[0]))
                data_subset = data

            stats_list: List[ChannelStatistics] = []
            for i, ch in enumerate(channels):
                ch_data = data_subset[i].astype(np.float64)
                mean_val = float(np.mean(ch_data))
                std_val = float(np.std(ch_data))
                rms = float(np.sqrt(np.mean(ch_data ** 2)))
                min_val = float(np.min(ch_data))
                max_val = float(np.max(ch_data))
                p2p = max_val - min_val

                # SNR: ratio of signal RMS to noise floor (std)
                noise_floor = std_val
                if noise_floor > 1e-12:
                    snr_db = float(20.0 * np.log10(rms / noise_floor))
                else:
                    snr_db = 0.0

                stats_list.append(
                    ChannelStatistics(
                        channel=ch,
                        rms=round(rms, 6),
                        mean=round(mean_val, 6),
                        std=round(std_val, 6),
                        snr_db=round(snr_db, 2),
                        noise_floor=round(noise_floor, 6),
                        min_val=round(min_val, 6),
                        max_val=round(max_val, 6),
                        peak_to_peak=round(p2p, 6),
                    )
                )

            return ComputeStatisticsResponse(
                statistics=stats_list,
                num_channels=len(stats_list),
            )

        # -- Noise Reduction -----------------------------------------------

        @self.app.post("/reduce-noise", response_model=ReduceNoiseResponse)
        async def reduce_noise(req: ReduceNoiseRequest) -> ReduceNoiseResponse:
            """Apply common-mode subtraction and/or artifact removal."""
            data = self._get_data(req.data)

            if req.method == "car":
                cleaned = self.noise_reducer.common_mode_rejection(data)
                steps = ["common_mode_rejection"]
                artifact_count = 0
            elif req.method == "median":
                cleaned = self.noise_reducer.median_reference(data)
                steps = ["median_reference"]
                artifact_count = 0
            elif req.method == "artifact":
                cleaned = self.noise_reducer.artifact_removal(
                    data, threshold=req.artifact_threshold,
                )
                steps = [f"artifact_removal(threshold={req.artifact_threshold})"]
                artifact_count = int(np.sum(data != cleaned))
            elif req.method == "moving_average":
                cleaned = self.noise_reducer.moving_average(
                    data, window_size=req.smooth_window,
                )
                steps = [f"moving_average(window={req.smooth_window})"]
                artifact_count = 0
            elif req.method == "full":
                result = self.noise_reducer.reduce(
                    data,
                    car=True,
                    artifact_threshold=req.artifact_threshold,
                    smooth_window=req.smooth_window,
                )
                cleaned = result["data"]
                steps = result["steps_applied"]
                artifact_count = result["artifact_count"]
            else:
                raise HTTPException(status_code=400, detail=f"Unknown method: {req.method}")

            if cleaned.ndim == 1:
                cleaned = cleaned.reshape(1, -1)

            response_data = cleaned.tolist() if req.data is not None else None

            # Publish reduced data
            if self.redis:
                try:
                    pub_payload = json.dumps({
                        "timestamp": time.time(),
                        "method": req.method,
                        "steps_applied": steps,
                        "num_channels": int(cleaned.shape[0]),
                    })
                    await self.redis.publish("neural:processed_data", pub_payload)
                except Exception as exc:
                    logger.warning("Failed to publish noise-reduced data: %s", exc)

            return ReduceNoiseResponse(
                method=req.method,
                steps_applied=steps,
                artifact_count=artifact_count,
                num_channels=int(cleaned.shape[0]),
                num_samples=int(cleaned.shape[1]),
                data=response_data,
                message=f"Noise reduction ({req.method}) applied successfully",
            )

    # ------------------------------------------------------------------
    # MCP tools
    # ------------------------------------------------------------------

    def get_mcp_tools(self) -> List[Dict[str, Any]]:
        return [
            {
                "name": "signal_processing.detect_spikes",
                "description": (
                    "Detect neural spikes using window-based threshold crossing. "
                    "Configurable sigma (1-10) controls sensitivity."
                ),
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "sigma": {
                            "type": "number",
                            "description": "Threshold multiplier (default 5)",
                            "default": 5.0,
                        },
                        "window_size": {
                            "type": "integer",
                            "description": "Detection window in samples (default 512)",
                            "default": 512,
                        },
                        "return_events": {
                            "type": "boolean",
                            "description": "Include individual spike event details",
                            "default": False,
                        },
                    },
                },
            },
            {
                "name": "signal_processing.compute_fft",
                "description": (
                    "Compute the FFT (frequency spectrum) of neural channels. "
                    "Returns frequencies and magnitude arrays."
                ),
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "channels": {
                            "type": "array",
                            "items": {"type": "integer"},
                            "description": "Channel indices to analyse (default: all)",
                        },
                        "sample_rate": {
                            "type": "number",
                            "description": "Sampling rate in Hz",
                            "default": 10000.0,
                        },
                    },
                },
            },
            {
                "name": "signal_processing.filter_signal",
                "description": (
                    "Apply a digital filter (bandpass, highpass, lowpass, notch) "
                    "to neural recording data."
                ),
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "filter_type": {
                            "type": "string",
                            "enum": ["lowpass", "highpass", "bandpass", "notch"],
                            "description": "Type of filter to apply",
                        },
                        "low_freq": {
                            "type": "number",
                            "description": "Low cutoff frequency in Hz (for bandpass)",
                        },
                        "high_freq": {
                            "type": "number",
                            "description": "High cutoff frequency in Hz (for bandpass)",
                        },
                        "cutoff": {
                            "type": "number",
                            "description": "Cutoff frequency in Hz (for highpass/lowpass)",
                        },
                        "freq": {
                            "type": "number",
                            "description": "Notch centre frequency in Hz",
                        },
                        "order": {
                            "type": "integer",
                            "description": "Filter order (default 4)",
                            "default": 4,
                        },
                        "sample_rate": {
                            "type": "number",
                            "description": "Sampling rate in Hz",
                            "default": 10000.0,
                        },
                    },
                    "required": ["filter_type"],
                },
            },
            {
                "name": "signal_processing.compute_statistics",
                "description": (
                    "Compute statistical metrics (RMS, SNR, noise floor, "
                    "peak-to-peak) for neural channels."
                ),
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "channels": {
                            "type": "array",
                            "items": {"type": "integer"},
                            "description": "Channel indices (default: all)",
                        },
                        "sample_rate": {
                            "type": "number",
                            "description": "Sampling rate in Hz",
                            "default": 10000.0,
                        },
                    },
                },
            },
            {
                "name": "signal_processing.reduce_noise",
                "description": (
                    "Apply noise reduction to neural signals using common "
                    "average referencing (CAR), median reference, artifact "
                    "removal, or temporal smoothing."
                ),
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "method": {
                            "type": "string",
                            "enum": ["car", "median", "artifact", "moving_average", "full"],
                            "description": "Noise reduction method",
                        },
                        "artifact_threshold": {
                            "type": "number",
                            "description": "Artifact detection threshold (sigma)",
                            "default": 10.0,
                        },
                        "smooth_window": {
                            "type": "integer",
                            "description": "Moving average window size",
                            "default": 5,
                        },
                    },
                    "required": ["method"],
                },
            },
        ]


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------


def main() -> None:
    agent = SignalProcessingAgent()
    agent.run()


if __name__ == "__main__":
    main()
