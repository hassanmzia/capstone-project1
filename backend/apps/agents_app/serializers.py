from rest_framework import serializers

from .models import AgentRegistry


class AgentRegistrySerializer(serializers.ModelSerializer):
    """Serializer for AgentRegistry model."""

    class Meta:
        model = AgentRegistry
        fields = [
            "id",
            "agent_name",
            "agent_url",
            "agent_type",
            "port",
            "status",
            "capabilities",
            "mcp_tools",
            "last_heartbeat",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]
