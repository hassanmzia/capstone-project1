from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import AlertRuleViewSet

router = DefaultRouter()
router.register(r"alerts", AlertRuleViewSet, basename="alert-rule")

urlpatterns = [
    path("", include(router.urls)),
]
