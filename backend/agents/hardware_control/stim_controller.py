"""
Stimulation controller for the CNEAv5 platform.

Supports DC, AC (sinusoidal), Pulse, and Arbitrary waveform modes.
All write operations pass through safety validation before reaching
the FPGA DAC.
"""

import logging
import time
from enum import Enum
from typing import Any, Dict, List, Optional

import numpy as np

from agents.hardware_control.safety import HardwareSafetyGuard, SafetyViolation

logger = logging.getLogger(__name__)

MASTER_CLOCK_HZ = 200_000_000


class StimMode(str, Enum):
    DC = "dc"
    AC = "ac"
    PULSE = "pulse"
    ARBITRARY = "arbitrary"


class StimController:
    """Stimulation waveform controller.

    Parameters
    ----------
    fpga
        FPGA backend (real or simulated).
    safety
        Safety guard for parameter validation.
    """

    def __init__(self, fpga, safety: HardwareSafetyGuard) -> None:
        self._fpga = fpga
        self._safety = safety
        self._is_active = False
        self._current_mode: Optional[StimMode] = None
        self._current_params: Dict[str, Any] = {}
        self._waveforms: Dict[str, Dict[str, Any]] = {}  # uploaded arb waveforms
        self._requires_human_approval = True  # human-in-the-loop flag

    # ------------------------------------------------------------------
    # DC / AC / Pulse
    # ------------------------------------------------------------------

    def configure_dc(
        self,
        vs_channel: int,
        amplitude_v: float,
    ) -> Dict[str, Any]:
        """Configure DC stimulation on a VS channel (1-4)."""
        if vs_channel < 1 or vs_channel > 4:
            raise ValueError(f"VS channel must be 1-4 (got {vs_channel})")

        self._safety.validate_stimulation(
            amplitude_ua=0,
            pulse_width_us=0,
            frequency_hz=1.0,
            mode="dc",
        )

        # Write via DAC (DC mode)
        dac_code = round(65535 * amplitude_v / 5.0)
        dac_code = max(0, min(dac_code, 65535))
        self._fpga.dac_write(0x01, 0x07 + vs_channel, dac_code)

        self._current_mode = StimMode.DC
        self._current_params = {
            "vs_channel": vs_channel,
            "amplitude_v": amplitude_v,
            "dac_code": dac_code,
        }

        logger.info("DC stim configured: VS%d = %.4f V", vs_channel, amplitude_v)
        return {"status": "configured", "mode": "dc", **self._current_params}

    def configure_ac_pulse(
        self,
        mode: str,
        vs_channel: int,
        amp_dc: float,
        amp_peak: float,
        frequency_hz: float,
        duty: float = 0.5,
    ) -> Dict[str, Any]:
        """Configure AC or Pulse stimulation.

        Parameters match the legacy ``dac_vs_write_ac_pulse`` interface.
        """
        if mode not in ("ac", "pulse"):
            raise ValueError(f"Mode must be 'ac' or 'pulse' (got '{mode}')")
        if vs_channel < 1 or vs_channel > 4:
            raise ValueError(f"VS channel must be 1-4 (got {vs_channel})")
        if not 0.0 <= duty <= 1.0:
            raise ValueError(f"Duty cycle must be in [0, 1] (got {duty})")

        # Voltage-mode safety: validate voltage range and frequency
        v_max = self._safety._limits["max_waveform_amplitude_v"]
        if abs(amp_dc) > v_max or abs(amp_peak) > v_max:
            from agents.hardware_control.safety import SafetyViolation
            raise SafetyViolation(
                rule="STIM_VOLTAGE",
                detail=f"Voltage ({amp_dc}/{amp_peak} V) exceeds {v_max} V",
                value=max(abs(amp_dc), abs(amp_peak)),
                limit=v_max,
            )
        f_max = self._safety._limits["max_stim_frequency_hz"]
        f_min = self._safety._limits["min_stim_frequency_hz"]
        if frequency_hz < f_min or frequency_hz > f_max:
            from agents.hardware_control.safety import SafetyViolation
            raise SafetyViolation(
                rule="STIM_FREQUENCY",
                detail=f"Frequency {frequency_hz} Hz outside [{f_min}, {f_max}] Hz",
                value=frequency_hz,
                limit=f_max,
            )

        # Delegate to FPGA
        self._fpga.dac_vs_write_ac_pulse(
            mode=mode,
            vs=vs_channel,
            amp_dc=amp_dc,
            amp_peak=amp_peak,
            freq=frequency_hz,
            duty=duty,
        )

        self._current_mode = StimMode.AC if mode == "ac" else StimMode.PULSE
        self._current_params = {
            "vs_channel": vs_channel,
            "amp_dc": amp_dc,
            "amp_peak": amp_peak,
            "frequency_hz": frequency_hz,
            "duty": duty,
        }

        logger.info(
            "%s stim configured: VS%d  DC=%.4f  Peak=%.4f  f=%.1f Hz  duty=%.2f",
            mode.upper(), vs_channel, amp_dc, amp_peak, frequency_hz, duty,
        )
        return {"status": "configured", "mode": mode, **self._current_params}

    # ------------------------------------------------------------------
    # Arbitrary waveform
    # ------------------------------------------------------------------

    def upload_waveform(
        self,
        waveform_id: str,
        samples: List[float],
        sample_rate_hz: float,
    ) -> Dict[str, Any]:
        """Upload an arbitrary waveform to the FPGA memory.

        Mirrors the legacy ``Waveform2FPGA`` method.
        """
        self._safety.validate_waveform(samples, sample_rate_hz)

        # Disable output during upload
        self._fpga.send_wire(0x0D, 0x00, 0x00000010)  # Stop arb waveform
        self._fpga.send_wire(0x0D, 0x00, 0x00000008)  # Disable DAC DC output

        # Set sample rate
        clk_div = int(MASTER_CLOCK_HZ / sample_rate_hz)
        self._fpga.send_wire(0x11, clk_div, 0xFFFFFFFF)

        # Set length
        self._fpga.send_wire(0x0E, len(samples) - 1, 0xFFFFFFFF)

        # Write samples to register file
        for i, s in enumerate(samples):
            code = int(s / (2.518 * 2) * 65535)
            code = max(0, min(code, 65535))
            self._fpga.write_reg(i, code)

        # Set DC restore value (midpoint ~1.7 V)
        dc_restore = int(1.7 / (2.518 * 2) * 65535)
        self._fpga.dac_write(0x04, 0x0A, dc_restore)

        # Store metadata
        self._waveforms[waveform_id] = {
            "n_samples": len(samples),
            "sample_rate_hz": sample_rate_hz,
            "duration_ms": len(samples) / sample_rate_hz * 1000,
            "peak_v": max(abs(s) for s in samples) if samples else 0,
            "uploaded_at": time.time(),
        }

        logger.info(
            "Waveform '%s' uploaded: %d points @ %.0f Hz",
            waveform_id, len(samples), sample_rate_hz,
        )
        return {
            "status": "uploaded",
            "waveform_id": waveform_id,
            **self._waveforms[waveform_id],
        }

    def trigger_waveform(
        self,
        waveform_id: Optional[str] = None,
        repeat: bool = False,
        repeat_count: int = 1,
    ) -> Dict[str, Any]:
        """Trigger the arbitrary waveform output.

        Parameters
        ----------
        waveform_id
            Optional – only used for validation / logging.
        repeat
            If True, loop the waveform indefinitely.
        repeat_count
            Number of repetitions (ignored if ``repeat`` is True).
        """
        if waveform_id and waveform_id not in self._waveforms:
            raise ValueError(f"Waveform '{waveform_id}' not found")

        # Set repeat mode
        self._fpga.send_wire(0x0D, int(repeat) << 5, 0x00000020)
        time.sleep(0.001)
        self._fpga.send_wire(0x0D, (max(0, repeat_count - 1)) << 12, 0xFFFFF000)

        # Trigger
        self._fpga.send_wire(0x0D, 0x00, 0x00000010)  # stop first
        time.sleep(0.001)
        self._fpga.send_wire(0x0D, 0x10, 0x00000010)  # start

        self._is_active = True
        self._current_mode = StimMode.ARBITRARY

        logger.info(
            "Waveform triggered (id=%s, repeat=%s, count=%d)",
            waveform_id, repeat, repeat_count,
        )
        return {
            "status": "triggered",
            "waveform_id": waveform_id,
            "repeat": repeat,
            "repeat_count": repeat_count,
        }

    # ------------------------------------------------------------------
    # Start / Stop
    # ------------------------------------------------------------------

    def start_stimulation(self, clk_enables: Dict[str, bool] = None) -> Dict[str, Any]:
        """Enable stimulation clock outputs."""
        enables = clk_enables or {"CLK1": True, "CLK2": True, "CLK3": True, "ALL": False}
        status = (
            (int(enables.get("ALL", False)) << 27)
            | (int(enables.get("CLK3", False)) << 26)
            | (int(enables.get("CLK2", False)) << 25)
            | (int(enables.get("CLK1", False)) << 24)
        )
        self._fpga.send_wire(0x00, status, 0x0F000000)
        self._is_active = True
        logger.info("Stimulation started: %s", enables)
        return {"status": "started", "clk_enables": enables}

    def stop_stimulation(self) -> Dict[str, Any]:
        """Disable all stimulation outputs."""
        self._fpga.send_wire(0x00, 0, 0x0F000000)
        self._fpga.send_wire(0x0D, 0x00, 0x00000010)  # stop arb waveform
        self._is_active = False
        self._current_mode = None
        logger.info("Stimulation stopped")
        return {"status": "stopped"}

    # ------------------------------------------------------------------
    # Query
    # ------------------------------------------------------------------

    def get_status(self) -> Dict[str, Any]:
        return {
            "is_active": self._is_active,
            "mode": self._current_mode.value if self._current_mode else None,
            "params": self._current_params,
            "uploaded_waveforms": list(self._waveforms.keys()),
            "requires_human_approval": self._requires_human_approval,
        }

    def list_waveforms(self) -> Dict[str, Any]:
        return dict(self._waveforms)
