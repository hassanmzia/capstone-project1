from django.db import models


class AgentRegistry(models.Model):
    """Model for registering and tracking AI/MCP agents."""

    agent_name = models.CharField(max_length=255, unique=True)
    agent_url = models.URLField(max_length=500)
    agent_type = models.CharField(max_length=100, blank=True, default="")
    port = models.IntegerField(null=True, blank=True)
    status = models.CharField(max_length=50, default="unknown")
    capabilities = models.JSONField(default=list, blank=True)
    mcp_tools = models.JSONField(default=list, blank=True)
    last_heartbeat = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "agent_registry"
        ordering = ["-created_at"]
        verbose_name_plural = "agent registries"

    def __str__(self):
        return f"{self.agent_name} ({self.status})"
