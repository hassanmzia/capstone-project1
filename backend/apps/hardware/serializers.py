from rest_framework import serializers

from .models import HardwareConfig
from .validators import HardwareSafetyValidator


class HardwareConfigSerializer(serializers.ModelSerializer):
    """Serializer for HardwareConfig model with safety validation."""

    class Meta:
        model = HardwareConfig
        fields = [
            "id",
            "recording",
            "experiment",
            "name",
            "bias_params",
            "clock_config",
            "gain_mode",
            "pixel_config",
            "tia_config",
            "stim_config",
            "waveform_config",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def validate_bias_params(self, value):
        validator = HardwareSafetyValidator()
        validator.validate_bias_params(value)
        return value

    def validate_clock_config(self, value):
        validator = HardwareSafetyValidator()
        validator.validate_clock_config(value)
        return value

    def validate_stim_config(self, value):
        validator = HardwareSafetyValidator()
        validator.validate_stim_config(value)
        return value
