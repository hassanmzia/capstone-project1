from django.db import models


class HardwareConfig(models.Model):
    """Model representing hardware configuration parameters."""

    recording = models.ForeignKey(
        "recordings.Recording",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="hardware_configs",
    )
    experiment = models.ForeignKey(
        "experiments.Experiment",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="hardware_configs",
    )
    name = models.CharField(max_length=255, blank=True, default="")
    bias_params = models.JSONField(default=dict, blank=True)
    clock_config = models.JSONField(default=dict, blank=True)
    gain_mode = models.CharField(max_length=100, blank=True, default="")
    pixel_config = models.JSONField(default=dict, blank=True)
    tia_config = models.JSONField(default=dict, blank=True)
    stim_config = models.JSONField(default=dict, blank=True)
    waveform_config = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "hardware_configs"
        ordering = ["-created_at"]

    def __str__(self):
        return f"HardwareConfig {self.id} - {self.name}"
