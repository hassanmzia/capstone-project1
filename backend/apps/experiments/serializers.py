from rest_framework import serializers

from .models import Experiment


class ExperimentSerializer(serializers.ModelSerializer):
    """Serializer for Experiment model."""

    created_by = serializers.PrimaryKeyRelatedField(read_only=True)

    class Meta:
        model = Experiment
        fields = [
            "id",
            "name",
            "description",
            "device_name",
            "experiment_mode",
            "protocol_type",
            "status",
            "tags",
            "metadata",
            "created_by",
            "started_at",
            "completed_at",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_by", "created_at", "updated_at"]

    def create(self, validated_data):
        validated_data["created_by"] = self.context["request"].user
        return super().create(validated_data)
