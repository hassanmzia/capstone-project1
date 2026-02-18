"""
MCP tool registration utilities.

Provides a decorator for marking functions as MCP tools and a helper
for bulk-registering tools that belong to a particular agent.
"""

import functools
import logging
from typing import Any, Callable, Dict, List, Optional

from .server import MCPServer

logger = logging.getLogger(__name__)


# ----------------------------------------------------------------------
# Decorator
# ----------------------------------------------------------------------

def mcp_tool(
    name: str,
    description: str = "",
    schema: Optional[Dict[str, Any]] = None,
) -> Callable:
    """Decorator that marks a function as an MCP tool.

    Usage::

        @mcp_tool(
            name="data_acquisition.fetch_sensor",
            description="Fetch the latest reading from a sensor.",
            schema={
                "type": "object",
                "properties": {
                    "sensor_id": {"type": "string"},
                },
                "required": ["sensor_id"],
            },
        )
        def fetch_sensor(sensor_id: str) -> dict:
            ...

    The decorated function gains an ``_mcp_meta`` attribute that stores
    the registration metadata so that ``register_agent_tools`` can pick
    it up automatically.
    """
    if schema is None:
        schema = {"type": "object", "properties": {}}

    def decorator(func: Callable) -> Callable:
        func._mcp_meta = {
            "name": name,
            "description": description,
            "schema": schema,
        }

        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            return func(*args, **kwargs)

        wrapper._mcp_meta = func._mcp_meta
        return wrapper

    return decorator


# ----------------------------------------------------------------------
# Bulk registration helper
# ----------------------------------------------------------------------

def register_agent_tools(
    agent_name: str,
    tools_list: List[Callable],
) -> None:
    """Register a list of tool callables from a given agent.

    Each callable in *tools_list* must have been decorated with
    ``@mcp_tool`` so that it carries the ``_mcp_meta`` attribute.

    Parameters
    ----------
    agent_name:
        Human-readable agent identifier (used for logging / namespacing).
    tools_list:
        Iterable of decorated callables to register.
    """
    server = MCPServer.get_instance()

    for tool_func in tools_list:
        meta = getattr(tool_func, "_mcp_meta", None)
        if meta is None:
            logger.warning(
                "Skipping tool %r from agent %s – missing @mcp_tool decorator",
                tool_func,
                agent_name,
            )
            continue

        full_name = meta["name"]
        server.register_tool(
            name=full_name,
            handler=tool_func,
            schema=meta["schema"],
            description=meta["description"],
        )
        logger.info(
            "Agent '%s' registered tool '%s'",
            agent_name,
            full_name,
        )
