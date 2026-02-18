"""
MCP Resource definitions.

Resources represent static or dynamic data sources that agents or tools
can expose (e.g. database tables, file URIs, live data streams).
"""

import logging
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)


class MCPResource:
    """A single MCP resource descriptor."""

    def __init__(
        self,
        name: str,
        uri: str,
        description: str = "",
        mime_type: str = "application/json",
    ):
        self.name = name
        self.uri = uri
        self.description = description
        self.mime_type = mime_type

    def to_dict(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "uri": self.uri,
            "description": self.description,
            "mimeType": self.mime_type,
        }


class ResourceRegistry:
    """Global registry of MCP resources (singleton)."""

    _instance: Optional["ResourceRegistry"] = None

    def __init__(self):
        self._resources: Dict[str, MCPResource] = {}

    @classmethod
    def get_instance(cls) -> "ResourceRegistry":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def register(self, resource: MCPResource) -> None:
        """Add or overwrite a resource in the registry."""
        self._resources[resource.name] = resource
        logger.info("Registered MCP resource: %s (%s)", resource.name, resource.uri)

    def unregister(self, name: str) -> None:
        self._resources.pop(name, None)

    def list_resources(self) -> List[Dict[str, Any]]:
        return [r.to_dict() for r in self._resources.values()]

    def get(self, name: str) -> Optional[MCPResource]:
        return self._resources.get(name)

    def clear(self) -> None:
        self._resources.clear()
