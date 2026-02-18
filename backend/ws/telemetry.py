"""
WebSocket consumer for system telemetry.

Streams real-time hardware telemetry data (USB throughput, buffer
utilization, packet loss, FPGA temperature, sample rate, agent status)
to connected dashboard / visualization clients.
"""

import asyncio
import json
import logging
import random
import time

from channels.generic.websocket import AsyncWebsocketConsumer

logger = logging.getLogger(__name__)

TELEMETRY_GROUP = "telemetry_updates"


class TelemetryConsumer(AsyncWebsocketConsumer):
    """Async WebSocket consumer that pushes periodic system telemetry."""

    async def connect(self):
        """Accept the connection and start the telemetry push loop."""
        self.group_name = TELEMETRY_GROUP

        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()
        logger.info("Telemetry WebSocket connected: %s", self.channel_name)

        # Start a background task that sends telemetry every second
        self._running = True
        self._task = asyncio.ensure_future(self._telemetry_loop())

    async def disconnect(self, close_code):
        """Stop the telemetry loop and leave the broadcast group."""
        self._running = False
        if hasattr(self, "_task"):
            self._task.cancel()
        await self.channel_layer.group_discard(self.group_name, self.channel_name)
        logger.info(
            "Telemetry WebSocket disconnected: %s (code=%s)",
            self.channel_name,
            close_code,
        )

    async def receive(self, text_data=None, bytes_data=None):
        """Handle incoming messages (e.g. configuration requests)."""
        if text_data:
            try:
                payload = json.loads(text_data)
                msg_type = payload.get("type", "unknown")
                logger.debug("Telemetry WS received: %s", msg_type)
            except json.JSONDecodeError:
                await self.send(
                    text_data=json.dumps({"error": "Invalid JSON payload"})
                )

    async def _telemetry_loop(self):
        """Push simulated system telemetry at 1 Hz."""
        try:
            while self._running:
                telemetry = {
                    "type": "telemetry",
                    "timestamp": time.time(),
                    "usbThroughputMbps": 420 + random.uniform(-30, 30),
                    "bufferUtilization": 25 + random.uniform(0, 30),
                    "packetLossCount": 0,
                    "packetLossRate": 0.0,
                    "sampleRate": 30000,
                    "fpgaTemp": 34 + random.uniform(0, 6),
                    "recordingActive": False,
                    "recordingStartTime": None,
                    "agents": [
                        {
                            "name": "Spike Detector",
                            "status": "online",
                            "lastHeartbeat": time.time(),
                        },
                        {
                            "name": "Data Archiver",
                            "status": "online",
                            "lastHeartbeat": time.time(),
                        },
                        {
                            "name": "Burst Analyzer",
                            "status": "online",
                            "lastHeartbeat": time.time(),
                        },
                    ],
                }

                await self.send(text_data=json.dumps(telemetry))
                await asyncio.sleep(1)
        except asyncio.CancelledError:
            pass
        except Exception as exc:
            logger.error("Telemetry loop error: %s", exc)

    # ── Group message handlers ───────────────────────────────────────────

    async def telemetry_message(self, event):
        """Forward a telemetry update from the channel layer to the client."""
        await self.send(text_data=json.dumps(event.get("data", {})))
