"""
WebSocket consumer for LLM chat with streaming support.

Accepts user messages over WebSocket, forwards them to the LLM backend,
and streams token-by-token responses back to the client.
"""

import json
import logging
import os

import httpx
from channels.generic.websocket import AsyncWebsocketConsumer

logger = logging.getLogger(__name__)

CHAT_GROUP_PREFIX = "chat_"
AGENT_LLM_URL = os.environ.get("AGENT_LLM_URL", "http://agent-llm:8094")


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

        await self._stream_from_agent(content, session_id)

    # ── Helpers ──────────────────────────────────────────────────────────

    async def _stream_from_agent(self, content: str, session_id: str | None):
        """Forward the message to agent-llm and stream the response back."""
        chat_url = f"{AGENT_LLM_URL}/chat"
        request_body = {
            "messages": [{"role": "user", "content": content}],
            "session_id": session_id,
            "stream": True,
        }

        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(120.0, connect=10.0)) as client:
                async with client.stream("POST", chat_url, json=request_body) as response:
                    if response.status_code != 200:
                        error_body = await response.aread()
                        logger.error(
                            "Agent-llm returned %s: %s",
                            response.status_code,
                            error_body[:200],
                        )
                        await self.send(
                            text_data=json.dumps(
                                {
                                    "type": "chat.token",
                                    "token": "Sorry, the AI assistant is currently unavailable. Please try again later.",
                                }
                            )
                        )
                        await self.send(text_data=json.dumps({"type": "chat.end"}))
                        return

                    # Stream SSE lines from agent-llm
                    async for line in response.aiter_lines():
                        if not line:
                            continue

                        # SSE format: "data: {...}"
                        if line.startswith("data: "):
                            data_str = line[6:]
                            if data_str.strip() == "[DONE]":
                                break
                            try:
                                data = json.loads(data_str)
                                token = data.get("token") or data.get("content") or data.get("reply", "")
                                if token:
                                    await self.send(
                                        text_data=json.dumps(
                                            {"type": "chat.token", "token": token}
                                        )
                                    )
                            except json.JSONDecodeError:
                                # Non-JSON SSE data, send as-is
                                await self.send(
                                    text_data=json.dumps(
                                        {"type": "chat.token", "token": data_str}
                                    )
                                )
                        elif not line.startswith(":"):
                            # Non-SSE response (plain JSON), treat as complete reply
                            try:
                                data = json.loads(line)
                                reply = data.get("reply") or data.get("content", "")
                                if reply:
                                    await self.send(
                                        text_data=json.dumps(
                                            {"type": "chat.token", "token": reply}
                                        )
                                    )
                            except json.JSONDecodeError:
                                pass

        except httpx.ConnectError:
            logger.warning("Cannot connect to agent-llm at %s", chat_url)
            await self.send(
                text_data=json.dumps(
                    {
                        "type": "chat.token",
                        "token": "The AI assistant service is starting up. Please try again in a moment.",
                    }
                )
            )
        except httpx.TimeoutException:
            logger.warning("Timeout connecting to agent-llm")
            await self.send(
                text_data=json.dumps(
                    {
                        "type": "chat.token",
                        "token": "The request timed out. Please try again.",
                    }
                )
            )
        except Exception:
            logger.exception("Unexpected error streaming from agent-llm")
            await self.send(
                text_data=json.dumps(
                    {
                        "type": "chat.token",
                        "token": "An unexpected error occurred. Please try again.",
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
