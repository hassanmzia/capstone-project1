"""
Clock configuration controller for the CNEAv5 FPGA.

Manages the stimulation clock dividers (CLK1, CLK2, CLK3, PG_CLK) and
the data acquisition clock.  All clocks are derived from a 200 MHz
master oscillator on the Opal Kelly board.
"""

import logging
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

MASTER_CLOCK_HZ = 200_000_000  # 200 MHz


@dataclass
class ClockDef:
    """Definition for a single clock output."""
    name: str
    min_divider: int
    max_divider: int
    default_divider: int
    description: str


CLOCK_DEFINITIONS: List[ClockDef] = [
    ClockDef("CLK1",     1, 1023, 100, "Stimulation clock 1"),
    ClockDef("CLK2",     1, 1023, 250, "Stimulation clock 2"),
    ClockDef("CLK3",     1, 1023, 250, "Stimulation clock 3"),
    ClockDef("PG_CLK",   0,  255,   0, "Pattern generator clock"),
    ClockDef("DATA_CLK", 1, 1023,   1, "Data acquisition speed factor"),
]

CLOCK_MAP: Dict[str, ClockDef] = {c.name: c for c in CLOCK_DEFINITIONS}


class ClockController:
    """Manages clock divider configuration.

    Parameters
    ----------
    fpga
        FPGA backend (real or simulated).
    """

    def __init__(self, fpga) -> None:
        self._fpga = fpga
        self._current: Dict[str, int] = {c.name: c.default_divider for c in CLOCK_DEFINITIONS}

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    @staticmethod
    def divider_to_frequency(divider: int) -> float:
        """Convert a clock divider value to a frequency in Hz."""
        if divider <= 0:
            return 0.0
        return MASTER_CLOCK_HZ / divider

    @staticmethod
    def frequency_to_divider(freq_hz: float) -> int:
        """Convert a target frequency to the nearest divider value."""
        if freq_hz <= 0:
            return 0
        return max(1, round(MASTER_CLOCK_HZ / freq_hz))

    # ------------------------------------------------------------------
    # Get / Set
    # ------------------------------------------------------------------

    def get_all(self) -> Dict[str, Any]:
        """Return current clock settings with derived frequencies."""
        result = {}
        for cdef in CLOCK_DEFINITIONS:
            div = self._current[cdef.name]
            result[cdef.name] = {
                "divider": div,
                "frequency_hz": self.divider_to_frequency(div),
                "description": cdef.description,
            }
        return result

    def get(self, name: str) -> Dict[str, Any]:
        if name not in CLOCK_MAP:
            raise ValueError(f"Unknown clock: {name}")
        div = self._current[name]
        return {
            "name": name,
            "divider": div,
            "frequency_hz": self.divider_to_frequency(div),
        }

    def set_clocks(self, dividers: Dict[str, int]) -> Dict[str, Any]:
        """Set one or more clock dividers and program the FPGA.

        Parameters
        ----------
        dividers
            Mapping of clock name to integer divider value.

        Returns
        -------
        dict with status and per-clock changes.
        """
        # Validate
        for name, div in dividers.items():
            if name not in CLOCK_MAP:
                raise ValueError(f"Unknown clock: {name}")
            cdef = CLOCK_MAP[name]
            if div < cdef.min_divider or div > cdef.max_divider:
                raise ValueError(
                    f"{name} divider {div} out of range "
                    f"[{cdef.min_divider}, {cdef.max_divider}]"
                )

        # Apply
        for name, div in dividers.items():
            self._current[name] = div

        # Write to FPGA (mirrors legacy stim_clk_init)
        clk1 = self._current["CLK1"]
        clk2 = self._current["CLK2"]
        clk3 = self._current["CLK3"]
        pg = self._current["PG_CLK"]

        self._fpga.stim_clk_init(clk1, clk2, clk3, pg)

        changes = []
        for name, div in dividers.items():
            changes.append({
                "name": name,
                "divider": div,
                "frequency_hz": self.divider_to_frequency(div),
            })
            logger.info(
                "Clock %s: divider=%d  freq=%.1f Hz",
                name, div, self.divider_to_frequency(div),
            )

        return {
            "status": "applied",
            "changes": changes,
        }

    def get_definitions(self) -> List[Dict[str, Any]]:
        """Return metadata about all clocks."""
        return [
            {
                "name": c.name,
                "min_divider": c.min_divider,
                "max_divider": c.max_divider,
                "default_divider": c.default_divider,
                "current_divider": self._current[c.name],
                "current_freq_hz": self.divider_to_frequency(self._current[c.name]),
                "description": c.description,
            }
            for c in CLOCK_DEFINITIONS
        ]
