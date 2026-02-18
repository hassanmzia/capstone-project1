"""
Hardware Safety Guard – Layer 2 guardrails.

Validates all hardware write operations against hard-coded limits
before they reach the FPGA / DAC.  Raises ``SafetyViolation`` on any
rule violation.
"""

import logging
import time
from dataclasses import dataclass, field
from typing import Dict, List, Optional

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Hard-coded safety limits (mirrors Django HARDWARE_SAFETY_LIMITS)
# ---------------------------------------------------------------------------

HARDWARE_SAFETY_LIMITS = {
    "vs_max_voltage": 3.6,
    "vs_min_voltage": 0.0,
    "stim_max_current_ua": 500,
    "stim_max_charge_per_phase_nc": 100,
    "max_stim_frequency_hz": 200_000,
    "min_stim_frequency_hz": 0.1,
    "max_waveform_points": 2048,
    "max_waveform_amplitude_v": 3.6,
    "max_pcb_temperature_c": 45.0,
    "max_ic_temperature_c": 42.0,
    "max_voltage_step_v": 0.5,
    "bias_voltage_min": 0.0,
    "bias_voltage_max": 3.3,
}


class SafetyViolation(Exception):
    """Raised when a hardware command would exceed safety limits."""

    def __init__(self, rule: str, detail: str, value=None, limit=None):
        self.rule = rule
        self.detail = detail
        self.value = value
        self.limit = limit
        super().__init__(f"[{rule}] {detail}")


@dataclass
class AuditEntry:
    """Single audit-log record."""
    timestamp: float
    action: str
    parameter: str
    old_value: Optional[float]
    new_value: float
    allowed: bool
    reason: str = ""


