"""
Bridge between LangGraph and MCP tool ecosystem.

Translates LangGraph tool calls into MCP/A2A HTTP requests to other agents,
and handles permission tiers.
"""

import logging
import os
from typing import Any, Dict, List, Optional

import httpx

logger = logging.getLogger(__name__)

MCP_SERVER_URL = os.getenv("MCP_SERVER_URL", "http://localhost:8000/mcp")

# LLM Tool Permission Tiers (mirrored from settings for agent-side use)
LLM_TOOL_TIERS: Dict[str, List[str]] = {
    "read_only": [
        "get_stream_status", "get_device_info", "get_signal_quality",
        "query_recordings", "get_recording_metadata", "get_system_health",
        "compute_statistics", "compute_fft", "query_knowledge",
    ],
    "requires_confirmation": [
        "start_recording", "stop_recording", "configure_bias",
        "set_clocks", "set_gain_mode", "configure_tia",
        "configure_pixels", "filter_signal", "reduce_noise", "export_data",
    ],
    "blocked": [
        "set_stimulation", "trigger_stimulation", "upload_waveform",
        "flash_firmware", "delete_recording", "manage_users",
    ],
}


def get_tool_tier(tool_name: str) -> str:
    """Return the permission tier for a tool.

    Returns one of ``"read_only"``, ``"requires_confirmation"``, ``"blocked"``,
    or ``"unknown"``.
    """
    # Strip agent prefix if present (e.g. "hardware.get_device_info" -> "get_device_info")
    short_name = tool_name.split(".")[-1] if "." in tool_name else tool_name
    for tier, tools in LLM_TOOL_TIERS.items():
        if short_name in tools:
            return tier
    return "unknown"


class MCPToolBridge:
    """Bridge LangGraph tool invocations to the MCP server / A2A agents."""

    def __init__(self, mcp_server_url: str | None = None):
        self.mcp_server_url = (mcp_server_url or MCP_SERVER_URL).rstrip("/")

    # ------------------------------------------------------------------
    # Tool discovery
    # ------------------------------------------------------------------

    async def list_available_tools(self) -> List[Dict[str, Any]]:
        """Fetch the list of registered tools from the MCP server.

        Returns
        -------
        list[dict]
            Each dict has ``name``, ``description``, ``input_schema``, and ``tier``.
        """
        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(10.0)) as client:
                resp = await client.get(f"{self.mcp_server_url}/tools")
                resp.raise_for_status()
                tools = resp.json()
                # Annotate each tool with its tier
                for tool in tools:
                    tool["tier"] = get_tool_tier(tool.get("name", ""))
                return tools
        except httpx.ConnectError:
            logger.warning("Cannot connect to MCP server at %s", self.mcp_server_url)
            return []
        except Exception as exc:
            logger.error("Error listing tools: %s", exc)
            return []

    # ------------------------------------------------------------------
    # Tool execution
    # ------------------------------------------------------------------

    async def call_tool(
        self, tool_name: str, arguments: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Execute a tool via the MCP server.

        Parameters
        ----------
        tool_name:
            Fully qualified tool name (e.g. ``"hardware.get_device_info"``).
        arguments:
            Tool arguments as a dict.

        Returns
        -------
        dict
            Tool execution result with ``status``, ``result``, and ``tool_name``.
        """
        tier = get_tool_tier(tool_name)

        if tier == "blocked":
            logger.warning("Attempted to call blocked tool: %s", tool_name)
            return {
                "status": "error",
                "tool_name": tool_name,
                "error": (
                    f"Tool '{tool_name}' is blocked for LLM use. "
                    "This action requires direct human control."
                ),
            }

        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(30.0)) as client:
                resp = await client.post(
                    f"{self.mcp_server_url}/tools/call",
                    json={
                        "name": tool_name,
                        "arguments": arguments,
                    },
                )
                resp.raise_for_status()
                result = resp.json()
                return {
                    "status": "success",
                    "tool_name": tool_name,
                    "tier": tier,
                    "result": result,
                }
        except httpx.ConnectError:
            logger.error("Cannot connect to MCP server for tool call: %s", tool_name)
            return {
                "status": "error",
                "tool_name": tool_name,
                "error": "MCP server is unavailable.",
            }
        except httpx.HTTPStatusError as exc:
            logger.error("Tool call HTTP error: %s", exc)
            return {
                "status": "error",
                "tool_name": tool_name,
                "error": f"Tool call failed with status {exc.response.status_code}.",
            }
        except Exception as exc:
            logger.error("Unexpected error calling tool %s: %s", tool_name, exc)
            return {
                "status": "error",
                "tool_name": tool_name,
                "error": str(exc),
            }

    # ------------------------------------------------------------------
    # LangChain-compatible tool wrappers
    # ------------------------------------------------------------------

    def get_langchain_tools(self) -> List[Dict[str, Any]]:
        """Return tools formatted for LangChain / LangGraph tool binding.

        Each tool is a dict with ``name``, ``description``, ``parameters``,
        and ``tier``, suitable for inclusion in an LLM's tool-use prompt.
        """
        all_tools: List[Dict[str, Any]] = []

        for tier_name, tool_names in LLM_TOOL_TIERS.items():
            if tier_name == "blocked":
                continue  # Do not expose blocked tools to the LLM
            for tool_name in tool_names:
                all_tools.append({
                    "name": tool_name,
                    "description": f"[{tier_name}] MCP tool: {tool_name}",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "arguments": {
                                "type": "object",
                                "description": "Tool-specific arguments",
                            },
                        },
                    },
                    "tier": tier_name,
                })
        return all_tools
