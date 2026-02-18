"""
Natural Language to SQL generator.

Uses an LLM to translate natural-language questions into safe, read-only
SQL queries against the neural interface database schema.
"""

import logging
import os
import re
from typing import Any, Dict, List, Optional

import asyncpg
import httpx

logger = logging.getLogger(__name__)

OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:12434")
OLLAMA_CHAT_MODEL = os.getenv("OLLAMA_CHAT_MODEL", "deepseek-r1:7b")
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://neural_admin:neural_secure_password_2024@localhost:5435/neural_interface",
)

# SQL keywords that indicate mutation
MUTATION_KEYWORDS = [
    "INSERT", "UPDATE", "DELETE", "DROP", "ALTER", "TRUNCATE",
    "CREATE", "GRANT", "REVOKE", "EXEC", "EXECUTE",
    "MERGE", "REPLACE", "CALL",
]

NL_TO_SQL_SYSTEM_PROMPT = """You are a SQL query generator for a neural interface research database.

Given the database schema below, generate a PostgreSQL SELECT query to answer the user's question.

RULES:
1. ONLY generate SELECT statements. Never generate INSERT, UPDATE, DELETE, DROP, or any mutation.
2. Always use table aliases for clarity.
3. Limit results to 100 rows unless the user asks for more.
4. Use appropriate JOINs when crossing tables.
5. Return ONLY the SQL query, no explanation.

DATABASE SCHEMA:
{schema}

Generate ONLY the SQL query. No markdown, no explanations."""


class NLToSQL:
    """Translate natural language questions into safe SQL queries."""

    def __init__(
        self,
        llm_url: str | None = None,
        model: str | None = None,
        db_url: str | None = None,
    ):
        self.llm_url = (llm_url or OLLAMA_BASE_URL).rstrip("/")
        self.model = model or OLLAMA_CHAT_MODEL
        self.db_url = db_url or DATABASE_URL
        self._pool: Optional[asyncpg.Pool] = None

    async def _get_pool(self) -> asyncpg.Pool:
        if self._pool is None or self._pool._closed:
            self._pool = await asyncpg.create_pool(self.db_url, min_size=1, max_size=3)
        return self._pool

    async def close(self) -> None:
        if self._pool and not self._pool._closed:
            await self._pool.close()

    # ------------------------------------------------------------------
    # Query generation
    # ------------------------------------------------------------------

    async def generate_query(
        self,
        question: str,
        schema_context: str | None = None,
    ) -> str:
        """Generate a SQL query from a natural-language question.

        Parameters
        ----------
        question:
            The user's question in plain English.
        schema_context:
            Optional schema description. If not provided, a default schema
            summary for the neural interface database is used.

        Returns
        -------
        str
            A validated, read-only SQL query.

        Raises
        ------
        ValueError
            If the generated query contains mutation statements or fails validation.
        """
        schema = schema_context or self._get_default_schema()
        system_prompt = NL_TO_SQL_SYSTEM_PROMPT.format(schema=schema)

        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(60.0)) as client:
                resp = await client.post(
                    f"{self.llm_url}/api/chat",
                    json={
                        "model": self.model,
                        "messages": [
                            {"role": "system", "content": system_prompt},
                            {"role": "user", "content": question},
                        ],
                        "stream": False,
                    },
                )
                resp.raise_for_status()
                raw_sql = resp.json().get("message", {}).get("content", "")
        except httpx.ConnectError:
            raise ConnectionError("Cannot connect to Ollama for SQL generation.")
        except Exception as exc:
            raise RuntimeError(f"SQL generation failed: {exc}") from exc

        # Clean up the response
        sql = self._clean_sql(raw_sql)

        # Validate
        self._validate_sql(sql)

        return sql

    # ------------------------------------------------------------------
    # Execution
    # ------------------------------------------------------------------

    async def execute_query(self, sql: str) -> List[Dict[str, Any]]:
        """Execute a validated SQL query and return results.

        Parameters
        ----------
        sql:
            A validated SELECT query.

        Returns
        -------
        list[dict]
            Query results as a list of dicts.
        """
        self._validate_sql(sql)
        pool = await self._get_pool()

        async with pool.acquire() as conn:
            # Use a read-only transaction
            async with conn.transaction(readonly=True):
                rows = await conn.fetch(sql)
                return [dict(row) for row in rows]

    # ------------------------------------------------------------------
    # Validation & sanitisation
    # ------------------------------------------------------------------

    @staticmethod
    def _clean_sql(raw: str) -> str:
        """Strip markdown code fences and whitespace from LLM output."""
        sql = raw.strip()
        # Remove markdown code blocks
        sql = re.sub(r"^```(?:sql)?\s*", "", sql)
        sql = re.sub(r"\s*```$", "", sql)
        sql = sql.strip()
        # Remove any trailing semicolons (we add our own if needed)
        sql = sql.rstrip(";").strip()
        return sql

    @staticmethod
    def _validate_sql(sql: str) -> None:
        """Validate that the SQL is a safe read-only query.

        Raises
        ------
        ValueError
            If the query contains mutation keywords or is not a SELECT.
        """
        if not sql:
            raise ValueError("Empty SQL query generated.")

        upper_sql = sql.upper().strip()

        # Must start with SELECT or WITH (for CTEs)
        if not (upper_sql.startswith("SELECT") or upper_sql.startswith("WITH")):
            raise ValueError(
                f"Only SELECT queries are allowed. Got: {sql[:50]}..."
            )

        # Check for mutation keywords
        # Use word boundary check to avoid false positives
        for keyword in MUTATION_KEYWORDS:
            pattern = rf"\b{keyword}\b"
            if re.search(pattern, upper_sql):
                raise ValueError(
                    f"Query contains forbidden keyword '{keyword}'. "
                    "Only read-only queries are permitted."
                )

        # Check for multiple statements (basic SQL injection protection)
        # Split on semicolons outside of quotes
        statements = [s.strip() for s in sql.split(";") if s.strip()]
        if len(statements) > 1:
            raise ValueError(
                "Multiple SQL statements detected. Only single queries are allowed."
            )

    @staticmethod
    def _get_default_schema() -> str:
        """Return a description of the neural interface database schema."""
        return """
Tables:
- experiments_experiment (id, title, description, notes, status, protocol, created_at, updated_at, researcher_id)
- recordings_recording (id, experiment_id, name, status, sample_rate, duration_seconds, channel_count, file_path, file_size_bytes, created_at, started_at, stopped_at)
- recordings_annotation (id, recording_id, content, annotation_type, timestamp_ms, created_at, user_id)
- hardware_device (id, name, device_type, serial_number, status, firmware_version, config, created_at)
- users_user (id, username, email, first_name, last_name, role, is_active, date_joined)
- analysis_analysisresult (id, recording_id, analysis_type, parameters, results, status, created_at)
- presets_preset (id, name, description, preset_type, config, is_default, created_at, user_id)
- agent_registry (id, agent_name, agent_url, agent_type, port, status, capabilities, mcp_tools, last_heartbeat)
"""
