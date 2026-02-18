from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response


class AnalysisViewSet(viewsets.ViewSet):
    """Placeholder ViewSet for analysis endpoints."""

    permission_classes = [IsAuthenticated]

    @action(detail=False, methods=["get"])
    def statistics(self, request):
        """Return analysis statistics (placeholder)."""
        return Response(
            {"detail": "Statistics endpoint — not yet implemented."},
            status=status.HTTP_200_OK,
        )

    @action(detail=False, methods=["post"])
    def compare(self, request):
        """Compare experiments or recordings (placeholder)."""
        return Response(
            {"detail": "Compare endpoint — not yet implemented."},
            status=status.HTTP_200_OK,
        )

    @action(detail=False, methods=["get"])
    def report(self, request):
        """Generate an analysis report (placeholder)."""
        return Response(
            {"detail": "Report endpoint — not yet implemented."},
            status=status.HTTP_200_OK,
        )
