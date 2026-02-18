from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated

from .models import Experiment
from .serializers import ExperimentSerializer


class ExperimentViewSet(viewsets.ModelViewSet):
    """Full CRUD ViewSet for experiments."""

    queryset = Experiment.objects.all()
    serializer_class = ExperimentSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ["status", "device_name"]
