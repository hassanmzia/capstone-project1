"""
WebSocket consumer for real-time spike event streaming.

Streams spike detection events to connected clients for heatmap
visualization and spike rate computation.
"""

import json
import logging

from channels.generic.websocket import AsyncWebsocketConsumer

logger = logging.getLogger(__name__)

SPIKE_EVENTS_GROUP = "spike_events_stream"


class SpikeEventConsumer(AsyncWebsocketConsumer):
    """Async WebSocket consumer for real-time spike events."""

    async def connect(self):
        """Accept the connection and join the spike-events broadcast group."""
        self.group_name = SPIKE_EVENTS_GROUP

        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()
        logger.info("Spike events WebSocket connected: %s", self.channel_name)

    async def disconnect(self, close_code):
        """Leave the broadcast group on disconnect."""
        await self.channel_layer.group_discard(self.group_name, self.channel_name)
        logger.info(
            "Spike events WebSocket disconnected: %s (code=%s)",
            self.channel_name,
            close_code,
        )

    async def receive(self, text_data=None, bytes_data=None):
        """Handle incoming messages from the client (e.g. filter controls)."""
        if text_data:
            try:
                payload = json.loads(text_data)
                msg_type = payload.get("type", "unknown")
                logger.debug("Spike events WS received: %s", msg_type)
            except json.JSONDecodeError:
                await self.send(
                    text_data=json.dumps({"error": "Invalid JSON payload"})
                )

    # ── Group message handlers ───────────────────────────────────────────

    async def spike_event_message(self, event):
        """
        Forward a spike event from the channel layer to the client.

        Called when another part of the application does:
            channel_layer.group_send(group, {"type": "spike.event.message", ...})
        """
        await self.send(text_data=json.dumps(event.get("data", {})))
