"""
Procedural memory: user preference learning.

Tracks user preferences inferred from repeated actions and stores them
in a ``user_preferences`` table for personalisation.
"""

import json
import logging
import os
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import asyncpg

logger = logging.getLogger(__name__)

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://neural_admin:neural_secure_password_2024@localhost:5435/neural_interface",
)


class ProceduralMemory:
    """Learn and store user preferences from repeated actions."""

    def __init__(self, db_url: str | None = None):
        self.db_url = db_url or DATABASE_URL
        self._pool: Optional[asyncpg.Pool] = None

    async def _get_pool(self) -> asyncpg.Pool:
        if self._pool is None or self._pool._closed:
            self._pool = await asyncpg.create_pool(self.db_url, min_size=1, max_size=3)
            await self._ensure_schema()
        return self._pool

    async def _ensure_schema(self) -> None:
        """Create the user_preferences table if it does not exist."""
        pool = self._pool
        if pool is None:
            return
        async with pool.acquire() as conn:
            await conn.execute("""
                CREATE TABLE IF NOT EXISTS user_preferences (
                    id            SERIAL PRIMARY KEY,
                    user_id       INTEGER NOT NULL,
                    pref_key      VARCHAR(255) NOT NULL,
                    pref_value    JSONB NOT NULL,
                    confidence    FLOAT DEFAULT 0.5,
                    learned_from  VARCHAR(500) DEFAULT '',
                    occurrence_count INTEGER DEFAULT 1,
                    created_at    TIMESTAMPTZ DEFAULT NOW(),
                    updated_at    TIMESTAMPTZ DEFAULT NOW(),
                    UNIQUE(user_id, pref_key)
                );
            """)
            await conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_user_preferences_user_id
                ON user_preferences(user_id);
            """)

    async def close(self) -> None:
        if self._pool and not self._pool._closed:
            await self._pool.close()

    # ------------------------------------------------------------------
    # Store / Update
    # ------------------------------------------------------------------

    async def store_preference(
        self,
        user_id: int,
        key: str,
        value: Any,
        learned_from: str = "",
    ) -> None:
        """Store or update a user preference.

        If the preference already exists, its confidence and occurrence count
        are increased.

        Parameters
        ----------
        user_id:
            The user this preference belongs to.
        key:
            Preference key (e.g. ``"preferred_sample_rate"``).
        value:
            Preference value (stored as JSONB).
        learned_from:
            Description of where this was learned (e.g. ``"user set gain to 2x three times"``).
        """
        pool = await self._get_pool()
        value_json = json.dumps(value)

        async with pool.acquire() as conn:
            existing = await conn.fetchrow(
                "SELECT id, confidence, occurrence_count FROM user_preferences "
                "WHERE user_id = $1 AND pref_key = $2",
                user_id,
                key,
            )

            if existing:
                new_count = existing["occurrence_count"] + 1
                # Confidence grows with repeated observations, caps at 1.0
                new_confidence = min(1.0, existing["confidence"] + 0.1)
                await conn.execute(
                    """
                    UPDATE user_preferences
                    SET pref_value = $1::jsonb,
                        confidence = $2,
                        occurrence_count = $3,
                        learned_from = $4,
                        updated_at = NOW()
                    WHERE user_id = $5 AND pref_key = $6
                    """,
                    value_json,
                    new_confidence,
                    new_count,
                    learned_from,
                    user_id,
                    key,
                )
                logger.info(
                    "Updated preference %s for user %d (confidence=%.2f, count=%d)",
                    key, user_id, new_confidence, new_count,
                )
            else:
                await conn.execute(
                    """
                    INSERT INTO user_preferences
                        (user_id, pref_key, pref_value, confidence, learned_from)
                    VALUES ($1, $2, $3::jsonb, $4, $5)
                    """,
                    user_id,
                    key,
                    value_json,
                    0.5,
                    learned_from,
                )
                logger.info("Stored new preference %s for user %d", key, user_id)

    # ------------------------------------------------------------------
    # Retrieve
    # ------------------------------------------------------------------

    async def get_preferences(self, user_id: int) -> Dict[str, Any]:
        """Get all preferences for a user.

        Returns
        -------
        dict
            Mapping of ``pref_key`` to a dict with ``value``, ``confidence``,
            ``occurrence_count``, and ``learned_from``.
        """
        pool = await self._get_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT pref_key, pref_value, confidence, occurrence_count,
                       learned_from, updated_at
                FROM user_preferences
                WHERE user_id = $1
                ORDER BY confidence DESC
                """,
                user_id,
            )

        result: Dict[str, Any] = {}
        for row in rows:
            val = row["pref_value"]
            if isinstance(val, str):
                val = json.loads(val)
            result[row["pref_key"]] = {
                "value": val,
                "confidence": round(row["confidence"], 2),
                "occurrence_count": row["occurrence_count"],
                "learned_from": row["learned_from"],
                "updated_at": row["updated_at"].isoformat() if row["updated_at"] else None,
            }
        return result

    # ------------------------------------------------------------------
    # Learn from actions
    # ------------------------------------------------------------------

    async def learn_from_action(
        self,
        user_id: int,
        action: str,
        params: Dict[str, Any],
    ) -> None:
        """Infer preferences from a user action and store them.

        This inspects the action and its parameters to detect patterns
        that indicate user preferences.

        Parameters
        ----------
        user_id:
            The acting user.
        action:
            The action name (e.g. ``"start_recording"``, ``"configure_bias"``).
        params:
            The parameters used for the action.
        """
        # Mapping of actions to preference keys they may reveal
        action_preference_map: Dict[str, List[tuple]] = {
            "start_recording": [
                ("sample_rate", "preferred_sample_rate"),
                ("duration", "preferred_recording_duration"),
            ],
            "configure_bias": [
                ("voltage", "preferred_bias_voltage"),
            ],
            "set_gain_mode": [
                ("gain", "preferred_gain"),
                ("mode", "preferred_gain_mode"),
            ],
            "configure_tia": [
                ("resistance", "preferred_tia_resistance"),
            ],
            "filter_signal": [
                ("filter_type", "preferred_filter_type"),
                ("cutoff_low", "preferred_filter_low"),
                ("cutoff_high", "preferred_filter_high"),
            ],
            "export_data": [
                ("format", "preferred_export_format"),
            ],
        }

        mappings = action_preference_map.get(action, [])
        for param_key, pref_key in mappings:
            if param_key in params and params[param_key] is not None:
                await self.store_preference(
                    user_id=user_id,
                    key=pref_key,
                    value=params[param_key],
                    learned_from=f"User performed '{action}' with {param_key}={params[param_key]}",
                )
