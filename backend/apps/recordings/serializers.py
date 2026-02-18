from rest_framework import serializers

from .models import Recording


class RecordingSerializer(serializers.ModelSerializer):
    """Serializer for Recording model."""

    class Meta:
        model = Recording
        fields = [
            "id",
            "experiment",
            "start_time",
            "end_time",
            "duration_seconds",
            "sample_rate",
            "channel_count",
            "file_path",
            "file_size_bytes",
            "total_samples",
            "total_spikes",
            "packet_loss_count",
            "status",
            "metadata",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]
