"""
Tool safety validation node for the LangGraph state graph.

Checks pending tool calls against the LLM_TOOL_TIERS permission system
before allowing execution.
"""

import logging
from typing import Any, Dict

from ..tools.mcp_bridge import get_tool_tier

logger = logging.getLogger(__name__)


async def check_safety(state: Dict[str, Any]) -> Dict[str, Any]:
    """Validate a pending tool call against the permission tiers.

    Permission tiers:
    - ``read_only``: Tool passes through without restriction.
    - ``requires_confirmation``: Sets ``requires_confirmation = True`` in state
      so the responder asks the user to confirm before execution.
    - ``blocked``: Rejects the tool call with an error message.
    - ``unknown``: Treated as ``requires_confirmation`` for safety.

    Parameters
    ----------
    state:
        The current ``NeuralAssistantState`` with ``pending_tool_call`` set.

    Returns
    -------
    dict
        Updated state with safety decisions applied.
    """
    pending = state.get("pending_tool_call")
    tool_results = list(state.get("tool_results", []))

    if pending is None:
        logger.debug("No pending tool call to check.")
        return state

    tool_name = pending.get("tool", "")
    tier = get_tool_tier(tool_name)

    logger.info("Safety check for tool '%s': tier=%s", tool_name, tier)

    if tier == "blocked":
        # Reject the tool call entirely
        tool_results.append({
            "status": "error",
            "tool_name": tool_name,
            "error": (
                f"Tool '{tool_name}' is BLOCKED for AI-initiated use. "
                "This action involves stimulation, firmware modification, or "
                "data deletion and must be performed directly by a human operator. "
                "This restriction exists for patient/device safety."
            ),
        })
        return {
            **state,
            "tool_results": tool_results,
            "pending_tool_call": None,
            "requires_confirmation": False,
        }

    if tier == "requires_confirmation" or tier == "unknown":
        # Require user confirmation before execution
        logger.info(
            "Tool '%s' requires user confirmation (tier=%s).", tool_name, tier
        )
        return {
            **state,
            "requires_confirmation": True,
            # Keep pending_tool_call so it can be executed after confirmation
        }

    if tier == "read_only":
        # Safe to execute - delegate to tool execution
        from .tool_caller import execute_pending_tool

        logger.info("Tool '%s' is read-only, executing directly.", tool_name)
        return await execute_pending_tool(state)

    # Fallback: require confirmation
    return {
        **state,
        "requires_confirmation": True,
    }
