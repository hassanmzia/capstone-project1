from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated

from .models import Recording
from .serializers import RecordingSerializer


class RecordingViewSet(viewsets.ModelViewSet):
    """Full CRUD ViewSet for recordings."""

    queryset = Recording.objects.all()
    serializer_class = RecordingSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ["status", "experiment"]
