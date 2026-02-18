from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import AgentRegistryViewSet

router = DefaultRouter()
router.register(r"agents", AgentRegistryViewSet, basename="agent-registry")

urlpatterns = [
    path("", include(router.urls)),
]
