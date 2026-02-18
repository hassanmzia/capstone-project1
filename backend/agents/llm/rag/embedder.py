"""
Ollama embedding client for RAG pipeline.

Uses the Ollama API to generate text embeddings via the nomic-embed-text model.
Produces 768-dimensional vectors suitable for pgvector cosine similarity search.
"""

import logging
import os
from typing import List

import httpx

logger = logging.getLogger(__name__)

OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:12434")
OLLAMA_EMBED_MODEL = os.getenv("OLLAMA_EMBED_MODEL", "nomic-embed-text")


class OllamaEmbedder:
    """Asynchronous embedding client backed by Ollama."""

    def __init__(
        self,
        base_url: str | None = None,
        model: str | None = None,
        timeout: float = 30.0,
    ):
        self.base_url = (base_url or OLLAMA_BASE_URL).rstrip("/")
        self.model = model or OLLAMA_EMBED_MODEL
        self.timeout = timeout
        self._client: httpx.AsyncClient | None = None

    # ------------------------------------------------------------------
    # Client lifecycle
    # ------------------------------------------------------------------

    async def _get_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                base_url=self.base_url,
                timeout=httpx.Timeout(self.timeout),
            )
        return self._client

    async def close(self) -> None:
        if self._client and not self._client.is_closed:
            await self._client.aclose()
            self._client = None

    # ------------------------------------------------------------------
    # Embedding
    # ------------------------------------------------------------------

    async def embed(self, text: str) -> List[float]:
        """Embed a single text string and return a 768-dim vector.

        Parameters
        ----------
        text:
            The text to embed.

        Returns
        -------
        list[float]
            The embedding vector (typically 768 dimensions for nomic-embed-text).
        """
        client = await self._get_client()
        try:
            response = await client.post(
                "/api/embeddings",
                json={"model": self.model, "prompt": text},
            )
            response.raise_for_status()
            data = response.json()
            embedding = data.get("embedding", [])
            if not embedding:
                logger.error("Empty embedding returned for text: %s...", text[:80])
                raise ValueError("Ollama returned an empty embedding vector.")
            return embedding
        except httpx.HTTPStatusError as exc:
            logger.error(
                "Ollama embedding HTTP error %s: %s", exc.response.status_code, exc
            )
            raise
        except httpx.ConnectError as exc:
            logger.error("Cannot connect to Ollama at %s: %s", self.base_url, exc)
            raise ConnectionError(
                f"Cannot connect to Ollama at {self.base_url}. "
                "Ensure the Ollama server is running."
            ) from exc

    async def embed_batch(self, texts: List[str]) -> List[List[float]]:
        """Embed multiple texts and return a list of vectors.

        Parameters
        ----------
        texts:
            A list of text strings to embed.

        Returns
        -------
        list[list[float]]
            A list of embedding vectors, one per input text.
        """
        results: List[List[float]] = []
        for text in texts:
            vec = await self.embed(text)
            results.append(vec)
        return results
