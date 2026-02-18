"""
End-to-end RAG pipeline.

Orchestrates retrieval, prompt augmentation, and LLM generation to answer
questions grounded in the indexed knowledge base.
"""

import logging
import os
from typing import Any, Dict, List, Optional

import httpx

from .embedder import OllamaEmbedder
from .retriever import DocumentRetriever

logger = logging.getLogger(__name__)

OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:12434")
OLLAMA_CHAT_MODEL = os.getenv("OLLAMA_CHAT_MODEL", "deepseek-r1:7b")

RAG_SYSTEM_PROMPT = """You are a neural interface research assistant with access to a knowledge base.
Use the following retrieved documents to ground your answer.
If the documents do not contain relevant information, say so honestly.
Always cite your sources by referencing the document title or source.

Retrieved Documents:
{context}

---
Answer the user's question based on the above context. Be precise and scientific."""


class RAGPipeline:
    """Full RAG pipeline: retrieve -> augment -> generate."""

    def __init__(
        self,
        embedder: OllamaEmbedder,
        retriever: DocumentRetriever,
        llm_url: str | None = None,
        model: str | None = None,
    ):
        self.embedder = embedder
        self.retriever = retriever
        self.llm_url = (llm_url or OLLAMA_BASE_URL).rstrip("/")
        self.model = model or OLLAMA_CHAT_MODEL

    async def query(
        self,
        question: str,
        context: Dict[str, Any] | None = None,
        top_k: int = 5,
        source_types: List[str] | None = None,
    ) -> str:
        """Run the full RAG pipeline for a question.

        Parameters
        ----------
        question:
            User's natural-language question.
        context:
            Optional additional context (e.g. active recording info).
        top_k:
            Number of documents to retrieve.
        source_types:
            Optional filter for document types.

        Returns
        -------
        str
            The LLM-generated answer grounded in retrieved documents.
        """
        # 1. Retrieve relevant documents
        docs = await self.retriever.search(
            query=question,
            top_k=top_k,
            source_types=source_types,
        )

        # 2. Build context block
        if docs:
            context_parts = []
            for i, doc in enumerate(docs, 1):
                context_parts.append(
                    f"[{i}] Title: {doc['title']}\n"
                    f"    Source: {doc['source_type']} (score: {doc['similarity_score']})\n"
                    f"    Content: {doc['content']}"
                )
            context_block = "\n\n".join(context_parts)
        else:
            context_block = "(No relevant documents found in the knowledge base.)"

        # 3. Augmented prompt
        system_prompt = RAG_SYSTEM_PROMPT.format(context=context_block)

        # Include additional context if provided
        user_message = question
        if context:
            extra = "\n".join(f"- {k}: {v}" for k, v in context.items())
            user_message = f"{question}\n\nAdditional context:\n{extra}"

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message},
        ]

        # 4. Call LLM
        answer = await self._call_llm(messages)

        # 5. Append source citations
        if docs:
            sources = ", ".join(
                f"[{i}] {d['title']}" for i, d in enumerate(docs, 1)
            )
            answer += f"\n\n---\nSources: {sources}"

        return answer

    async def _call_llm(self, messages: List[Dict[str, str]]) -> str:
        """Call Ollama chat API with the given messages."""
        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(120.0)) as client:
                response = await client.post(
                    f"{self.llm_url}/api/chat",
                    json={
                        "model": self.model,
                        "messages": messages,
                        "stream": False,
                    },
                )
                response.raise_for_status()
                data = response.json()
                return data.get("message", {}).get("content", "")
        except httpx.ConnectError:
            logger.error("Cannot connect to Ollama at %s", self.llm_url)
            return (
                "I'm sorry, I cannot generate a response right now because "
                "the LLM service is unavailable. Please try again later."
            )
        except httpx.HTTPStatusError as exc:
            logger.error("Ollama LLM error: %s", exc)
            return (
                f"An error occurred while generating the response: {exc.response.status_code}"
            )
        except Exception as exc:
            logger.error("Unexpected LLM error: %s", exc)
            return f"An unexpected error occurred: {exc}"
