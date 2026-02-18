"""
WebSocket consumer for real-time notification delivery.

Pushes system notifications (alerts, warnings, info) to connected
dashboard clients.
"""

import json
import logging

from channels.generic.websocket import AsyncWebsocketConsumer

logger = logging.getLogger(__name__)

NOTIFICATIONS_GROUP = "notifications_stream"


class NotificationConsumer(AsyncWebsocketConsumer):
    """Async WebSocket consumer for real-time notifications."""

    async def connect(self):
        """Accept the connection and join the notifications broadcast group."""
        self.group_name = NOTIFICATIONS_GROUP

        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()
        logger.info("Notifications WebSocket connected: %s", self.channel_name)

    async def disconnect(self, close_code):
        """Leave the broadcast group on disconnect."""
        await self.channel_layer.group_discard(self.group_name, self.channel_name)
        logger.info(
            "Notifications WebSocket disconnected: %s (code=%s)",
            self.channel_name,
            close_code,
        )

    async def receive(self, text_data=None, bytes_data=None):
        """Handle incoming messages (e.g. mark-read acknowledgements)."""
        if text_data:
            try:
                payload = json.loads(text_data)
                msg_type = payload.get("type", "unknown")
                logger.debug("Notifications WS received: %s", msg_type)
            except json.JSONDecodeError:
                await self.send(
                    text_data=json.dumps({"error": "Invalid JSON payload"})
                )

    # ── Group message handlers ───────────────────────────────────────────

    async def notification_message(self, event):
        """
        Forward a notification from the channel layer to the client.

        Called when another part of the application does:
            channel_layer.group_send(group, {"type": "notification.message", ...})
        """
        await self.send(text_data=json.dumps(event.get("data", {})))
