"""
Memory read/write node for the LangGraph state graph.

Extracts key facts from the conversation and stores them in long-term
memory (episodic and procedural).
"""

import logging
import os
from typing import Any, Dict, List

import httpx

from ..memory.long_term import LongTermMemory
from ..memory.procedural import ProceduralMemory
from ..rag.embedder import OllamaEmbedder

logger = logging.getLogger(__name__)

OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:12434")
OLLAMA_CHAT_MODEL = os.getenv("OLLAMA_CHAT_MODEL", "deepseek-r1:7b")

FACT_EXTRACTION_PROMPT = """You are a fact extractor. Given the conversation below, extract key facts that should be remembered for future interactions.

Focus on:
1. User preferences (e.g., preferred settings, working style)
2. Experimental context (e.g., what experiment they're working on)
3. Important decisions or observations
4. Specific requests to remember something

Return a JSON array of facts. Each fact is an object with:
- "content": The fact to remember (string)
- "type": One of "episodic" (event/observation) or "procedural" (preference/habit)

If there are no important facts, return an empty array: []

Example: [{"content": "User prefers 10kHz sampling rate for LFP recordings", "type": "procedural"}]

Return ONLY the JSON array, no explanation."""


async def write_memory(state: Dict[str, Any]) -> Dict[str, Any]:
    """Extract key facts from the conversation and store to long-term memory.

    Parameters
    ----------
    state:
        The current ``NeuralAssistantState``.

    Returns
    -------
    dict
        The state (unchanged; memory writes are side effects).
    """
    messages = state.get("messages", [])
    if len(messages) < 2:
        return state

    # Build conversation excerpt (last few messages)
    recent_messages = messages[-6:]  # Last 3 exchanges
    conversation = "\n".join(
        f"{_get_role(m)}: {_get_content(m)}" for m in recent_messages
    )

    # Extract facts using LLM
    facts = await _extract_facts(conversation)

    if not facts:
        return state

    # Store each fact
    embedder = OllamaEmbedder()
    long_term = LongTermMemory(embedder=embedder)
    procedural = ProceduralMemory()

    try:
        user_id = state.get("system_context", {}).get("user_id", 0)

        for fact in facts:
            content = fact.get("content", "")
            fact_type = fact.get("type", "episodic")

            if not content:
                continue

            if fact_type == "procedural" and user_id:
                # Store as a user preference
                await procedural.store_preference(
                    user_id=user_id,
                    key=_derive_preference_key(content),
                    value=content,
                    learned_from="Extracted from conversation",
                )

            # Also store in long-term semantic memory
            source_type = (
                "memory_procedural" if fact_type == "procedural" else "memory_episodic"
            )
            await long_term.store_fact(
                content=content,
                source_type=source_type,
                metadata={"user_id": user_id},
            )

        logger.info("Stored %d facts to long-term memory.", len(facts))
    except Exception as exc:
        logger.error("Failed to write to long-term memory: %s", exc)
    finally:
        await embedder.close()
        await long_term.close()
        await procedural.close()

    return state


def _get_role(msg: Any) -> str:
    if isinstance(msg, dict):
        return msg.get("role", "unknown")
    return getattr(msg, "role", "unknown")


def _get_content(msg: Any) -> str:
    if isinstance(msg, dict):
        return msg.get("content", "")
    return getattr(msg, "content", "")


def _derive_preference_key(content: str) -> str:
    """Derive a preference key from a fact content string.

    Simple heuristic: take the first few meaningful words and
    create a snake_case key.
    """
    import re

    words = re.findall(r"[a-zA-Z]+", content.lower())
    # Take first 5 meaningful words, skip common words
    stop_words = {"the", "a", "an", "is", "are", "was", "were", "to", "for", "of", "in", "and", "or"}
    key_words = [w for w in words if w not in stop_words][:5]
    return "_".join(key_words) if key_words else "general_preference"


async def _extract_facts(conversation: str) -> List[Dict[str, str]]:
    """Use the LLM to extract memorable facts from a conversation."""
    import json
    import re

    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(30.0)) as client:
            resp = await client.post(
                f"{OLLAMA_BASE_URL}/api/chat",
                json={
                    "model": OLLAMA_CHAT_MODEL,
                    "messages": [
                        {"role": "system", "content": FACT_EXTRACTION_PROMPT},
                        {"role": "user", "content": conversation},
                    ],
                    "stream": False,
                    "options": {"temperature": 0.1},
                },
            )
            resp.raise_for_status()
            raw = resp.json().get("message", {}).get("content", "").strip()
    except Exception as exc:
        logger.error("Fact extraction failed: %s", exc)
        return []

    # Parse JSON array
    try:
        facts = json.loads(raw)
        if isinstance(facts, list):
            return facts
    except json.JSONDecodeError:
        pass

    # Try to extract JSON array from surrounding text
    match = re.search(r"\[.*\]", raw, re.DOTALL)
    if match:
        try:
            facts = json.loads(match.group())
            if isinstance(facts, list):
                return facts
        except json.JSONDecodeError:
            pass

    logger.warning("Could not parse facts from LLM output: %s", raw[:200])
    return []
