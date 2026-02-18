"""
Short-term (session) memory backed by Redis.

Stores conversation context and recent messages per session. Automatically
summarises conversation history when the message count exceeds a threshold.
"""

import json
import logging
import os
from typing import Any, Dict, List, Optional

import httpx
import redis.asyncio as aioredis

logger = logging.getLogger(__name__)

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:12434")
OLLAMA_CHAT_MODEL = os.getenv("OLLAMA_CHAT_MODEL", "deepseek-r1:7b")

SESSION_TTL = 86400  # 24 hours
MAX_MESSAGES_BEFORE_SUMMARY = 50


class ShortTermMemory:
    """Redis-backed session state for fast read/write of conversation context."""

    def __init__(
        self,
        redis_url: str | None = None,
        ttl: int = SESSION_TTL,
    ):
        self.redis_url = redis_url or REDIS_URL
        self.ttl = ttl
        self._redis: Optional[aioredis.Redis] = None

    # ------------------------------------------------------------------
    # Connection
    # ------------------------------------------------------------------

    async def _get_redis(self) -> aioredis.Redis:
        if self._redis is None:
            self._redis = aioredis.from_url(
                self.redis_url, decode_responses=True
            )
        return self._redis

    async def close(self) -> None:
        if self._redis:
            await self._redis.close()
            self._redis = None

    # ------------------------------------------------------------------
    # Context CRUD
    # ------------------------------------------------------------------

    def _key(self, session_id: str) -> str:
        return f"llm:session:{session_id}"

    async def store_context(self, session_id: str, context: Dict[str, Any]) -> None:
        """Store or update session context.

        Parameters
        ----------
        session_id:
            Unique session identifier.
        context:
            Arbitrary context dict (messages, system_context, etc.).
        """
        r = await self._get_redis()
        key = self._key(session_id)
        await r.set(key, json.dumps(context, default=str), ex=self.ttl)
        logger.debug("Stored context for session %s", session_id)

    async def get_context(self, session_id: str) -> Dict[str, Any]:
        """Retrieve session context.

        Returns an empty dict if the session does not exist or has expired.
        """
        r = await self._get_redis()
        key = self._key(session_id)
        raw = await r.get(key)
        if raw is None:
            return {}
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            logger.warning("Corrupt session data for %s", session_id)
            return {}

    async def append_message(
        self, session_id: str, role: str, content: str
    ) -> List[Dict[str, str]]:
        """Append a message to the session's message history.

        If the conversation exceeds ``MAX_MESSAGES_BEFORE_SUMMARY``,
        the older messages are summarised and replaced by a summary message.

        Returns the updated message list.
        """
        ctx = await self.get_context(session_id)
        messages: List[Dict[str, str]] = ctx.get("messages", [])
        messages.append({"role": role, "content": content})

        # Summarise if needed
        if len(messages) > MAX_MESSAGES_BEFORE_SUMMARY:
            messages = await self._summarise_messages(messages)

        ctx["messages"] = messages
        await self.store_context(session_id, ctx)
        return messages

    async def delete_session(self, session_id: str) -> None:
        """Delete a session and all its data."""
        r = await self._get_redis()
        await r.delete(self._key(session_id))

    # ------------------------------------------------------------------
    # Summarisation
    # ------------------------------------------------------------------

    async def _summarise_messages(
        self, messages: List[Dict[str, str]]
    ) -> List[Dict[str, str]]:
        """Compress older messages into a summary, keeping the most recent 10."""
        if len(messages) <= MAX_MESSAGES_BEFORE_SUMMARY:
            return messages

        # Split: old messages to summarise, recent messages to keep
        to_summarise = messages[:-10]
        to_keep = messages[-10:]

        # Build a summary prompt
        conversation_text = "\n".join(
            f"{m['role']}: {m['content']}" for m in to_summarise
        )
        summary_prompt = (
            "Summarise the following conversation into a concise paragraph "
            "preserving key facts, decisions, and context:\n\n"
            f"{conversation_text}"
        )

        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(60.0)) as client:
                resp = await client.post(
                    f"{OLLAMA_BASE_URL}/api/chat",
                    json={
                        "model": OLLAMA_CHAT_MODEL,
                        "messages": [
                            {"role": "system", "content": "You are a concise summariser."},
                            {"role": "user", "content": summary_prompt},
                        ],
                        "stream": False,
                    },
                )
                resp.raise_for_status()
                summary = resp.json().get("message", {}).get("content", "")
        except Exception as exc:
            logger.warning("Failed to summarise messages: %s", exc)
            # Fallback: just truncate
            summary = f"[Previous conversation of {len(to_summarise)} messages truncated]"

        summary_message = {
            "role": "system",
            "content": f"[Conversation summary]: {summary}",
        }
        return [summary_message] + to_keep
