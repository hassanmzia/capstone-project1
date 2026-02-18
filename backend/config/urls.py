"""
URL configuration for the NeuroLab backend.

Routes API v1 endpoints, admin, JWT auth, health check, and MCP.
"""

from django.contrib import admin
from django.http import JsonResponse
from django.urls import include, path
from rest_framework_simplejwt.views import (
    TokenObtainPairView,
    TokenRefreshView,
)


def health_check(request):
    """Minimal health-check endpoint."""
    return JsonResponse({"status": "ok"})


# ── API v1 routes ────────────────────────────────────────────────────────────
api_v1_patterns = [
    path("users/", include("apps.users.urls")),
    path("experiments/", include("apps.experiments.urls")),
    path("recordings/", include("apps.recordings.urls")),
    path("hardware/", include("apps.hardware.urls")),
    path("presets/", include("apps.presets.urls")),
    path("analysis/", include("apps.analysis.urls")),
    path("agents/", include("apps.agents_app.urls")),
    path("notifications/", include("apps.notifications.urls")),
    # JWT authentication
    path("auth/token/", TokenObtainPairView.as_view(), name="token_obtain_pair"),
    path("auth/token/refresh/", TokenRefreshView.as_view(), name="token_refresh"),
]

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/v1/", include((api_v1_patterns, "api-v1"))),
    path("health/", health_check, name="health_check"),
    path("mcp/", include("mcp.urls")),
]
