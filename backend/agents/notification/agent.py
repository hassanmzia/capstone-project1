"""
Notification Agent.

Handles alerts, emails, webhooks, and push notifications triggered
by other agents or system events.  Monitors threshold-based alerts
and broadcasts real-time notifications via Redis pub/sub.
"""

import asyncio
import json
import logging
import os
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, List, Optional

import redis.asyncio as aioredis
from pydantic import BaseModel, Field

from agents.base_agent import BaseAgent

logger = logging.getLogger(__name__)


# ── Models ───────────────────────────────────────────────────────────
class Severity(str, Enum):
    INFO = "info"
    WARNING = "warning"
    CRITICAL = "critical"


class NotificationChannel(str, Enum):
    WEBSOCKET = "websocket"
    EMAIL = "email"
    WEBHOOK = "webhook"
    LOG = "log"


class AlertPayload(BaseModel):
    severity: Severity = Severity.INFO
    message: str
    source_agent: str = "system"
    channels: List[NotificationChannel] = Field(
        default_factory=lambda: [NotificationChannel.WEBSOCKET, NotificationChannel.LOG]
    )
    metadata: Dict[str, Any] = Field(default_factory=dict)


class ThresholdRule(BaseModel):
    metric: str
    threshold: float
    direction: str = "above"  # "above" | "below"
    channel: int = -1  # -1 = all channels
    severity: Severity = Severity.WARNING
    cooldown_seconds: int = 30
    enabled: bool = True


class EventLog(BaseModel):
    event_type: str
    details: Dict[str, Any] = Field(default_factory=dict)
    session_id: Optional[str] = None


