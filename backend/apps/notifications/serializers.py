from rest_framework import serializers

from .models import AlertRule


class AlertRuleSerializer(serializers.ModelSerializer):
    """Serializer for AlertRule model."""

    class Meta:
        model = AlertRule
        fields = [
            "id",
            "name",
            "metric",
            "threshold",
            "enabled",
            "channels",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]
