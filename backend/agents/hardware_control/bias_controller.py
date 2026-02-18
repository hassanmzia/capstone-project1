"""
Bias parameter management for the CNEAv5 ASIC.

Manages all 20 bias voltage parameters, converts between real-world
voltages and DAC codes, and applies safety validation before writing.
"""

import logging
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple

from agents.hardware_control.safety import HardwareSafetyGuard, SafetyViolation

logger = logging.getLogger(__name__)

# DAC reference: full-scale = 2.518 V x 2 = 5.036 V, 16-bit
DAC_VREF = 2.518 * 2  # 5.036 V
DAC_RESOLUTION = 65535  # 16-bit


@dataclass
class BiasParam:
    """Definition of a single bias parameter."""
    name: str
    dac_select: int      # DAC chip select code (0x01, 0x02, 0x04, 0x08, 0x10)
    dac_address: int     # Register address within the DAC
    default_v: float     # Default voltage
    description: str = ""


# -----------------------------------------------------------------------
# All 20 bias parameters from the legacy GUI (createBiasConfigTable)
# -----------------------------------------------------------------------
# Order matches GUI.py:
#   VS1-VS4     -> dac_sel=0x01, addresses 0x08-0x0B
#   V_CI1-V_CI4 -> dac_sel=0x02, addresses 0x08-0x0B
#   VREFL, VREFLH, VREFMH, VCM -> dac_sel=0x04, addresses 0x08-0x0B
#   BP_CI, BP_OTA, VR, NMIR    -> dac_sel=0x08, addresses 0x08-0x0B
#   REF_DC, TEMP_SET, TEMP_OS, TEST_IN -> dac_sel=0x10, addresses 0x08-0x0B

BIAS_PARAMETERS: List[BiasParam] = [
    BiasParam("VS1",      0x01, 0x08, 1.65,  "Voltage source 1"),
    BiasParam("VS2",      0x01, 0x09, 1.50,  "Voltage source 2"),
    BiasParam("VS3",      0x01, 0x0A, 0.00,  "Voltage source 3"),
    BiasParam("VS4",      0x01, 0x0B, 1.20,  "Voltage source 4"),
    BiasParam("V_CI1",    0x02, 0x08, 0.00,  "Current injection 1"),
    BiasParam("V_CI2",    0x02, 0x09, 0.00,  "Current injection 2"),
    BiasParam("V_CI3",    0x02, 0x0A, 0.00,  "Current injection 3"),
    BiasParam("V_CI4",    0x02, 0x0B, 0.00,  "Current injection 4"),
    BiasParam("VREFL",    0x04, 0x08, 1.15,  "Reference voltage low"),
    BiasParam("VREFLH",   0x04, 0x09, 2.15,  "Reference voltage low-high"),
    BiasParam("VREFMH",   0x04, 0x0A, 2.15,  "Reference voltage mid-high"),
    BiasParam("VCM",      0x04, 0x0B, 1.65,  "Common-mode voltage"),
    BiasParam("BP_CI",    0x08, 0x08, 2.85,  "CI bias point"),
    BiasParam("BP_OTA",   0x08, 0x09, 2.85,  "OTA bias point"),
    BiasParam("VR",       0x08, 0x0A, 3.30,  "Reference voltage"),
    BiasParam("NMIR",     0x08, 0x0B, 0.65,  "N-mirror bias"),
    BiasParam("REF_DC",   0x10, 0x08, 1.65,  "DC reference for TIA"),
    BiasParam("TEMP_SET", 0x10, 0x09, 0.00,  "Temperature set-point"),
    BiasParam("TEMP_OS",  0x10, 0x0A, 0.50,  "Temperature offset"),
    BiasParam("TEST_IN",  0x10, 0x0B, 2.00,  "Test input voltage"),
]

BIAS_PARAM_MAP: Dict[str, BiasParam] = {p.name: p for p in BIAS_PARAMETERS}


class BiasController:
    """Manages bias parameters for the CNEAv5 ASIC.

    Parameters
    ----------
    fpga
        An FPGA backend instance (real or simulated).
    safety
        A ``HardwareSafetyGuard`` for validation.
    """

    def __init__(self, fpga, safety: HardwareSafetyGuard) -> None:
        self._fpga = fpga
        self._safety = safety
        # Track current voltages
        self._current: Dict[str, float] = {p.name: p.default_v for p in BIAS_PARAMETERS}

    # ------------------------------------------------------------------
    # Conversions
    # ------------------------------------------------------------------

    @staticmethod
    def voltage_to_dac_code(voltage: float) -> int:
        """Convert a voltage to a 16-bit DAC code."""
        code = round(voltage / DAC_VREF * DAC_RESOLUTION)
        return max(0, min(code, DAC_RESOLUTION))

    @staticmethod
    def dac_code_to_voltage(code: int) -> float:
        """Convert a DAC code back to a voltage."""
        return code / DAC_RESOLUTION * DAC_VREF

    # ------------------------------------------------------------------
    # Get / Set
    # ------------------------------------------------------------------

    def get_all(self) -> Dict[str, float]:
        """Return a snapshot of all current bias values."""
        return dict(self._current)

    def get(self, name: str) -> float:
        """Return the current value of a single bias parameter."""
        if name not in BIAS_PARAM_MAP:
            raise ValueError(f"Unknown bias parameter: {name}")
        return self._current[name]

    def set_single(self, name: str, voltage: float) -> Dict[str, Any]:
        """Set a single bias parameter.

        Returns a dict describing the change.
        """
        return self.set_multiple({name: voltage})

    def set_multiple(self, params: Dict[str, float]) -> Dict[str, Any]:
        """Set one or more bias parameters atomically.

        Safety validation is performed *before* any writes.
        Returns a summary of the changes made.
        """
        # Validate names
        for name in params:
            if name not in BIAS_PARAM_MAP:
                raise ValueError(f"Unknown bias parameter: {name}")

        # Safety validation (may raise SafetyViolation)
        self._safety.validate_bias_params(params)

        changes: List[Dict[str, Any]] = []
        for name, voltage in params.items():
            bp = BIAS_PARAM_MAP[name]
            old_v = self._current[name]
            dac_code = self.voltage_to_dac_code(voltage)

            # Write to DAC (write twice for stability, matching legacy)
            self._fpga.dac_write(bp.dac_select, bp.dac_address, dac_code)
            self._fpga.dac_write(bp.dac_select, bp.dac_address, dac_code)

            self._current[name] = voltage

            changes.append({
                "name": name,
                "old_v": round(old_v, 4),
                "new_v": round(voltage, 4),
                "dac_code": dac_code,
            })

            logger.info(
                "Bias %s: %.4f V -> %.4f V (code %d)",
                name, old_v, voltage, dac_code,
            )

        # Commit to safety guard for future rate-of-change tracking
        self._safety.commit_bias(params)

        return {
            "status": "applied",
            "changes": changes,
        }

    def apply_defaults(self) -> Dict[str, Any]:
        """Apply all default bias values."""
        defaults = {p.name: p.default_v for p in BIAS_PARAMETERS}
        return self.set_multiple(defaults)

    def get_param_definitions(self) -> List[Dict[str, Any]]:
        """Return metadata about all bias parameters."""
        return [
            {
                "name": p.name,
                "dac_select": hex(p.dac_select),
                "dac_address": hex(p.dac_address),
                "default_v": p.default_v,
                "current_v": self._current[p.name],
                "description": p.description,
            }
            for p in BIAS_PARAMETERS
        ]
