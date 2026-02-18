from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import AgentRegistry
from .serializers import AgentRegistrySerializer


class AgentRegistryViewSet(viewsets.ModelViewSet):
    """ViewSet for managing agent registrations."""

    queryset = AgentRegistry.objects.all()
    serializer_class = AgentRegistrySerializer
    permission_classes = [IsAuthenticated]
    http_method_names = ["get", "post", "put", "patch", "delete", "head", "options"]

    @action(detail=False, methods=["post"])
    def register(self, request):
        """Register a new agent or update an existing one."""
        agent_name = request.data.get("agent_name")
        if not agent_name:
            return Response(
                {"detail": "agent_name is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        agent, created = AgentRegistry.objects.update_or_create(
            agent_name=agent_name,
            defaults={
                "agent_url": request.data.get("agent_url", ""),
                "agent_type": request.data.get("agent_type", ""),
                "port": request.data.get("port"),
                "status": request.data.get("status", "online"),
                "capabilities": request.data.get("capabilities", []),
                "mcp_tools": request.data.get("mcp_tools", []),
                "last_heartbeat": timezone.now(),
            },
        )
        serializer = self.get_serializer(agent)
        resp_status = status.HTTP_201_CREATED if created else status.HTTP_200_OK
        return Response(serializer.data, status=resp_status)

    @action(detail=True, methods=["get"])
    def health(self, request, pk=None):
        """Check the health / last heartbeat of a specific agent."""
        agent = self.get_object()
        return Response(
            {
                "agent_name": agent.agent_name,
                "status": agent.status,
                "last_heartbeat": agent.last_heartbeat,
            }
        )