class HardwareSafetyGuard:
    """Implements all Layer-2 safety guardrails for hardware writes.

    Keeps a small in-memory audit log and tracks the most recent value
    of every bias parameter to enforce rate-of-change limits.
    """

    def __init__(self, limits: Optional[Dict] = None) -> None:
        self._limits = limits or dict(HARDWARE_SAFETY_LIMITS)
        # Track last-known bias values for rate-of-change checking
        self._last_bias: Dict[str, float] = {}
        self._audit_log: List[AuditEntry] = []
        self._max_audit = 2000

    # ------------------------------------------------------------------
    # Bias validation
    # ------------------------------------------------------------------

    def validate_bias_params(
        self, params: Dict[str, float]
    ) -> None:
        """Validate a dict of ``{bias_name: voltage}`` pairs.

        Raises ``SafetyViolation`` on the first violation found.
        """
        v_min = self._limits["bias_voltage_min"]
        v_max = self._limits["bias_voltage_max"]
        max_step = self._limits["max_voltage_step_v"]

        for name, value in params.items():
            # Range check
            if value < v_min or value > v_max:
                self._audit(
                    "validate_bias", name,
                    self._last_bias.get(name), value, False,
                    f"Out of range [{v_min}, {v_max}]",
                )
                raise SafetyViolation(
                    rule="BIAS_RANGE",
                    detail=f"{name}={value:.4f} V outside [{v_min}, {v_max}] V",
                    value=value,
                    limit=v_max,
                )

            # Rate-of-change check
            self.check_rate_of_change(name, value, max_step)

            self._audit(
                "validate_bias", name,
                self._last_bias.get(name), value, True,
            )

    def check_rate_of_change(
        self, param_name: str, new_value: float, max_step: Optional[float] = None
    ) -> None:
        """Ensure the new value does not exceed the rate-of-change limit.

        If the parameter has never been set, the check passes.
        """
        max_step = max_step or self._limits["max_voltage_step_v"]
        old = self._last_bias.get(param_name)
        if old is not None:
            delta = abs(new_value - old)
            if delta > max_step:
                raise SafetyViolation(
                    rule="RATE_OF_CHANGE",
                    detail=(
                        f"{param_name}: step {delta:.4f} V exceeds "
                        f"max step {max_step} V (was {old:.4f}, requested {new_value:.4f})"
                    ),
                    value=delta,
                    limit=max_step,
                )

    def commit_bias(self, params: Dict[str, float]) -> None:
        """Record successfully-applied bias values for future delta checks."""
        self._last_bias.update(params)

    # ------------------------------------------------------------------
    # Stimulation validation
    # ------------------------------------------------------------------

    def validate_stimulation(
        self,
        amplitude_ua: float,
        pulse_width_us: float,
        frequency_hz: float,
        mode: str = "pulse",
    ) -> None:
        """Validate stimulation parameters against safety limits."""
        max_i = self._limits["stim_max_current_ua"]
        max_q = self._limits["stim_max_charge_per_phase_nc"]
        max_f = self._limits["max_stim_frequency_hz"]
        min_f = self._limits["min_stim_frequency_hz"]

        if abs(amplitude_ua) > max_i:
            raise SafetyViolation(
                rule="STIM_CURRENT",
                detail=f"Amplitude {amplitude_ua} uA exceeds limit of {max_i} uA",
                value=amplitude_ua,
                limit=max_i,
            )

        if frequency_hz < min_f or frequency_hz > max_f:
            raise SafetyViolation(
                rule="STIM_FREQUENCY",
                detail=f"Frequency {frequency_hz} Hz outside [{min_f}, {max_f}] Hz",
                value=frequency_hz,
                limit=max_f,
            )

        # Charge per phase: Q = I * t
        charge_nc = abs(amplitude_ua) * pulse_width_us / 1000.0  # uA * us / 1000 = nC
        if charge_nc > max_q:
            raise SafetyViolation(
                rule="CHARGE_PER_PHASE",
                detail=(
                    f"Charge {charge_nc:.2f} nC exceeds limit of {max_q} nC "
                    f"({amplitude_ua} uA x {pulse_width_us} us)"
                ),
                value=charge_nc,
                limit=max_q,
            )

        self._audit(
            "validate_stimulation", f"mode={mode}",
            None, amplitude_ua, True,
        )

    def check_charge_balance(
        self,
        phase1_amplitude_ua: float,
        phase1_width_us: float,
        phase2_amplitude_ua: float,
        phase2_width_us: float,
        tolerance_pct: float = 5.0,
    ) -> None:
        """Verify charge balance for biphasic stimulation.

        The net charge should be close to zero within ``tolerance_pct``.
        """
        q1 = phase1_amplitude_ua * phase1_width_us
        q2 = phase2_amplitude_ua * phase2_width_us
        total = abs(q1) + abs(q2)
        if total == 0:
            return
        net = q1 + q2
        imbalance_pct = abs(net) / total * 100.0
        if imbalance_pct > tolerance_pct:
            raise SafetyViolation(
                rule="CHARGE_BALANCE",
                detail=(
                    f"Biphasic charge imbalance {imbalance_pct:.1f}% exceeds "
                    f"tolerance {tolerance_pct}% (Q1={q1:.1f}, Q2={q2:.1f})"
                ),
                value=imbalance_pct,
                limit=tolerance_pct,
            )

    # ------------------------------------------------------------------
    # Waveform validation
    # ------------------------------------------------------------------

    def validate_waveform(
        self,
        samples: List[float],
        sample_rate_hz: float,
    ) -> None:
        """Validate arbitrary waveform parameters."""
        max_pts = self._limits["max_waveform_points"]
        max_amp = self._limits["max_waveform_amplitude_v"]

        if len(samples) > max_pts:
            raise SafetyViolation(
                rule="WAVEFORM_LENGTH",
                detail=f"Waveform has {len(samples)} points (max {max_pts})",
                value=len(samples),
                limit=max_pts,
            )

        peak = max(abs(s) for s in samples) if samples else 0
        if peak > max_amp:
            raise SafetyViolation(
                rule="WAVEFORM_AMPLITUDE",
                detail=f"Waveform peak {peak:.3f} V exceeds {max_amp} V",
                value=peak,
                limit=max_amp,
            )

        if sample_rate_hz <= 0:
            raise SafetyViolation(
                rule="WAVEFORM_RATE",
                detail=f"Sample rate must be positive (got {sample_rate_hz})",
                value=sample_rate_hz,
                limit=0,
            )

    # ------------------------------------------------------------------
    # Thermal
    # ------------------------------------------------------------------

    def check_thermal(
        self,
        pcb_temp_c: Optional[float] = None,
        ic_temp_c: Optional[float] = None,
    ) -> None:
        """Check temperature readings against limits."""
        if pcb_temp_c is not None:
            limit = self._limits["max_pcb_temperature_c"]
            if pcb_temp_c > limit:
                raise SafetyViolation(
                    rule="PCB_TEMPERATURE",
                    detail=f"PCB temp {pcb_temp_c:.1f} C exceeds {limit} C",
                    value=pcb_temp_c,
                    limit=limit,
                )
        if ic_temp_c is not None:
            limit = self._limits["max_ic_temperature_c"]
            if ic_temp_c > limit:
                raise SafetyViolation(
                    rule="IC_TEMPERATURE",
                    detail=f"IC temp {ic_temp_c:.1f} C exceeds {limit} C",
                    value=ic_temp_c,
                    limit=limit,
                )

    # ------------------------------------------------------------------
    # Audit log
    # ------------------------------------------------------------------

    def get_audit_log(self, last_n: int = 50) -> List[dict]:
        """Return the most recent audit entries."""
        return [
            {
                "ts": e.timestamp,
                "action": e.action,
                "parameter": e.parameter,
                "old": e.old_value,
                "new": e.new_value,
                "allowed": e.allowed,
                "reason": e.reason,
            }
            for e in self._audit_log[-last_n:]
        ]

    def _audit(
        self,
        action: str,
        parameter: str,
        old_value: Optional[float],
        new_value: float,
        allowed: bool,
        reason: str = "",
    ) -> None:
        entry = AuditEntry(
            timestamp=time.time(),
            action=action,
            parameter=parameter,
            old_value=old_value,
            new_value=new_value,
            allowed=allowed,
            reason=reason,
        )
        self._audit_log.append(entry)
        if len(self._audit_log) > self._max_audit:
            self._audit_log = self._audit_log[-self._max_audit:]

        level = logging.INFO if allowed else logging.WARNING
        logger.log(
            level,
            "SAFETY %s | %s %s: %.4f -> %.4f | allowed=%s %s",
            action, parameter,
            f"(was {old_value:.4f})" if old_value is not None else "",
            old_value or 0, new_value, allowed, reason,
        )
