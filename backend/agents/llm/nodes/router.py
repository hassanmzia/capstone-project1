"""
Intent classification router node for the LangGraph state graph.

Analyses the latest user message and classifies it into one of the
supported intents so the graph can route to the correct handler node.
"""

import logging
import os
from typing import Any, Dict, Literal

import httpx

logger = logging.getLogger(__name__)

OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:12434")
OLLAMA_CHAT_MODEL = os.getenv("OLLAMA_CHAT_MODEL", "deepseek-r1:7b")

ROUTER_SYSTEM_PROMPT = """You are an intent classifier for a neural interface research assistant.

Classify the user's message into exactly ONE of these intents:

- "chat" : General conversation, greetings, questions that don't need tools or knowledge base
- "tool_call" : User wants to perform an action (start/stop recording, configure hardware, export data, get system status)
- "rag_query" : User asks a knowledge question about neuroscience, experiments, prior recordings, or documentation
- "report" : User wants to generate a report or summary of experiments/recordings
- "memory_store" : User explicitly tells the assistant to remember something, or shares a preference

Respond with ONLY the intent label, nothing else. No quotes, no explanation.

Examples:
- "Hello, how are you?" -> chat
- "Start recording on channel 3" -> tool_call
- "What is the optimal sampling rate for LFP signals?" -> rag_query
- "Generate a report for experiment 42" -> report
- "Remember that I prefer 10kHz sampling rate" -> memory_store
- "What happened in my last recording?" -> rag_query
- "Set the bias voltage to 1.2V" -> tool_call
- "Summarize today's experiments" -> report
"""

# Valid intent labels
VALID_INTENTS = {"chat", "tool_call", "rag_query", "report", "memory_store"}


async def route_intent(state: Dict[str, Any]) -> str:
    """Classify the user's intent from the latest message.

    Parameters
    ----------
    state:
        The current ``NeuralAssistantState``.

    Returns
    -------
    str
        One of: ``"chat"``, ``"tool_call"``, ``"rag_query"``, ``"report"``,
        ``"memory_store"``.
    """
    messages = state.get("messages", [])
    if not messages:
        return "chat"

    # Get the last user message
    last_message = None
    for msg in reversed(messages):
        role = msg.get("role", "") if isinstance(msg, dict) else getattr(msg, "role", "")
        if role == "user":
            last_message = msg
            break

    if last_message is None:
        return "chat"

    content = (
        last_message.get("content", "")
        if isinstance(last_message, dict)
        else getattr(last_message, "content", "")
    )

    if not content.strip():
        return "chat"

    # Call the LLM to classify the intent
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(15.0)) as client:
            resp = await client.post(
                f"{OLLAMA_BASE_URL}/api/chat",
                json={
                    "model": OLLAMA_CHAT_MODEL,
                    "messages": [
                        {"role": "system", "content": ROUTER_SYSTEM_PROMPT},
                        {"role": "user", "content": content},
                    ],
                    "stream": False,
                    "options": {"temperature": 0.1},
                },
            )
            resp.raise_for_status()
            raw_intent = resp.json().get("message", {}).get("content", "").strip().lower()
    except httpx.ConnectError:
        logger.warning("Ollama unavailable for routing, defaulting to 'chat'")
        return "chat"
    except Exception as exc:
        logger.error("Router LLM error: %s", exc)
        return "chat"

    # Clean up the response - extract just the intent label
    # The LLM might wrap it in quotes or add extra text
    for intent in VALID_INTENTS:
        if intent in raw_intent:
            logger.info("Routed intent: %s (raw: %s)", intent, raw_intent[:40])
            return intent

    logger.warning(
        "Could not parse intent from LLM response '%s', defaulting to 'chat'",
        raw_intent[:60],
    )
    return "chat"


def router_node(state: Dict[str, Any]) -> Dict[str, Any]:
    """LangGraph node wrapper that stores the classified intent in state.

    This is a synchronous wrapper that stores the intent so the conditional
    edge function can read it. The actual classification is done async
    by the conditional edge function calling ``route_intent`` directly.
    """
    # The router node itself is a pass-through; the routing logic
    # lives in the conditional edge function.
    return state
