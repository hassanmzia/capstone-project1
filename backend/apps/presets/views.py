from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated

from .models import ConfigPreset
from .serializers import ConfigPresetSerializer


class ConfigPresetViewSet(viewsets.ModelViewSet):
    """CRUD ViewSet for configuration presets."""

    queryset = ConfigPreset.objects.all()
    serializer_class = ConfigPresetSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ["category"]
