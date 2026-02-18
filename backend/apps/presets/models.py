from django.conf import settings
from django.db import models


class ConfigPreset(models.Model):
    """Model for reusable hardware configuration presets."""

    class Category(models.TextChoices):
        BIAS = "bias", "Bias"
        CLOCK = "clock", "Clock"
        PIXEL = "pixel", "Pixel"
        STIMULATION = "stimulation", "Stimulation"
        TIA = "tia", "TIA"
        GAIN = "gain", "Gain"
        FULL = "full", "Full"

    name = models.CharField(max_length=255)
    description = models.TextField(blank=True, default="")
    category = models.CharField(
        max_length=20,
        choices=Category.choices,
    )
    config_data = models.JSONField(default=dict, blank=True)
    is_default = models.BooleanField(default=False)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="presets",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "config_presets"
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.name} ({self.category})"
