"""
pgvector similarity search for RAG document retrieval.

Performs cosine-similarity queries against the ``rag_documents`` table to
find the most relevant chunks for a given user query.
"""

import json
import logging
import os
from typing import Any, Dict, List, Optional

import asyncpg

from .embedder import OllamaEmbedder

logger = logging.getLogger(__name__)

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://neural_admin:neural_secure_password_2024@localhost:5435/neural_interface",
)

MIN_SIMILARITY_THRESHOLD = 0.5


class DocumentRetriever:
    """Search pgvector for documents semantically similar to a query."""

    def __init__(
        self,
        embedder: OllamaEmbedder,
        db_url: str | None = None,
    ):
        self.embedder = embedder
        self.db_url = db_url or DATABASE_URL
        self._pool: Optional[asyncpg.Pool] = None

    # ------------------------------------------------------------------
    # Connection pool
    # ------------------------------------------------------------------

    async def _get_pool(self) -> asyncpg.Pool:
        if self._pool is None or self._pool._closed:
            self._pool = await asyncpg.create_pool(self.db_url, min_size=1, max_size=5)
        return self._pool

    async def close(self) -> None:
        if self._pool and not self._pool._closed:
            await self._pool.close()

    # ------------------------------------------------------------------
    # Search
    # ------------------------------------------------------------------

    async def search(
        self,
        query: str,
        top_k: int = 5,
        source_types: List[str] | None = None,
    ) -> List[Dict[str, Any]]:
        """Embed the query and search for similar documents.

        Parameters
        ----------
        query:
            Natural language query string.
        top_k:
            Maximum number of results to return.
        source_types:
            Optional filter by document source_type (e.g. ``["experiment", "annotation"]``).

        Returns
        -------
        list[dict]
            Each dict contains: ``content``, ``title``, ``source_type``,
            ``source_id``, ``similarity_score``, ``metadata``.
        """
        try:
            query_embedding = await self.embedder.embed(query)
        except Exception as exc:
            logger.error("Failed to embed query: %s", exc)
            return []

        emb_str = "[" + ",".join(str(v) for v in query_embedding) + "]"

        pool = await self._get_pool()

        # Build optional source_type filter
        source_filter = ""
        params: list = [emb_str, top_k]
        if source_types:
            placeholders = ", ".join(f"${i + 3}" for i in range(len(source_types)))
            source_filter = f"AND source_type IN ({placeholders})"
            params.extend(source_types)

        sql = f"""
            SELECT
                content,
                title,
                source_type,
                source_id,
                metadata,
                1 - (embedding <=> $1::vector) AS similarity_score
            FROM rag_documents
            WHERE 1 = 1
              {source_filter}
            ORDER BY embedding <=> $1::vector
            LIMIT $2
        """

        async with pool.acquire() as conn:
            rows = await conn.fetch(sql, *params)

        results: List[Dict[str, Any]] = []
        for row in rows:
            score = float(row["similarity_score"])
            if score < MIN_SIMILARITY_THRESHOLD:
                continue
            meta = row["metadata"]
            if isinstance(meta, str):
                meta = json.loads(meta)
            results.append({
                "content": row["content"],
                "title": row["title"],
                "source_type": row["source_type"],
                "source_id": row["source_id"],
                "similarity_score": round(score, 4),
                "metadata": meta,
            })

        logger.info(
            "RAG search for '%s' returned %d results (top_k=%d).",
            query[:60], len(results), top_k,
        )
        return results
