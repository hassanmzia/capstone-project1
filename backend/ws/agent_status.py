"""
WebSocket consumer for agent health / status updates.

Pushes real-time agent lifecycle events (started, healthy, degraded,
stopped, error) to connected dashboard clients.
"""

import json
import logging

from channels.generic.websocket import AsyncWebsocketConsumer

logger = logging.getLogger(__name__)

AGENT_STATUS_GROUP = "agent_status_updates"


class AgentStatusConsumer(AsyncWebsocketConsumer):
    """Async WebSocket consumer for agent status updates."""

    async def connect(self):
        """Accept the connection and join the agent-status broadcast group."""
        self.group_name = AGENT_STATUS_GROUP

        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()
        logger.info("Agent status WebSocket connected: %s", self.channel_name)

    async def disconnect(self, close_code):
        """Leave the broadcast group on disconnect."""
        await self.channel_layer.group_discard(self.group_name, self.channel_name)
        logger.info(
            "Agent status WebSocket disconnected: %s (code=%s)",
            self.channel_name,
            close_code,
        )

    async def receive(self, text_data=None, bytes_data=None):
        """
        Handle incoming messages from the client.

        Clients may request a full status snapshot or subscribe to
        specific agent IDs. Expand as needed.
        """
        if text_data:
            try:
                payload = json.loads(text_data)
                msg_type = payload.get("type", "unknown")
                logger.debug("Agent status WS received: %s", msg_type)
                # TODO: handle status snapshot requests, agent subscriptions.
            except json.JSONDecodeError:
                await self.send(
                    text_data=json.dumps({"error": "Invalid JSON payload"})
                )

    # ── Group message handlers ───────────────────────────────────────────

    async def agent_status_message(self, event):
        """
        Forward an agent-status update from the channel layer to the client.

        Called when another part of the application does:
            channel_layer.group_send(group, {"type": "agent.status.message", ...})
        """
        await self.send(text_data=json.dumps(event.get("data", {})))
