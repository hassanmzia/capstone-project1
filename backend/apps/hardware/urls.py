from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import HardwareConfigViewSet

router = DefaultRouter()
router.register(r"hardware", HardwareConfigViewSet, basename="hardware-config")

urlpatterns = [
    path("", include(router.urls)),
]
