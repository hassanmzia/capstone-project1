from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated

from .models import HardwareConfig
from .serializers import HardwareConfigSerializer


class HardwareConfigViewSet(viewsets.ModelViewSet):
    """CRUD ViewSet for hardware configurations."""

    queryset = HardwareConfig.objects.all()
    serializer_class = HardwareConfigSerializer
    permission_classes = [IsAuthenticated]
