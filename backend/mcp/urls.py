"""
Django URL patterns for MCP endpoints.
"""

from django.urls import path

from . import views

app_name = "mcp"

urlpatterns = [
    # Tool endpoints
    path("tools/call", views.call_tool, name="tool-call"),
    path("tools/list", views.list_tools, name="tool-list"),

    # Resource endpoints
    path("resources/list", views.list_resources, name="resource-list"),

    # Agent registration
    path("agents/register", views.register_agent, name="agent-register"),
]
