"""
MCP Server implementation.

Manages tool registration, routing, and invocation following
the Model Context Protocol pattern.
"""

import logging
from typing import Any, Callable, Dict, List, Optional

logger = logging.getLogger(__name__)


class MCPTool:
    """Represents a single registered MCP tool."""

    def __init__(
        self,
        name: str,
        description: str,
        input_schema: Dict[str, Any],
        handler: Callable,
    ):
        self.name = name
        self.description = description
        self.input_schema = input_schema
        self.handler = handler

    def to_dict(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "description": self.description,
            "inputSchema": self.input_schema,
        }


class MCPServer:
    """
    Central MCP Server that manages tool registration and routing.

    Tools are stored in an internal registry keyed by tool name.
    Agents register their tools at startup; callers invoke tools
    through `call_tool`.
    """

    _instance: Optional["MCPServer"] = None

    def __init__(self):
        self._tools: Dict[str, MCPTool] = {}

    # ------------------------------------------------------------------
    # Singleton access (useful within Django process)
    # ------------------------------------------------------------------
    @classmethod
    def get_instance(cls) -> "MCPServer":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    # ------------------------------------------------------------------
    # Tool management
    # ------------------------------------------------------------------
    def register_tool(
        self,
        name: str,
        handler: Callable,
        schema: Dict[str, Any],
        description: str = "",
    ) -> None:
        """Register a tool with the server.

        Parameters
        ----------
        name:
            Unique tool name (e.g. ``"data_acquisition.fetch_sensor"``).
        handler:
            Callable that executes the tool logic.  May be sync or async.
        schema:
            JSON Schema describing the tool's expected input.
        description:
            Human-readable description of the tool.
        """
        if name in self._tools:
            logger.warning("Overwriting existing tool registration: %s", name)

        tool = MCPTool(
            name=name,
            description=description,
            input_schema=schema,
            handler=handler,
        )
        self._tools[name] = tool
        logger.info("Registered MCP tool: %s", name)

    def call_tool(self, name: str, arguments: Dict[str, Any] = None) -> Any:
        """Invoke a registered tool by name.

        Parameters
        ----------
        name:
            The tool name.
        arguments:
            Keyword arguments forwarded to the tool handler.

        Returns
        -------
        Any
            The return value of the tool handler.

        Raises
        ------
        KeyError
            If the tool is not found in the registry.
        """
        if name not in self._tools:
            raise KeyError(f"Tool '{name}' is not registered.")

        tool = self._tools[name]
        args = arguments or {}
        logger.info("Calling MCP tool: %s with args %s", name, args)
        return tool.handler(**args)

    def list_tools(self) -> List[Dict[str, Any]]:
        """Return a list of all registered tools as serialisable dicts."""
        return [tool.to_dict() for tool in self._tools.values()]

    def unregister_tool(self, name: str) -> None:
        """Remove a tool from the registry."""
        self._tools.pop(name, None)
        logger.info("Unregistered MCP tool: %s", name)

    def clear(self) -> None:
        """Remove **all** tools (useful in tests)."""
        self._tools.clear()
