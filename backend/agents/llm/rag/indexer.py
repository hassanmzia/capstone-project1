"""
Document indexing for the RAG pipeline.

Handles chunking, embedding, and storing documents into the pgvector-backed
``rag_documents`` table for later semantic retrieval.
"""

import hashlib
import json
import logging
import os
import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import asyncpg

from .embedder import OllamaEmbedder

logger = logging.getLogger(__name__)

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://neural_admin:neural_secure_password_2024@localhost:5435/neural_interface",
)

# Chunking parameters
CHUNK_SIZE = 500       # target tokens (rough: 1 token ~ 4 chars)
CHUNK_OVERLAP = 50     # overlap in tokens


def _chunk_text(text: str, chunk_size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP) -> List[str]:
    """Split *text* into overlapping chunks of approximately *chunk_size* tokens.

    Uses a simple whitespace-based tokenizer (1 token ~ 1 word) for chunking.
    """
    words = text.split()
    if not words:
        return []

    chunks: List[str] = []
    start = 0
    while start < len(words):
        end = start + chunk_size
        chunk = " ".join(words[start:end])
        chunks.append(chunk)
        start += chunk_size - overlap
    return chunks


class DocumentIndexer:
    """Index documents into pgvector for RAG retrieval."""

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
            # Ensure the table and extension exist
            await self._ensure_schema()
        return self._pool

    async def _ensure_schema(self) -> None:
        """Create the rag_documents table if it does not exist."""
        pool = self._pool
        if pool is None:
            return
        async with pool.acquire() as conn:
            await conn.execute("CREATE EXTENSION IF NOT EXISTS vector;")
            await conn.execute("""
                CREATE TABLE IF NOT EXISTS rag_documents (
                    id            SERIAL PRIMARY KEY,
                    content       TEXT NOT NULL,
                    title         VARCHAR(512) DEFAULT '',
                    source_type   VARCHAR(100) NOT NULL,
                    source_id     INTEGER,
                    chunk_index   INTEGER DEFAULT 0,
                    content_hash  VARCHAR(64) NOT NULL,
                    embedding     vector(768),
                    metadata      JSONB DEFAULT '{}',
                    created_at    TIMESTAMPTZ DEFAULT NOW()
                );
            """)
            # Create an HNSW index for cosine similarity if not exists
            await conn.execute("""
                CREATE INDEX IF NOT EXISTS rag_documents_embedding_idx
                ON rag_documents
                USING hnsw (embedding vector_cosine_ops);
            """)

    async def close(self) -> None:
        if self._pool and not self._pool._closed:
            await self._pool.close()

    # ------------------------------------------------------------------
    # Indexing
    # ------------------------------------------------------------------

    async def index_document(
        self,
        content: str,
        source_type: str,
        source_id: int | None = None,
        title: str = "",
        metadata: Dict[str, Any] | None = None,
    ) -> int:
        """Chunk, embed, and insert a document into pgvector.

        Parameters
        ----------
        content:
            Full text of the document.
        source_type:
            E.g. ``"experiment"``, ``"annotation"``, ``"manual"``, ``"paper"``.
        source_id:
            Optional reference ID to the source record.
        title:
            Human-readable title.
        metadata:
            Arbitrary JSON metadata.

        Returns
        -------
        int
            Number of chunks indexed.
        """
        pool = await self._get_pool()
        meta = metadata or {}

        chunks = _chunk_text(content)
        if not chunks:
            logger.warning("No text to index (empty content).")
            return 0

        embeddings = await self.embedder.embed_batch(chunks)

        async with pool.acquire() as conn:
            inserted = 0
            for idx, (chunk, emb) in enumerate(zip(chunks, embeddings)):
                content_hash = hashlib.sha256(chunk.encode()).hexdigest()

                # Skip duplicates
                existing = await conn.fetchval(
                    "SELECT id FROM rag_documents WHERE content_hash = $1",
                    content_hash,
                )
                if existing:
                    logger.debug("Skipping duplicate chunk (hash=%s)", content_hash[:12])
                    continue

                emb_str = "[" + ",".join(str(v) for v in emb) + "]"
                await conn.execute(
                    """
                    INSERT INTO rag_documents
                        (content, title, source_type, source_id, chunk_index,
                         content_hash, embedding, metadata)
                    VALUES ($1, $2, $3, $4, $5, $6, $7::vector, $8::jsonb)
                    """,
                    chunk,
                    title,
                    source_type,
                    source_id,
                    idx,
                    content_hash,
                    emb_str,
                    json.dumps(meta),
                )
                inserted += 1

        logger.info(
            "Indexed %d/%d chunks for '%s' (source_type=%s, source_id=%s)",
            inserted, len(chunks), title, source_type, source_id,
        )
        return inserted

    async def index_experiment(self, experiment_id: int) -> int:
        """Auto-index an experiment summary from the experiments table.

        Fetches the experiment record and indexes its description/notes.
        """
        pool = await self._get_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT id, title, description, notes, status, created_at
                FROM experiments_experiment
                WHERE id = $1
                """,
                experiment_id,
            )
            if not row:
                logger.warning("Experiment %d not found.", experiment_id)
                return 0

        text_parts = [
            f"Experiment: {row['title']}",
            f"Description: {row['description'] or 'N/A'}",
            f"Notes: {row['notes'] or 'N/A'}",
            f"Status: {row['status']}",
            f"Created: {row['created_at']}",
        ]
        content = "\n".join(text_parts)
        return await self.index_document(
            content=content,
            source_type="experiment",
            source_id=experiment_id,
            title=row["title"] or f"Experiment #{experiment_id}",
            metadata={"status": row["status"]},
        )

    async def index_annotation(self, annotation_id: int) -> int:
        """Index a researcher annotation/note.

        Fetches the annotation and indexes it for later RAG retrieval.
        """
        pool = await self._get_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT id, content, annotation_type, created_at,
                       recording_id, timestamp_ms
                FROM recordings_annotation
                WHERE id = $1
                """,
                annotation_id,
            )
            if not row:
                logger.warning("Annotation %d not found.", annotation_id)
                return 0

        content = row["content"] or ""
        return await self.index_document(
            content=content,
            source_type="annotation",
            source_id=annotation_id,
            title=f"Annotation #{annotation_id}",
            metadata={
                "annotation_type": row.get("annotation_type"),
                "recording_id": row.get("recording_id"),
                "timestamp_ms": row.get("timestamp_ms"),
            },
        )
