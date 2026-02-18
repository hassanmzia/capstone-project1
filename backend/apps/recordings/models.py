from django.db import models


class Recording(models.Model):
    """Model representing a data recording session within an experiment."""

    class Status(models.TextChoices):
        RECORDING = "recording", "Recording"
        COMPLETED = "completed", "Completed"
        FAILED = "failed", "Failed"
        PROCESSING = "processing", "Processing"
        ARCHIVED = "archived", "Archived"

    experiment = models.ForeignKey(
        "experiments.Experiment",
        on_delete=models.CASCADE,
        related_name="recordings",
    )
    start_time = models.DateTimeField(null=True, blank=True)
    end_time = models.DateTimeField(null=True, blank=True)
    duration_seconds = models.FloatField(null=True, blank=True)
    sample_rate = models.IntegerField(null=True, blank=True)
    channel_count = models.IntegerField(null=True, blank=True)
    file_path = models.CharField(max_length=1024, blank=True, default="")
    file_size_bytes = models.BigIntegerField(null=True, blank=True)
    total_samples = models.BigIntegerField(null=True, blank=True)
    total_spikes = models.BigIntegerField(null=True, blank=True)
    packet_loss_count = models.IntegerField(default=0)
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.RECORDING,
    )
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "recordings"
        ordering = ["-created_at"]

    def __str__(self):
        return f"Recording {self.id} - {self.experiment.name} ({self.status})"
