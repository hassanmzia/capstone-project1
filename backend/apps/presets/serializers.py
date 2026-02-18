from rest_framework import serializers

from .models import ConfigPreset


class ConfigPresetSerializer(serializers.ModelSerializer):
    """Serializer for ConfigPreset model."""

    created_by = serializers.PrimaryKeyRelatedField(read_only=True)

    class Meta:
        model = ConfigPreset
        fields = [
            "id",
            "name",
            "description",
            "category",
            "config_data",
            "is_default",
            "created_by",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_by", "created_at", "updated_at"]

    def create(self, validated_data):
        validated_data["created_by"] = self.context["request"].user
        return super().create(validated_data)
