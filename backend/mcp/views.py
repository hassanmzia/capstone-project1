"""
DRF views for the MCP endpoints.

Exposes tool invocation, listing, resource listing, and agent
registration over HTTP.
"""

import logging

from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response

from .resources import ResourceRegistry
from .server import MCPServer
from .tools import register_agent_tools

logger = logging.getLogger(__name__)


# ------------------------------------------------------------------
# Tool endpoints
# ------------------------------------------------------------------

@api_view(["POST"])
@permission_classes([AllowAny])
def call_tool(request: Request) -> Response:
    """Invoke a registered MCP tool by name.

    Expected JSON body::

        {
            "name": "agent.tool_name",
            "arguments": { ... }
        }
    """
    name = request.data.get("name")
    arguments = request.data.get("arguments", {})

    if not name:
        return Response(
            {"error": "Missing required field 'name'."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    server = MCPServer.get_instance()

    try:
        result = server.call_tool(name, arguments)
    except KeyError as exc:
        return Response(
            {"error": str(exc)},
            status=status.HTTP_404_NOT_FOUND,
        )
    except Exception as exc:
        logger.exception("Error calling tool %s", name)
        return Response(
            {"error": f"Tool execution failed: {exc}"},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    return Response({"result": result}, status=status.HTTP_200_OK)


@api_view(["GET"])
@permission_classes([AllowAny])
def list_tools(request: Request) -> Response:
    """Return all registered MCP tools."""
    server = MCPServer.get_instance()
    tools = server.list_tools()
    return Response({"tools": tools}, status=status.HTTP_200_OK)


# ------------------------------------------------------------------
# Resource endpoints
# ------------------------------------------------------------------

@api_view(["GET"])
@permission_classes([AllowAny])
def list_resources(request: Request) -> Response:
    """Return all registered MCP resources."""
    registry = ResourceRegistry.get_instance()
    resources = registry.list_resources()
    return Response({"resources": resources}, status=status.HTTP_200_OK)


# ------------------------------------------------------------------
# Agent registration
# ------------------------------------------------------------------

@api_view(["POST"])
@permission_classes([AllowAny])
def register_agent(request: Request) -> Response:
    """Register an agent's tools with the MCP server.

    Expected JSON body::

        {
            "agent_name": "data_acquisition",
            "tools": [
                {
                    "name": "data_acquisition.fetch_sensor",
                    "description": "Fetch sensor reading",
                    "input_schema": { ... }
                }
            ]
        }
    """
    agent_name = request.data.get("agent_name")
    tools_payload = request.data.get("tools", [])

    if not agent_name:
        return Response(
            {"error": "Missing required field 'agent_name'."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    server = MCPServer.get_instance()

    registered = []
    for tool_def in tools_payload:
        tool_name = tool_def.get("name", "")
        description = tool_def.get("description", "")
        input_schema = tool_def.get("input_schema", {"type": "object", "properties": {}})

        # Create a placeholder handler that returns a not-implemented message.
        # The real invocation is forwarded to the agent's own HTTP endpoint.
        def _make_proxy(tn: str):
            def _proxy(**kwargs):
                return {
                    "status": "proxy",
                    "tool": tn,
                    "message": "Forwarding to agent not yet implemented.",
                    "arguments": kwargs,
                }
            return _proxy

        server.register_tool(
            name=tool_name,
            handler=_make_proxy(tool_name),
            schema=input_schema,
            description=description,
        )
        registered.append(tool_name)

    logger.info(
        "Agent '%s' registered %d tool(s): %s",
        agent_name,
        len(registered),
        registered,
    )

    return Response(
        {
            "agent_name": agent_name,
            "registered_tools": registered,
        },
        status=status.HTTP_201_CREATED,
    )
