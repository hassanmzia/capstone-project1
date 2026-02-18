"""
Notification Agent.

Handles alerts, emails, webhooks, and push notifications triggered
by other agents or system events.
"""

import os
from typing import Any, Dict, List

from agents.base_agent import BaseAgent


class NotificationAgent(BaseAgent):
    """Agent that dispatches notifications across channels."""

    def __init__(self):
        super().__init__(
            agent_name=os.getenv("AGENT_NAME", "notification"),
            agent_port=int(os.getenv("AGENT_PORT", "8093")),
            agent_type="notification",
        )
        self._register_routes()

    def _register_routes(self) -> None:
        @self.app.post("/notify")
        async def send_notification(payload: Dict[str, Any] = {}):
            """Send a notification through the specified channel."""
            return {"status": "sent", "agent": self.agent_name}

    # ------------------------------------------------------------------
    # MCP tools
    # ------------------------------------------------------------------

    def get_mcp_tools(self) -> List[Dict[str, Any]]:
        return [
            {
                "name": "notification.send_alert",
                "description": "Send an alert about a neural interface event (e.g. impedance change, signal loss, stimulation fault).",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "severity": {"type": "string", "enum": ["info", "warning", "critical"], "description": "Alert severity level"},
                        "message": {"type": "string", "description": "Alert message body"},
                        "source_agent": {"type": "string", "description": "Agent that triggered the alert"},
                    },
                    "required": ["severity", "message"],
                },
            },
            {
                "name": "notification.set_threshold_alert",
                "description": "Configure an automatic alert when a neural signal metric crosses a threshold.",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "metric": {"type": "string", "description": "Metric to monitor (e.g. spike_rate, impedance, snr)"},
                        "threshold": {"type": "number", "description": "Threshold value"},
                        "direction": {"type": "string", "enum": ["above", "below"], "description": "Trigger when metric goes above or below threshold"},
                        "channel": {"type": "integer", "description": "Channel to monitor, or -1 for all"},
                    },
                    "required": ["metric", "threshold", "direction"],
                },
            },
            {
                "name": "notification.get_system_health",
                "description": "Get a health summary of all neural interface subsystems.",
                "input_schema": {
                    "type": "object",
                    "properties": {},
                },
            },
            {
                "name": "notification.log_event",
                "description": "Log an experiment event or annotation with a timestamp.",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "event_type": {"type": "string", "description": "Event category (e.g. stimulation_start, recording_pause, impedance_check)"},
                        "details": {"type": "object", "description": "Additional event details"},
                        "session_id": {"type": "string", "description": "Associated recording session ID"},
                    },
                    "required": ["event_type"],
                },
            },
        ]


def main() -> None:
    agent = NotificationAgent()
    agent.run()


if __name__ == "__main__":
    main()
