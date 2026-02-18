from django.conf import settings
from rest_framework.exceptions import ValidationError


class HardwareSafetyValidator:
    """
    Validates hardware configuration parameters against safety limits
    defined in settings.HARDWARE_SAFETY_LIMITS.
    """

    def __init__(self):
        self.limits = getattr(settings, "HARDWARE_SAFETY_LIMITS", {})

    def validate(self, config_data):
        """
        Validate a configuration dictionary against HARDWARE_SAFETY_LIMITS.

        Each key in HARDWARE_SAFETY_LIMITS is expected to map to a dict with
        optional 'min' and 'max' keys. For example:
            HARDWARE_SAFETY_LIMITS = {
                "bias_voltage": {"min": -1.8, "max": 1.8},
                "clock_frequency": {"min": 1000, "max": 50000000},
            }
        """
        errors = {}
        for param_name, limit in self.limits.items():
            if param_name not in config_data:
                continue

            value = config_data[param_name]
            if not isinstance(value, (int, float)):
                continue

            min_val = limit.get("min")
            max_val = limit.get("max")

            if min_val is not None and value < min_val:
                errors[param_name] = (
                    f"Value {value} is below minimum safe limit {min_val}."
                )
            if max_val is not None and value > max_val:
                errors[param_name] = (
                    f"Value {value} exceeds maximum safe limit {max_val}."
                )

        if errors:
            raise ValidationError({"safety_violations": errors})

        return config_data

    def validate_bias_params(self, bias_params):
        """Validate bias parameters specifically."""
        return self.validate(bias_params)

    def validate_clock_config(self, clock_config):
        """Validate clock configuration specifically."""
        return self.validate(clock_config)

    def validate_stim_config(self, stim_config):
        """Validate stimulation configuration specifically."""
        return self.validate(stim_config)
