from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import ConfigPresetViewSet

router = DefaultRouter()
router.register(r"presets", ConfigPresetViewSet, basename="config-preset")

urlpatterns = [
    path("", include(router.urls)),
]
