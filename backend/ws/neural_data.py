"""
WebSocket consumer for real-time neural data streaming.

Streams neural recording data to connected clients. Designed to be
expanded with channel-layer group broadcasting from recording workers.
"""

import json
import logging

from channels.generic.websocket import AsyncWebsocketConsumer

logger = logging.getLogger(__name__)

NEURAL_DATA_GROUP = "neural_data_stream"


class NeuralDataConsumer(AsyncWebsocketConsumer):
    """Async WebSocket consumer for real-time neural data."""

    async def connect(self):
        """Accept the connection and join the neural-data broadcast group."""
        self.group_name = NEURAL_DATA_GROUP

        # Join the broadcast group so backend workers can push data.
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()
        logger.info("Neural data WebSocket connected: %s", self.channel_name)

    async def disconnect(self, close_code):
        """Leave the broadcast group on disconnect."""
        await self.channel_layer.group_discard(self.group_name, self.channel_name)
        logger.info(
            "Neural data WebSocket disconnected: %s (code=%s)",
            self.channel_name,
            close_code,
        )

    async def receive(self, text_data=None, bytes_data=None):
        """
        Handle incoming messages from the client.

        Clients may send control messages (e.g. subscribe to specific
        channels, change sample rate). Expand as needed.
        """
        if text_data:
            try:
                payload = json.loads(text_data)
                msg_type = payload.get("type", "unknown")
                logger.debug("Neural data WS received: %s", msg_type)
                # TODO: handle subscribe/unsubscribe, channel selection, etc.
            except json.JSONDecodeError:
                await self.send(
                    text_data=json.dumps({"error": "Invalid JSON payload"})
                )

    # ── Group message handlers ───────────────────────────────────────────

    async def neural_data_message(self, event):
        """
        Forward a neural-data message from the channel layer to the client.

        Called when another part of the application does:
            channel_layer.group_send(group, {"type": "neural.data.message", ...})
        """
        await self.send(text_data=json.dumps(event.get("data", {})))
