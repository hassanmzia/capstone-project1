"""
Response generation node for the LangGraph state graph.

Builds a prompt from system context, RAG results, tool results, and
conversation history, then calls the LLM to generate the final response.
"""

import logging
from typing import Any, Dict, List

from ..providers import chat as provider_chat

logger = logging.getLogger(__name__)

BASE_SYSTEM_PROMPT = """You are the Neural Interface Research Assistant, an AI assistant for neuroscience researchers using the CNEAv5 neural interfacing platform.

Your capabilities:
- Answer questions about neuroscience, neural recordings, and the platform
- Help configure recording hardware (electrodes, amplifiers, filters)
- Analyse experimental data and provide insights
- Generate reports on experiments and recordings
- Remember user preferences and context from previous interactions

Guidelines:
- Be precise, scientific, and helpful
- Cite sources when using retrieved knowledge
- If you are unsure, say so rather than guessing
- Respect hardware safety limits at all times
- When describing actions taken via tools, explain what happened clearly
"""


async def generate_response(state: Dict[str, Any]) -> Dict[str, Any]:
    """Generate the assistant's response using the LLM.

    Builds a comprehensive prompt from:
    1. Base system prompt
    2. System context (active recording, device info, etc.)
    3. RAG-retrieved documents
    4. Tool execution results
    5. Conversation history

    Parameters
    ----------
    state:
        The current ``NeuralAssistantState``.

    Returns
    -------
    dict
        Updated state with the assistant's response appended to ``messages``.
    """
    messages = list(state.get("messages", []))
    system_context = state.get("system_context", {})
    rag_results = state.get("rag_results", [])
    tool_results = state.get("tool_results", [])
    requires_confirmation = state.get("requires_confirmation", False)

    # Build the system prompt
    system_parts = [BASE_SYSTEM_PROMPT]

    # Add system context
    if system_context:
        ctx_lines = []
        if system_context.get("active_recording"):
            ctx_lines.append(
                f"Active recording: {system_context['active_recording']}"
            )
        if system_context.get("device"):
            ctx_lines.append(f"Connected device: {system_context['device']}")
        if system_context.get("config"):
            ctx_lines.append(f"Current config: {system_context['config']}")
        if ctx_lines:
            system_parts.append(
                "\n\nCurrent System State:\n" + "\n".join(f"- {l}" for l in ctx_lines)
            )

    # Add RAG context
    if rag_results:
        rag_block = "\n\nRelevant Knowledge Base Documents:"
        for i, doc in enumerate(rag_results, 1):
            if doc.get("source_type") == "error":
                rag_block += f"\n[{i}] {doc['content']}"
            else:
                rag_block += (
                    f"\n[{i}] {doc.get('title', 'Untitled')} "
                    f"(source: {doc.get('source_type', 'unknown')}, "
                    f"relevance: {doc.get('similarity_score', 0):.2f})\n"
                    f"    {doc.get('content', '')[:500]}"
                )
        system_parts.append(rag_block)

    # Add tool results
    if tool_results:
        tool_block = "\n\nTool Execution Results:"
        for result in tool_results:
            status = result.get("status", "unknown")
            tool_name = result.get("tool_name", "unknown")
            if status == "success":
                tool_block += (
                    f"\n- Tool '{tool_name}' executed successfully: "
                    f"{result.get('result', 'No output')}"
                )
            else:
                tool_block += (
                    f"\n- Tool '{tool_name}' failed: "
                    f"{result.get('error', 'Unknown error')}"
                )
        system_parts.append(tool_block)

    # Handle confirmation required
    if requires_confirmation:
        pending = state.get("pending_tool_call", {})
        tool_name = pending.get("tool", "unknown") if pending else "unknown"
        system_parts.append(
            f"\n\nIMPORTANT: The action '{tool_name}' requires user confirmation "
            "before it can be executed. Ask the user to confirm."
        )

    full_system_prompt = "\n".join(system_parts)

    # Build the message list for the LLM
    llm_messages = [{"role": "system", "content": full_system_prompt}]

    for msg in messages:
        if isinstance(msg, dict):
            role = msg.get("role", "user")
            content = msg.get("content", "")
        else:
            role = getattr(msg, "role", "user")
            content = getattr(msg, "content", "")

        if role in ("user", "assistant"):
            llm_messages.append({"role": role, "content": content})

    # Call the LLM via the provider abstraction.
    # The model_id is read from state so the user's selection is respected
    # even in the non-streaming LangGraph path.
    model_id = state.get("system_context", {}).get("model_id")
    assistant_response = await provider_chat(llm_messages, model_id=model_id)

    # Append the response to messages
    messages.append({"role": "assistant", "content": assistant_response})

    return {
        **state,
        "messages": messages,
        # Clear ephemeral state after responding
        "rag_results": [],
        "tool_results": [],
        "requires_confirmation": False,
    }
