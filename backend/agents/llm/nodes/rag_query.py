"""
RAG retrieval node for the LangGraph state graph.

Embeds the user's query and searches pgvector for the most relevant
documents, adding them to the state for the responder to use.
"""

import logging
import os
from typing import Any, Dict, List

from ..rag.embedder import OllamaEmbedder
from ..rag.retriever import DocumentRetriever

logger = logging.getLogger(__name__)

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://neural_admin:neural_secure_password_2024@localhost:5435/neural_interface",
)


async def retrieve_context(state: Dict[str, Any]) -> Dict[str, Any]:
    """Retrieve relevant documents from the vector store.

    Embeds the user's last message, searches pgvector for the top-5
    similar documents, and adds them to ``state['rag_results']``.

    Parameters
    ----------
    state:
        The current ``NeuralAssistantState``.

    Returns
    -------
    dict
        Updated state with ``rag_results`` populated.
    """
    messages = state.get("messages", [])
    rag_results: List[Dict[str, Any]] = list(state.get("rag_results", []))

    # Get the last user message
    query = ""
    for msg in reversed(messages):
        role = msg.get("role", "") if isinstance(msg, dict) else getattr(msg, "role", "")
        if role == "user":
            content = (
                msg.get("content", "")
                if isinstance(msg, dict)
                else getattr(msg, "content", "")
            )
            query = content
            break

    if not query:
        logger.warning("No user query found for RAG retrieval.")
        return {**state, "rag_results": rag_results}

    embedder = OllamaEmbedder()
    retriever = DocumentRetriever(embedder=embedder)

    try:
        results = await retriever.search(query=query, top_k=5)
        rag_results.extend(results)
        logger.info(
            "RAG retrieval found %d relevant documents for: '%s'",
            len(results), query[:60],
        )
    except Exception as exc:
        logger.error("RAG retrieval failed: %s", exc)
        rag_results.append({
            "content": f"[RAG retrieval error: {exc}]",
            "title": "Error",
            "source_type": "error",
            "similarity_score": 0.0,
            "metadata": {},
        })
    finally:
        await embedder.close()
        await retriever.close()

    return {**state, "rag_results": rag_results}
