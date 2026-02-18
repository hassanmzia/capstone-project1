"""
WebSocket consumer for LLM chat with streaming support.

Accepts user messages over WebSocket, forwards them to the LLM backend,
and streams token-by-token responses back to the client.
"""

import json
import logging

from channels.generic.websocket import AsyncWebsocketConsumer

logger = logging.getLogger(__name__)

CHAT_GROUP_PREFIX = "chat_"


class ChatConsumer(AsyncWebsocketConsumer):
    """Async WebSocket consumer for LLM chat streaming."""

    async def connect(self):
        """Accept the connection and optionally join a session group."""
        # Derive a per-user or per-session group if needed.
        self.user = self.scope.get("user")
        self.session_id: str | None = None
        await self.accept()
        logger.info("Chat WebSocket connected: %s", self.channel_name)

    async def disconnect(self, close_code):
        """Clean up any session group membership."""
        if self.session_id:
            group = f"{CHAT_GROUP_PREFIX}{self.session_id}"
            await self.channel_layer.group_discard(group, self.channel_name)
        logger.info(
            "Chat WebSocket disconnected: %s (code=%s)",
            self.channel_name,
            close_code,
        )

    async def receive(self, text_data=None, bytes_data=None):
        """
        Handle incoming chat messages from the client.

        Expected payload::

            {
                "type": "chat.message",
                "session_id": "<uuid>",
                "content": "user's question …"
            }

        The handler should call the LLM service and stream tokens back via
        ``self.send``. The skeleton below shows the intended streaming pattern.
        """
        if not text_data:
            return

        try:
            payload = json.loads(text_data)
        except json.JSONDecodeError:
            await self.send(text_data=json.dumps({"error": "Invalid JSON payload"}))
            return

        msg_type = payload.get("type", "chat.message")
        content = payload.get("content", "")
        session_id = payload.get("session_id")

        # Track session group for potential multi-tab broadcasting.
        if session_id and session_id != self.session_id:
            if self.session_id:
                old_group = f"{CHAT_GROUP_PREFIX}{self.session_id}"
                await self.channel_layer.group_discard(old_group, self.channel_name)
            self.session_id = session_id
            new_group = f"{CHAT_GROUP_PREFIX}{self.session_id}"
            await self.channel_layer.group_add(new_group, self.channel_name)

        logger.debug("Chat WS received (%s): %.80s…", msg_type, content)

        # TODO: Replace the stub below with actual LLM service call.
        #       Stream tokens as they arrive:
        #
        #   async for token in llm_service.stream(content, session_id=session_id):
        #       await self.send(text_data=json.dumps({
        #           "type": "chat.token",
        #           "token": token,
        #       }))
        #
        #   await self.send(text_data=json.dumps({"type": "chat.end"}))

        await self._send_placeholder_response(content)

    # ── Helpers ──────────────────────────────────────────────────────────

    async def _send_placeholder_response(self, content: str):
        """Send a placeholder response until the LLM service is wired up."""
        await self.send(
            text_data=json.dumps(
                {
                    "type": "chat.token",
                    "token": f"[placeholder] Received: {content[:120]}",
                }
            )
        )
        await self.send(text_data=json.dumps({"type": "chat.end"}))

    # ── Group message handlers ───────────────────────────────────────────

    async def chat_stream_token(self, event):
        """Forward a streamed token from the channel layer to the client."""
        await self.send(
            text_data=json.dumps(
                {
                    "type": "chat.token",
                    "token": event.get("token", ""),
                }
            )
        )

    async def chat_stream_end(self, event):
        """Signal end-of-stream to the client."""
        await self.send(text_data=json.dumps({"type": "chat.end"}))
