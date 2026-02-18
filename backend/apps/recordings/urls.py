from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import RecordingViewSet

router = DefaultRouter()
router.register(r"recordings", RecordingViewSet, basename="recording")

urlpatterns = [
    path("", include(router.urls)),
]
