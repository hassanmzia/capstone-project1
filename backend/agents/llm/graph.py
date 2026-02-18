"""
LangGraph StateGraph definition for the Neural Assistant.

Defines the state schema and builds a compiled graph with:
- router (intent classification)
- rag_retriever (document retrieval)
- tool_caller (MCP tool invocation)
- safety_check (permission validation)
- responder (LLM response generation)
- memory_writer (long-term fact extraction)
"""

import asyncio
import logging
from typing import Any, Dict, List, Optional, TypedDict

from langgraph.graph import END, StateGraph

from .nodes.memory import write_memory
from .nodes.rag_query import retrieve_context
from .nodes.responder import generate_response
from .nodes.router import route_intent, router_node
from .nodes.safety_check import check_safety
from .nodes.tool_caller import call_tool

logger = logging.getLogger(__name__)


# ------------------------------------------------------------------
# State definition
# ------------------------------------------------------------------


class NeuralAssistantState(TypedDict, total=False):
    """State schema for the Neural Assistant LangGraph.

    Attributes
    ----------
    messages:
        The conversation message history (list of ``{role, content}`` dicts).
    system_context:
        Current system state (active recording, device info, config).
    rag_results:
        Documents retrieved from the pgvector knowledge base.
    tool_results:
        Results from MCP tool invocations.
    requires_confirmation:
        Whether the current action needs user confirmation.
    pending_tool_call:
        The tool call waiting for safety approval / execution.
    """

    messages: List[Dict[str, str]]
    system_context: Dict[str, Any]
    rag_results: List[Dict[str, Any]]
    tool_results: List[Dict[str, Any]]
    requires_confirmation: bool
    pending_tool_call: Optional[Dict[str, Any]]


# ------------------------------------------------------------------
# Async node wrappers (LangGraph nodes must be sync or async callables)
# ------------------------------------------------------------------

async def _router_node(state: NeuralAssistantState) -> NeuralAssistantState:
    """Pass-through node; routing is done by the conditional edge."""
    return state


async def _rag_retriever_node(state: NeuralAssistantState) -> NeuralAssistantState:
    """Retrieve relevant documents from pgvector."""
    return await retrieve_context(state)


async def _tool_caller_node(state: NeuralAssistantState) -> NeuralAssistantState:
    """Extract and prepare a tool call."""
    return await call_tool(state)


async def _safety_check_node(state: NeuralAssistantState) -> NeuralAssistantState:
    """Validate the pending tool call against permission tiers."""
    return await check_safety(state)


async def _responder_node(state: NeuralAssistantState) -> NeuralAssistantState:
    """Generate the final LLM response."""
    return await generate_response(state)


async def _memory_writer_node(state: NeuralAssistantState) -> NeuralAssistantState:
    """Extract and store key facts to long-term memory."""
    return await write_memory(state)


# ------------------------------------------------------------------
# Conditional edge: route from router to next node
# ------------------------------------------------------------------

async def _route_decision(state: NeuralAssistantState) -> str:
    """Determine the next node based on intent classification.

    Returns the name of the next node to execute.
    """
    intent = await route_intent(state)
    logger.info("Router decision: intent=%s", intent)

    intent_to_node = {
        "chat": "responder",
        "tool_call": "tool_caller",
        "rag_query": "rag_retriever",
        "report": "rag_retriever",       # reports also use RAG for context
        "memory_store": "memory_writer",
    }

    return intent_to_node.get(intent, "responder")


def _safety_decision(state: NeuralAssistantState) -> str:
    """After safety check, decide whether to respond or if the tool was executed.

    If the tool was blocked or needs confirmation, go to responder.
    If the tool was read_only and executed, go to responder.
    """
    # In all cases after safety_check, we go to responder
    return "responder"


# ------------------------------------------------------------------
# Graph builder
# ------------------------------------------------------------------

def build_graph() -> StateGraph:
    """Build and return the (uncompiled) Neural Assistant StateGraph.

    The graph has the following topology::

        START -> router
        router --[chat]--> responder -> memory_writer -> END
        router --[tool_call]--> tool_caller -> safety_check -> responder -> memory_writer -> END
        router --[rag_query/report]--> rag_retriever -> responder -> memory_writer -> END
        router --[memory_store]--> memory_writer -> responder -> END
    """
    builder = StateGraph(NeuralAssistantState)

    # Add nodes
    builder.add_node("router", _router_node)
    builder.add_node("rag_retriever", _rag_retriever_node)
    builder.add_node("tool_caller", _tool_caller_node)
    builder.add_node("safety_check", _safety_check_node)
    builder.add_node("responder", _responder_node)
    builder.add_node("memory_writer", _memory_writer_node)

    # Set entry point
    builder.set_entry_point("router")

    # Conditional edges from router
    builder.add_conditional_edges(
        "router",
        _route_decision,
        {
            "responder": "responder",
            "tool_caller": "tool_caller",
            "rag_retriever": "rag_retriever",
            "memory_writer": "memory_writer",
        },
    )

    # Linear edges
    builder.add_edge("rag_retriever", "responder")
    builder.add_edge("tool_caller", "safety_check")
    builder.add_edge("safety_check", "responder")
    builder.add_edge("responder", "memory_writer")
    builder.add_edge("memory_writer", END)

    return builder


def compile_graph():
    """Build and compile the Neural Assistant graph.

    Returns a compiled LangGraph runnable. A PostgreSQL checkpointer
    can be added here for state persistence across sessions.

    Returns
    -------
    CompiledStateGraph
        The compiled graph ready for invocation.
    """
    builder = build_graph()

    # PostgreSQL checkpointer placeholder:
    # from langgraph.checkpoint.postgres import PostgresSaver
    # checkpointer = PostgresSaver.from_conn_string(DATABASE_URL)
    # return builder.compile(checkpointer=checkpointer)

    compiled = builder.compile()
    logger.info("Neural Assistant LangGraph compiled successfully.")
    return compiled
