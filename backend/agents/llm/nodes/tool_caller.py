"""
MCP tool invocation node for the LangGraph state graph.

Extracts the intended tool call from the LLM's response, invokes it
via the MCP bridge, and adds the result to state.
"""

import json
import logging
import os
import re
from typing import Any, Dict, List

import httpx

from ..tools.mcp_bridge import MCPToolBridge

logger = logging.getLogger(__name__)

OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:12434")
OLLAMA_CHAT_MODEL = os.getenv("OLLAMA_CHAT_MODEL", "deepseek-r1:7b")

TOOL_EXTRACTION_PROMPT = """You are a tool-call parser for a neural interface system.
Given the user's message, extract the tool name and arguments.

Available tools:
- get_stream_status: Get current data streaming status. Args: {{}}
- get_device_info: Get connected device information. Args: {{}}
- get_signal_quality: Get signal quality metrics. Args: {{"channel_ids": [list of ints]}}
- query_recordings: Search recordings. Args: {{"experiment_id": int, "status": str}}
- get_recording_metadata: Get recording details. Args: {{"recording_id": int}}
- get_system_health: Get system health metrics. Args: {{}}
- compute_statistics: Compute signal statistics. Args: {{"recording_id": int, "channels": [list]}}
- compute_fft: Compute FFT analysis. Args: {{"recording_id": int, "channel": int}}
- start_recording: Start a new recording. Args: {{"experiment_id": int, "name": str, "sample_rate": int}}
- stop_recording: Stop active recording. Args: {{"recording_id": int}}
- configure_bias: Set bias voltage. Args: {{"voltage": float}}
- set_gain_mode: Set amplifier gain. Args: {{"gain": str, "mode": str}}
- filter_signal: Apply signal filter. Args: {{"filter_type": str, "cutoff_low": float, "cutoff_high": float}}
- export_data: Export recording data. Args: {{"recording_id": int, "format": str}}

Respond with ONLY a JSON object: {{"tool": "tool_name", "arguments": {{...}}}}
No explanation, no markdown."""


async def call_tool(state: Dict[str, Any]) -> Dict[str, Any]:
    """Extract tool call from the conversation and invoke it via MCP.

    Parameters
    ----------
    state:
        The current ``NeuralAssistantState``.

    Returns
    -------
    dict
        Updated state with ``tool_results`` and optionally ``pending_tool_call``.
    """
    messages = state.get("messages", [])
    tool_results = list(state.get("tool_results", []))

    # Get the last user message
    last_user_msg = ""
    for msg in reversed(messages):
        role = msg.get("role", "") if isinstance(msg, dict) else getattr(msg, "role", "")
        if role == "user":
            content = (
                msg.get("content", "")
                if isinstance(msg, dict)
                else getattr(msg, "content", "")
            )
            last_user_msg = content
            break

    if not last_user_msg:
        tool_results.append({
            "status": "error",
            "error": "No user message found for tool extraction.",
        })
        return {**state, "tool_results": tool_results}

    # Use LLM to extract tool name and arguments
    tool_call = await _extract_tool_call(last_user_msg)

    if tool_call is None:
        tool_results.append({
            "status": "error",
            "error": "Could not determine which tool to call from the message.",
        })
        return {**state, "tool_results": tool_results}

    # Store as pending tool call for safety check
    return {
        **state,
        "pending_tool_call": tool_call,
        "tool_results": tool_results,
    }


async def execute_pending_tool(state: Dict[str, Any]) -> Dict[str, Any]:
    """Execute the pending tool call after safety check passes.

    Called after the safety_check node approves the tool call.
    """
    pending = state.get("pending_tool_call")
    tool_results = list(state.get("tool_results", []))

    if pending is None:
        return state

    bridge = MCPToolBridge()
    tool_name = pending.get("tool", "")
    arguments = pending.get("arguments", {})

    result = await bridge.call_tool(tool_name, arguments)
    tool_results.append(result)

    return {
        **state,
        "tool_results": tool_results,
        "pending_tool_call": None,
    }


async def _extract_tool_call(user_message: str) -> Dict[str, Any] | None:
    """Use the LLM to parse a tool call from the user's message."""
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(30.0)) as client:
            resp = await client.post(
                f"{OLLAMA_BASE_URL}/api/chat",
                json={
                    "model": OLLAMA_CHAT_MODEL,
                    "messages": [
                        {"role": "system", "content": TOOL_EXTRACTION_PROMPT},
                        {"role": "user", "content": user_message},
                    ],
                    "stream": False,
                    "options": {"temperature": 0.0},
                },
            )
            resp.raise_for_status()
            raw = resp.json().get("message", {}).get("content", "").strip()
    except Exception as exc:
        logger.error("Failed to extract tool call: %s", exc)
        return None

    # Parse JSON from the response
    try:
        # Try direct JSON parse first
        parsed = json.loads(raw)
        if "tool" in parsed:
            return parsed
    except json.JSONDecodeError:
        pass

    # Try to extract JSON from markdown or surrounding text
    json_match = re.search(r"\{[^{}]*\"tool\"[^{}]*\}", raw, re.DOTALL)
    if json_match:
        try:
            parsed = json.loads(json_match.group())
            if "tool" in parsed:
                return parsed
        except json.JSONDecodeError:
            pass

    logger.warning("Could not parse tool call from LLM output: %s", raw[:200])
    return None
