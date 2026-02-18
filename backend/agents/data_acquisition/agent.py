"""
Data Acquisition Agent.

Responsible for fetching, ingesting, and validating raw data from
external sensors, APIs, and file uploads.
"""

import os
from typing import Any, Dict, List

from agents.base_agent import BaseAgent


class DataAcquisitionAgent(BaseAgent):
    """Agent that handles data acquisition tasks."""

    def __init__(self):
        super().__init__(
            agent_name=os.getenv("AGENT_NAME", "data_acquisition"),
            agent_port=int(os.getenv("AGENT_PORT", "8088")),
            agent_type="data_acquisition",
        )
        self._register_routes()

    # ------------------------------------------------------------------
    # Routes
    # ------------------------------------------------------------------

    def _register_routes(self) -> None:
        @self.app.post("/ingest")
        async def ingest_data(payload: Dict[str, Any] = {}):
            """Ingest raw data from an external source."""
            return {"status": "accepted", "agent": self.agent_name}

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
                        "channel_mask": {"type": "integer", "description": "Bitmask of channels to record"},
                        "sample_rate_hz": {"type": "number", "description": "Sampling rate in Hz"},
                    },
                    "required": ["channel_mask"],
                },
            },
            {
                "name": "data_acquisition.stop_recording",
                "description": "Stop the current neural data recording session.",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "session_id": {"type": "string", "description": "Active recording session ID"},
                    },
                    "required": ["session_id"],
                },
            },
            {
                "name": "data_acquisition.get_stream_status",
                "description": "Get the status of the live neural data stream.",
                "input_schema": {
                    "type": "object",
                    "properties": {},
                },
            },
            {
                "name": "data_acquisition.configure_ddr3",
                "description": "Configure the DDR3 memory buffer for high-speed neural data capture.",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "buffer_size_mb": {"type": "integer", "description": "Buffer size in megabytes"},
                        "mode": {"type": "string", "enum": ["circular", "linear"], "description": "Buffer write mode"},
                    },
                    "required": ["buffer_size_mb"],
                },
            },
            {
                "name": "data_acquisition.read_fpga_data",
                "description": "Read raw data frames from the FPGA acquisition pipeline.",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "num_frames": {"type": "integer", "description": "Number of frames to read"},
                        "channel": {"type": "integer", "description": "Specific channel index, or -1 for all"},
                    },
                    "required": ["num_frames"],
                },
            },
        ]


def main() -> None:
    agent = DataAcquisitionAgent()
    agent.run()


if __name__ == "__main__":
    main()