# ── Agent ────────────────────────────────────────────────────────────
class NotificationAgent(BaseAgent):
    """Agent that dispatches notifications across channels."""

    def __init__(self):
        super().__init__(
            agent_name=os.getenv("AGENT_NAME", "notification"),
            agent_port=int(os.getenv("AGENT_PORT", "8093")),
            agent_type="notification",
        )
        self.threshold_rules: Dict[str, ThresholdRule] = {}
        self.alert_history: List[Dict[str, Any]] = []
        self.event_log: List[Dict[str, Any]] = []
        self._cooldowns: Dict[str, datetime] = {}
        self._redis: Optional[aioredis.Redis] = None
        self._monitor_task: Optional[asyncio.Task] = None
        self._register_routes()

    # ── Redis connection ─────────────────────────────────────────────
    async def _get_redis(self) -> aioredis.Redis:
        if self._redis is None:
            redis_url = os.getenv("REDIS_URL", "redis://localhost:6385")
            self._redis = aioredis.from_url(redis_url, decode_responses=True)
        return self._redis

    # ── Routes ───────────────────────────────────────────────────────
    def _register_routes(self) -> None:
        @self.app.on_event("startup")
        async def startup():
            self._monitor_task = asyncio.create_task(self._threshold_monitor_loop())

        @self.app.on_event("shutdown")
        async def shutdown():
            if self._monitor_task:
                self._monitor_task.cancel()
            if self._redis:
                await self._redis.close()

        @self.app.post("/notify")
        async def send_notification(payload: AlertPayload):
            """Send a notification through specified channels."""
            result = await self._dispatch_alert(payload)
            return result

        @self.app.post("/threshold")
        async def set_threshold(rule: ThresholdRule):
            """Create or update a threshold-based alert rule."""
            rule_id = f"{rule.metric}_{rule.channel}_{rule.direction}"
            self.threshold_rules[rule_id] = rule
            return {"status": "created", "rule_id": rule_id, "rule": rule.model_dump()}

        @self.app.delete("/threshold/{rule_id}")
        async def delete_threshold(rule_id: str):
            """Delete a threshold alert rule."""
            if rule_id in self.threshold_rules:
                del self.threshold_rules[rule_id]
                return {"status": "deleted", "rule_id": rule_id}
            return {"status": "not_found", "rule_id": rule_id}

        @self.app.get("/threshold")
        async def list_thresholds():
            """List all active threshold rules."""
            return {
                "rules": {k: v.model_dump() for k, v in self.threshold_rules.items()},
                "count": len(self.threshold_rules),
            }

        @self.app.post("/event")
        async def log_event(event: EventLog):
            """Log an experiment event or annotation."""
            entry = {
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "event_type": event.event_type,
                "details": event.details,
                "session_id": event.session_id,
            }
            self.event_log.append(entry)
            # Keep last 10000 entries
            if len(self.event_log) > 10000:
                self.event_log = self.event_log[-10000:]
            # Broadcast via Redis
            try:
                r = await self._get_redis()
                await r.publish("events", json.dumps(entry))
            except Exception as e:
                logger.warning("Failed to publish event: %s", e)
            return {"status": "logged", "entry": entry}

        @self.app.get("/events")
        async def get_events(
            event_type: Optional[str] = None,
            session_id: Optional[str] = None,
            limit: int = 100,
        ):
            """Retrieve event log entries."""
            events = self.event_log
            if event_type:
                events = [e for e in events if e["event_type"] == event_type]
            if session_id:
                events = [e for e in events if e.get("session_id") == session_id]
            return {"events": events[-limit:], "total": len(events)}

        @self.app.get("/alerts")
        async def get_alerts(severity: Optional[str] = None, limit: int = 50):
            """Retrieve alert history."""
            alerts = self.alert_history
            if severity:
                alerts = [a for a in alerts if a.get("severity") == severity]
            return {"alerts": alerts[-limit:], "total": len(alerts)}

        @self.app.get("/system-health")
        async def system_health():
            """Get health summary of all subsystems."""
            return await self._get_system_health()

    # ── Alert dispatch ───────────────────────────────────────────────
    async def _dispatch_alert(self, payload: AlertPayload) -> Dict[str, Any]:
        """Dispatch an alert to all specified channels."""
        alert_record = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "severity": payload.severity.value,
            "message": payload.message,
            "source_agent": payload.source_agent,
            "channels_dispatched": [],
            "metadata": payload.metadata,
        }

        for channel in payload.channels:
            try:
                if channel == NotificationChannel.WEBSOCKET:
                    await self._send_websocket(payload)
                    alert_record["channels_dispatched"].append("websocket")
                elif channel == NotificationChannel.LOG:
                    self._send_log(payload)
                    alert_record["channels_dispatched"].append("log")
                elif channel == NotificationChannel.WEBHOOK:
                    await self._send_webhook(payload)
                    alert_record["channels_dispatched"].append("webhook")
                elif channel == NotificationChannel.EMAIL:
                    await self._send_email(payload)
                    alert_record["channels_dispatched"].append("email")
            except Exception as e:
                logger.error("Failed to dispatch to %s: %s", channel, e)

        self.alert_history.append(alert_record)
        if len(self.alert_history) > 5000:
            self.alert_history = self.alert_history[-5000:]

        return {"status": "dispatched", "alert": alert_record}

    async def _send_websocket(self, payload: AlertPayload) -> None:
        """Broadcast alert via Redis pub/sub to WebSocket consumers."""
        r = await self._get_redis()
        msg = json.dumps({
            "type": "notification",
            "severity": payload.severity.value,
            "message": payload.message,
            "source": payload.source_agent,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "metadata": payload.metadata,
        })
        await r.publish("notifications", msg)

    def _send_log(self, payload: AlertPayload) -> None:
        """Log alert to structured logger."""
        log_level = {
            Severity.INFO: logging.INFO,
            Severity.WARNING: logging.WARNING,
            Severity.CRITICAL: logging.CRITICAL,
        }.get(payload.severity, logging.INFO)
        logger.log(
            log_level,
            "[%s] %s (from %s)",
            payload.severity.value.upper(),
            payload.message,
            payload.source_agent,
        )

    async def _send_webhook(self, payload: AlertPayload) -> None:
        """Send alert to configured webhook URLs."""
        webhook_urls = os.getenv("WEBHOOK_URLS", "").split(",")
        webhook_urls = [u.strip() for u in webhook_urls if u.strip()]
        if not webhook_urls:
            return
        import httpx
        async with httpx.AsyncClient(timeout=10) as client:
            for url in webhook_urls:
                try:
                    await client.post(url, json={
                        "severity": payload.severity.value,
                        "message": payload.message,
                        "source": payload.source_agent,
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                    })
                except Exception as e:
                    logger.warning("Webhook %s failed: %s", url, e)

    async def _send_email(self, payload: AlertPayload) -> None:
        """Send email notification (placeholder for SMTP integration)."""
        logger.info(
            "Email notification [%s]: %s (SMTP not configured)",
            payload.severity.value,
            payload.message,
        )

    # ── Threshold monitoring ─────────────────────────────────────────
    async def _threshold_monitor_loop(self) -> None:
        """Subscribe to telemetry data and check threshold rules."""
        try:
            r = await self._get_redis()
            pubsub = r.pubsub()
            await pubsub.subscribe("telemetry", "neural_metrics")
            logger.info("Threshold monitor started, watching %d rules", len(self.threshold_rules))

            async for message in pubsub.listen():
                if message["type"] != "message":
                    continue
                try:
                    data = json.loads(message["data"])
                    await self._check_thresholds(data)
                except (json.JSONDecodeError, Exception) as e:
                    logger.debug("Threshold check error: %s", e)
        except asyncio.CancelledError:
            logger.info("Threshold monitor stopped")
        except Exception as e:
            logger.error("Threshold monitor error: %s", e)

    async def _check_thresholds(self, data: Dict[str, Any]) -> None:
        """Check incoming data against configured threshold rules."""
        now = datetime.now(timezone.utc)

        for rule_id, rule in self.threshold_rules.items():
            if not rule.enabled:
                continue

            # Check cooldown
            last_triggered = self._cooldowns.get(rule_id)
            if last_triggered:
                elapsed = (now - last_triggered).total_seconds()
                if elapsed < rule.cooldown_seconds:
                    continue

            value = data.get(rule.metric)
            if value is None:
                continue

            triggered = False
            if rule.direction == "above" and value > rule.threshold:
                triggered = True
            elif rule.direction == "below" and value < rule.threshold:
                triggered = True

            if triggered:
                self._cooldowns[rule_id] = now
                await self._dispatch_alert(AlertPayload(
                    severity=rule.severity,
                    message=(
                        f"Threshold alert: {rule.metric} = {value:.3f} "
                        f"({rule.direction} {rule.threshold})"
                    ),
                    source_agent="threshold_monitor",
                    metadata={
                        "rule_id": rule_id,
                        "metric": rule.metric,
                        "value": value,
                        "threshold": rule.threshold,
                    },
                ))

    # ── System health ────────────────────────────────────────────────
    async def _get_system_health(self) -> Dict[str, Any]:
        """Aggregate health from all agents via Redis."""
        health = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "notification_agent": "healthy",
            "threshold_rules_active": len([r for r in self.threshold_rules.values() if r.enabled]),
            "alerts_total": len(self.alert_history),
            "events_total": len(self.event_log),
            "agents": {},
        }
        try:
            r = await self._get_redis()
            agent_names = [
                "data_acquisition", "signal_processing", "hardware_control",
                "storage", "ai_ml", "llm",
            ]
            for name in agent_names:
                heartbeat = await r.get(f"agent:{name}:heartbeat")
                if heartbeat:
                    last_seen = json.loads(heartbeat)
                    health["agents"][name] = {
                        "status": "healthy",
                        "last_heartbeat": last_seen.get("timestamp"),
                    }
                else:
                    health["agents"][name] = {"status": "unknown"}
        except Exception as e:
            logger.warning("Health check error: %s", e)
            health["redis_status"] = "error"

        # Count critical alerts in last hour
        recent_critical = 0
        cutoff = datetime.now(timezone.utc).isoformat()[:13]  # Current hour
        for alert in self.alert_history[-100:]:
            if alert.get("severity") == "critical" and alert.get("timestamp", "")[:13] >= cutoff:
                recent_critical += 1
        health["critical_alerts_this_hour"] = recent_critical

        return health

    # ── MCP tools ────────────────────────────────────────────────────
    def get_mcp_tools(self) -> List[Dict[str, Any]]:
        return [
            {
                "name": "notification.send_alert",
                "description": "Send an alert about a neural interface event (e.g. impedance change, signal loss, stimulation fault).",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "severity": {"type": "string", "enum": ["info", "warning", "critical"], "description": "Alert severity level"},
                        "message": {"type": "string", "description": "Alert message body"},
                        "source_agent": {"type": "string", "description": "Agent that triggered the alert"},
                    },
                    "required": ["severity", "message"],
                },
            },
            {
                "name": "notification.set_threshold_alert",
                "description": "Configure an automatic alert when a neural signal metric crosses a threshold.",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "metric": {"type": "string", "description": "Metric to monitor (e.g. spike_rate, impedance, snr)"},
                        "threshold": {"type": "number", "description": "Threshold value"},
                        "direction": {"type": "string", "enum": ["above", "below"], "description": "Trigger when metric goes above or below threshold"},
                        "channel": {"type": "integer", "description": "Channel to monitor, or -1 for all"},
                    },
                    "required": ["metric", "threshold", "direction"],
                },
            },
            {
                "name": "notification.get_system_health",
                "description": "Get a health summary of all neural interface subsystems.",
                "input_schema": {
                    "type": "object",
                    "properties": {},
                },
            },
            {
                "name": "notification.log_event",
                "description": "Log an experiment event or annotation with a timestamp.",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "event_type": {"type": "string", "description": "Event category (e.g. stimulation_start, recording_pause, impedance_check)"},
                        "details": {"type": "object", "description": "Additional event details"},
                        "session_id": {"type": "string", "description": "Associated recording session ID"},
                    },
                    "required": ["event_type"],
                },
            },
        ]


def main() -> None:
    agent = NotificationAgent()
    agent.run()


if __name__ == "__main__":
    main()
