"""
Signal Processing Agent.

Provides filtering, FFT, feature extraction, and other DSP operations
on incoming data streams.
"""

import os
from typing import Any, Dict, List

from agents.base_agent import BaseAgent


class SignalProcessingAgent(BaseAgent):
    """Agent that handles signal processing tasks."""

    def __init__(self):
        super().__init__(
            agent_name=os.getenv("AGENT_NAME", "signal_processing"),
            agent_port=int(os.getenv("AGENT_PORT", "8089")),
            agent_type="signal_processing",
        )
        self._register_routes()

    def _register_routes(self) -> None:
        @self.app.post("/process")
        async def process_signal(payload: Dict[str, Any] = {}):
            """Run a signal-processing pipeline on the supplied data."""
            return {"status": "processed", "agent": self.agent_name}

    # ------------------------------------------------------------------
    # MCP tools
    # ------------------------------------------------------------------

    def get_mcp_tools(self) -> List[Dict[str, Any]]:
        return [
            {
                "name": "signal_processing.detect_spikes",
                "description": "Detect neural spikes in a recorded signal using threshold crossing.",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "channel": {"type": "integer", "description": "Channel index to analyse"},
                        "threshold_uv": {"type": "number", "description": "Spike detection threshold in microvolts"},
                        "refractory_ms": {"type": "number", "description": "Refractory period in milliseconds"},
                    },
                    "required": ["channel", "threshold_uv"],
                },
            },
            {
                "name": "signal_processing.compute_fft",
                "description": "Compute the FFT of a neural signal for spectral analysis.",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "channel": {"type": "integer", "description": "Channel index"},
                        "window_ms": {"type": "number", "description": "FFT window size in milliseconds"},
                        "sample_rate_hz": {"type": "number", "description": "Sampling rate in Hz"},
                    },
                    "required": ["channel"],
                },
            },
            {
                "name": "signal_processing.filter_signal",
                "description": "Apply a digital filter to neural recording data.",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "channel": {"type": "integer", "description": "Channel index"},
                        "filter_type": {"type": "string", "enum": ["lowpass", "highpass", "bandpass", "notch"]},
                        "low_cutoff_hz": {"type": "number", "description": "Low cutoff frequency in Hz"},
                        "high_cutoff_hz": {"type": "number", "description": "High cutoff frequency in Hz"},
                        "order": {"type": "integer", "description": "Filter order", "default": 4},
                    },
                    "required": ["channel", "filter_type"],
                },
            },
            {
                "name": "signal_processing.compute_statistics",
                "description": "Compute statistical metrics (RMS, SNR, kurtosis) on a neural channel.",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "channel": {"type": "integer", "description": "Channel index"},
                        "window_ms": {"type": "number", "description": "Analysis window in milliseconds"},
                    },
                    "required": ["channel"],
                },
            },
            {
                "name": "signal_processing.reduce_noise",
                "description": "Apply noise reduction to neural signals using common average referencing or wavelet denoising.",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "channels": {"type": "array", "items": {"type": "integer"}, "description": "List of channel indices"},
                        "method": {"type": "string", "enum": ["car", "wavelet", "median"], "description": "Noise reduction method"},
                    },
                    "required": ["channels", "method"],
                },
            },
        ]


def main() -> None:
    agent = SignalProcessingAgent()
    agent.run()


if __name__ == "__main__":
    main()
