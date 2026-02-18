from django.db import models


class AlertRule(models.Model):
    """Model for configurable alert rules on metrics."""

    name = models.CharField(max_length=255)
    metric = models.CharField(max_length=255)
    threshold = models.FloatField()
    enabled = models.BooleanField(default=True)
    channels = models.JSONField(default=list, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "alert_rules"
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.name} ({self.metric} > {self.threshold})"
