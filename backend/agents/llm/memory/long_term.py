"""
Long-term semantic memory backed by PostgreSQL + pgvector.

Stores durable facts, insights, and context that persist across sessions.
Wraps the RAG document store with a memory-specific API.
"""

import json
import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

import asyncpg

from ..rag.embedder import OllamaEmbedder

logger = logging.getLogger(__name__)

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://neural_admin:neural_secure_password_2024@localhost:5435/neural_interface",
)


class LongTermMemory:
    """Semantic long-term memory using PostgreSQL and pgvector.

    Facts are stored in the ``rag_documents`` table with
    ``source_type = 'memory_episodic'`` or ``'memory_procedural'``.
    """

    def __init__(
        self,
        embedder: OllamaEmbedder,
        db_url: str | None = None,
    ):
        self.embedder = embedder
        self.db_url = db_url or DATABASE_URL
        self._pool: Optional[asyncpg.Pool] = None

    async def _get_pool(self) -> asyncpg.Pool:
        if self._pool is None or self._pool._closed:
            self._pool = await asyncpg.create_pool(self.db_url, min_size=1, max_size=5)
        return self._pool

    async def close(self) -> None:
        if self._pool and not self._pool._closed:
            await self._pool.close()

    # ------------------------------------------------------------------
    # Store
    # ------------------------------------------------------------------

    async def store_fact(
        self,
        content: str,
        source_type: str = "memory_episodic",
        metadata: Dict[str, Any] | None = None,
    ) -> int:
        """Store a fact or insight into long-term memory.

        Parameters
        ----------
        content:
            The fact or insight to store.
        source_type:
            One of ``'memory_episodic'``, ``'memory_procedural'``.
        metadata:
            Optional JSON metadata (user_id, session_id, etc.).

        Returns
        -------
        int
            The ID of the inserted record.
        """
        pool = await self._get_pool()
        try:
            embedding = await self.embedder.embed(content)
        except Exception as exc:
            logger.error("Failed to embed fact for long-term memory: %s", exc)
            raise

        import hashlib
        content_hash = hashlib.sha256(content.encode()).hexdigest()
        emb_str = "[" + ",".join(str(v) for v in embedding) + "]"
        meta_json = json.dumps(metadata or {})

        async with pool.acquire() as conn:
            # Check for duplicate
            existing = await conn.fetchval(
                "SELECT id FROM rag_documents WHERE content_hash = $1",
                content_hash,
            )
            if existing:
                logger.debug("Fact already exists in long-term memory (id=%d)", existing)
                return existing

            row_id = await conn.fetchval(
                """
                INSERT INTO rag_documents
                    (content, title, source_type, chunk_index, content_hash,
                     embedding, metadata)
                VALUES ($1, $2, $3, 0, $4, $5::vector, $6::jsonb)
                RETURNING id
                """,
                content,
                f"Memory: {content[:60]}...",
                source_type,
                content_hash,
                emb_str,
                meta_json,
            )
            logger.info("Stored fact to long-term memory (id=%d, type=%s)", row_id, source_type)
            return row_id

    # ------------------------------------------------------------------
    # Retrieve
    # ------------------------------------------------------------------

    async def search_facts(
        self,
        query: str,
        top_k: int = 5,
    ) -> List[Dict[str, Any]]:
        """Search long-term memory for facts relevant to a query.

        Parameters
        ----------
        query:
            Natural language query.
        top_k:
            Max results to return.

        Returns
        -------
        list[dict]
            Matching facts with similarity scores.
        """
        try:
            query_embedding = await self.embedder.embed(query)
        except Exception as exc:
            logger.error("Failed to embed query for memory search: %s", exc)
            return []

        emb_str = "[" + ",".join(str(v) for v in query_embedding) + "]"
        pool = await self._get_pool()

        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT
                    id, content, source_type, metadata,
                    1 - (embedding <=> $1::vector) AS similarity_score
                FROM rag_documents
                WHERE source_type IN ('memory_episodic', 'memory_procedural')
                ORDER BY embedding <=> $1::vector
                LIMIT $2
                """,
                emb_str,
                top_k,
            )

        results = []
        for row in rows:
            score = float(row["similarity_score"])
            if score < 0.4:
                continue
            meta = row["metadata"]
            if isinstance(meta, str):
                meta = json.loads(meta)
            results.append({
                "id": row["id"],
                "content": row["content"],
                "source_type": row["source_type"],
                "similarity_score": round(score, 4),
                "metadata": meta,
            })
        return results

    async def get_recent_facts(
        self,
        days: int = 30,
        limit: int = 20,
    ) -> List[Dict[str, Any]]:
        """Get the most recently stored facts.

        Parameters
        ----------
        days:
            Look back this many days.
        limit:
            Maximum number of facts to return.
        """
        pool = await self._get_pool()
        cutoff = datetime.now(timezone.utc) - timedelta(days=days)

        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT id, content, source_type, metadata, created_at
                FROM rag_documents
                WHERE source_type IN ('memory_episodic', 'memory_procedural')
                  AND created_at >= $1
                ORDER BY created_at DESC
                LIMIT $2
                """,
                cutoff,
                limit,
            )

        results = []
        for row in rows:
            meta = row["metadata"]
            if isinstance(meta, str):
                meta = json.loads(meta)
            results.append({
                "id": row["id"],
                "content": row["content"],
                "source_type": row["source_type"],
                "created_at": row["created_at"].isoformat(),
                "metadata": meta,
            })
        return results
