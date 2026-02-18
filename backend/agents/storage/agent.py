"""
Storage Agent.

Manages persistence of experiment data, results, and metadata across
databases (Postgres, TimescaleDB) and object storage (MinIO / S3).
"""

import os
from typing import Any, Dict, List

from agents.base_agent import BaseAgent


class StorageAgent(BaseAgent):
    """Agent responsible for data storage and retrieval."""

    def __init__(self):
        super().__init__(
            agent_name=os.getenv("AGENT_NAME", "storage"),
            agent_port=int(os.getenv("AGENT_PORT", "8091")),
            agent_type="storage",
        )
        self._register_routes()

    def _register_routes(self) -> None:
        @self.app.post("/store")
        async def store_data(payload: Dict[str, Any] = {}):
            """Persist data to the configured backend."""
            return {"status": "stored", "agent": self.agent_name}

        @self.app.post("/query")
        async def query_data(payload: Dict[str, Any] = {}):
            """Query stored data."""
            return {"status": "queried", "agent": self.agent_name, "results": []}

    # ------------------------------------------------------------------
    # MCP tools
    # ------------------------------------------------------------------

    def get_mcp_tools(self) -> List[Dict[str, Any]]:
        return [
            {
                "name": "storage.save_recording",
                "description": "Save a neural recording session to persistent storage.",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "session_id": {"type": "string", "description": "Recording session ID"},
                        "format": {"type": "string", "enum": ["nwb", "hdf5", "raw"], "description": "Storage file format"},
                        "compression": {"type": "boolean", "description": "Enable compression", "default": True},
                    },
                    "required": ["session_id"],
                },
            },
            {
                "name": "storage.export_data",
                "description": "Export neural data to an external format for analysis or sharing.",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "session_id": {"type": "string", "description": "Recording session ID"},
                        "format": {"type": "string", "enum": ["csv", "mat", "nwb", "parquet"], "description": "Export format"},
                        "channels": {"type": "array", "items": {"type": "integer"}, "description": "Channels to export"},
                    },
                    "required": ["session_id", "format"],
                },
            },
            {
                "name": "storage.query_recordings",
                "description": "Query stored neural recordings by date, subject, or experiment metadata.",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "filters": {"type": "object", "description": "Query filters (e.g. date_range, subject_id, experiment_type)"},
                        "limit": {"type": "integer", "default": 50, "description": "Maximum results to return"},
                    },
                },
            },
            {
                "name": "storage.get_recording_metadata",
                "description": "Retrieve metadata for a specific neural recording session.",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "session_id": {"type": "string", "description": "Recording session ID"},
                    },
                    "required": ["session_id"],
                },
            },
            {
                "name": "storage.manage_storage",
                "description": "Manage storage quotas, retention policies, and disk usage for neural data.",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "action": {"type": "string", "enum": ["check_usage", "set_retention", "archive", "purge"], "description": "Storage management action"},
                        "target": {"type": "string", "description": "Target session or collection ID"},
                    },
                    "required": ["action"],
                },
            },
        ]


def main() -> None:
    agent = StorageAgent()
    agent.run()


if __name__ == "__main__":
    main()
