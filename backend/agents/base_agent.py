"""
Base agent class for all micro-agents.

Every agent is a standalone FastAPI service that:
- Registers its MCP tools with the central orchestrator
- Exposes an A2A agent card at ``/.well-known/agent.json``
- Maintains a heartbeat loop so the orchestrator knows it is alive
- Uses Redis (async) for pub/sub and shared state
"""

import asyncio
import json
import logging
import os
import signal
from typing import Any, Dict, List, Optional

import httpx
import redis.asyncio as aioredis
import uvicorn
from fastapi import FastAPI
from fastapi.responses import JSONResponse

logger = logging.getLogger(__name__)


class BaseAgent:
    """Abstract base that every concrete agent extends."""

    def __init__(
        self,
        agent_name: Optional[str] = None,
        agent_port: Optional[int] = None,
        agent_type: str = "generic",
    ):
        self.agent_name: str = agent_name or os.getenv("AGENT_NAME", "unnamed-agent")
        self.agent_port: int = int(agent_port or os.getenv("AGENT_PORT", "8100"))
        self.agent_type: str = agent_type

        # External service URLs
        self._redis_url: str = os.getenv("REDIS_URL", "redis://localhost:6379/0")
        self._mcp_server_url: str = os.getenv("MCP_SERVER_URL", "http://localhost:8000/mcp")

        # Async Redis client (created on start)
        self.redis: Optional[aioredis.Redis] = None

        # FastAPI application
        self.app = FastAPI(title=f"{self.agent_name} Agent")

        # Heartbeat task handle
        self._heartbeat_task: Optional[asyncio.Task] = None

        # Register default routes
        self._register_default_routes()

    # ------------------------------------------------------------------
    # Default routes
    # ------------------------------------------------------------------

    def _register_default_routes(self) -> None:
        """Wire up health-check and A2A agent-card endpoints."""

        @self.app.get("/health")
        async def health_check():
            return await self.health_check()

        @self.app.get("/.well-known/agent.json")
        async def agent_card():
            return JSONResponse(content=self.get_agent_card())

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    async def start(self) -> None:
        """Initialise connections, register tools, begin heartbeat."""
        logger.info("Starting agent '%s' on port %d", self.agent_name, self.agent_port)

        # Connect to Redis
        self.redis = aioredis.from_url(self._redis_url, decode_responses=True)

        # Register MCP tools with orchestrator
        await self.register_with_orchestrator()

        # Start heartbeat loop
        self._heartbeat_task = asyncio.create_task(self._heartbeat_loop())

    async def stop(self) -> None:
        """Gracefully shut down the agent."""
        logger.info("Stopping agent '%s'", self.agent_name)

        if self._heartbeat_task:
            self._heartbeat_task.cancel()
            try:
                await self._heartbeat_task
            except asyncio.CancelledError:
                pass

        if self.redis:
            await self.redis.close()

    # ------------------------------------------------------------------
    # Orchestrator registration
    # ------------------------------------------------------------------

    async def register_with_orchestrator(self) -> None:
        """POST the agent's MCP tools to the central MCP server."""
        tools_payload = self.get_mcp_tools()
        payload = {
            "agent_name": self.agent_name,
            "tools": tools_payload,
        }

        url = f"{self._mcp_server_url}/agents/register"
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                response = await client.post(url, json=payload)
                response.raise_for_status()
                logger.info(
                    "Registered %d tool(s) with orchestrator: %s",
                    len(tools_payload),
                    response.json(),
                )
        except httpx.HTTPError as exc:
            logger.warning(
                "Failed to register with orchestrator at %s: %s", url, exc,
            )

    # ------------------------------------------------------------------
    # Heartbeat
    # ------------------------------------------------------------------

    async def _heartbeat_loop(self, interval: float = 5.0) -> None:
        """Send a heartbeat message to the orchestrator every *interval* seconds."""
        while True:
            try:
                if self.redis:
                    heartbeat = json.dumps({
                        "agent_name": self.agent_name,
                        "agent_type": self.agent_type,
                        "port": self.agent_port,
                        "status": "alive",
                    })
                    await self.redis.publish("agent:heartbeat", heartbeat)
                    await self.redis.set(
                        f"agent:heartbeat:{self.agent_name}",
                        heartbeat,
                        ex=15,  # TTL 15 seconds
                    )
            except Exception as exc:
                logger.error("Heartbeat error: %s", exc)

            await asyncio.sleep(interval)

    # ------------------------------------------------------------------
    # Health / Agent card
    # ------------------------------------------------------------------

    async def health_check(self) -> Dict[str, Any]:
        """Return basic health information."""
        return {
            "agent_name": self.agent_name,
            "agent_type": self.agent_type,
            "status": "ok",
        }

    def get_agent_card(self) -> Dict[str, Any]:
        """Generate an A2A agent card (served at ``/.well-known/agent.json``)."""
        return {
            "name": self.agent_name,
            "description": f"{self.agent_name} agent ({self.agent_type})",
            "url": f"http://localhost:{self.agent_port}",
            "version": "0.1.0",
            "capabilities": {
                "streaming": False,
                "pushNotifications": False,
            },
            "skills": [
                {
                    "id": tool["name"],
                    "name": tool["name"],
                    "description": tool.get("description", ""),
                }
                for tool in self.get_mcp_tools()
            ],
        }

    # ------------------------------------------------------------------
    # MCP tool declaration (override in subclasses)
    # ------------------------------------------------------------------

    def get_mcp_tools(self) -> List[Dict[str, Any]]:
        """Return a list of MCP tool definitions this agent exposes.

        Each entry should be a dict with keys:
        ``name``, ``description``, ``input_schema``.

        Subclasses **must** override this method.
        """
        return []

    # ------------------------------------------------------------------
    # Runner
    # ------------------------------------------------------------------

    def run(self) -> None:
        """Convenience method: wire up lifespan events and start uvicorn."""

        @self.app.on_event("startup")
        async def on_startup():
            await self.start()

        @self.app.on_event("shutdown")
        async def on_shutdown():
            await self.stop()

        uvicorn.run(self.app, host="0.0.0.0", port=self.agent_port)
