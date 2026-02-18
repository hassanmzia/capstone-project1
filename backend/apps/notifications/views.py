from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated

from .models import AlertRule
from .serializers import AlertRuleSerializer


class AlertRuleViewSet(viewsets.ModelViewSet):
    """CRUD ViewSet for alert rules."""

    queryset = AlertRule.objects.all()
    serializer_class = AlertRuleSerializer
    permission_classes = [IsAuthenticated]
