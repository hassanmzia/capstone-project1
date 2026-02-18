from django.conf import settings
from django.db import models


class Experiment(models.Model):
    """Model representing a neural recording experiment."""

    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        CONFIGURED = "configured", "Configured"
        RUNNING = "running", "Running"
        COMPLETED = "completed", "Completed"
        FAILED = "failed", "Failed"
        ARCHIVED = "archived", "Archived"

    name = models.CharField(max_length=255)
    description = models.TextField(blank=True, default="")
    device_name = models.CharField(max_length=255, blank=True, default="")
    experiment_mode = models.CharField(max_length=100, blank=True, default="")
    protocol_type = models.CharField(max_length=100, blank=True, default="")
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.DRAFT,
    )
    tags = models.JSONField(default=list, blank=True)
    metadata = models.JSONField(default=dict, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="experiments",
    )
    started_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "experiments"
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.name} ({self.status})"
