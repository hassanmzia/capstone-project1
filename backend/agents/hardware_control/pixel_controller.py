"""
Pixel / electrode array configuration controller.

Manages the 64x64 (4096) electrode array on the CNEAv5 ASIC, including
pixel selection, per-pixel configuration, and CSV-based stimulation
pixel list loading.
"""

import csv
import io
import logging
from dataclasses import dataclass
from enum import Enum
from typing import Any, Dict, List, Optional, Set, Tuple

logger = logging.getLogger(__name__)

ROWS = 64
COLS = 64
TOTAL_PIXELS = ROWS * COLS  # 4096


class GainMode(str, Enum):
    BUFFER = "Buffer Mode"
    GAIN_X40 = "GainX40"
    GAIN_X100 = "GainX100"
    GAIN_X300 = "GainX300"
    GAIN_X40_INV_BIO = "GainX40_Inv_Bio"
    GAIN_X100_INV_BIO = "GainX100_Inv_Bio"
    GAIN_X300_INV_BIO = "GainX300_Inv_Bio"
    DEVICE_TEST = "Device_Test"


# Config-bit presets from the legacy GUI ArrayConfigTableConfig
GAIN_MODE_CONFIGS: Dict[GainMode, int] = {
    GainMode.BUFFER:           0x2400017003,
    GainMode.GAIN_X300_INV_BIO: 0x2420014343,
    GainMode.GAIN_X100_INV_BIO: 0x2420014743,
    GainMode.GAIN_X40_INV_BIO:  0x2420014F43,
    GainMode.DEVICE_TEST:       0x2400014E83,
    GainMode.GAIN_X40:          0x2420014E91,
    GainMode.GAIN_X100:         0x2420014691,
    GainMode.GAIN_X300:         0x2420014291,
}


@dataclass
class PixelGroup:
    """A named group of pixels with shared configuration."""
    name: str
    pixel_indices: List[int]
    config_bits: int  # 38-bit configuration word


class PixelController:
    """Controls pixel selection and configuration on the 64x64 array.

    Parameters
    ----------
    fpga
        FPGA backend (real or simulated).
    """

    def __init__(self, fpga) -> None:
        self._fpga = fpga
        self._current_gain_mode: GainMode = GainMode.DEVICE_TEST
        self._selected_pixels: Set[int] = set()
        self._pixel_groups: List[PixelGroup] = []

    # ------------------------------------------------------------------
    # Coordinate helpers
    # ------------------------------------------------------------------

    @staticmethod
    def pixel_to_rowcol(pixel_index: int) -> Tuple[int, int]:
        """Convert a linear pixel index (0-4095) to (row, col)."""
        return pixel_index // COLS, pixel_index % COLS

    @staticmethod
    def rowcol_to_pixel(row: int, col: int) -> int:
        """Convert (row, col) to a linear pixel index."""
        return row * COLS + col

    @staticmethod
    def site_code(row: int, col: int) -> int:
        """Legacy 4-digit site code: RRCC (e.g. row=9 col=16 -> 0916)."""
        return (row + 1) * 100 + (col + 1)

    @staticmethod
    def parse_site_code(code: int) -> Tuple[int, int]:
        """Parse a legacy 4-digit site code into (row, col)."""
        row = (code // 100) - 1
        col = (code % 100) - 1
        return row, col

    # ------------------------------------------------------------------
    # Selection
    # ------------------------------------------------------------------

    def select_pixels(self, pixel_indices: List[int]) -> Dict[str, Any]:
        """Select specific pixels by index."""
        invalid = [p for p in pixel_indices if p < 0 or p >= TOTAL_PIXELS]
        if invalid:
            raise ValueError(f"Invalid pixel indices: {invalid}")

        self._selected_pixels = set(pixel_indices)
        self._fpga.pixel_sel_write_multiple(pixel_indices)

        logger.info("Selected %d pixels", len(pixel_indices))
        return {
            "status": "selected",
            "count": len(pixel_indices),
            "pixels": sorted(pixel_indices)[:20],  # return first 20 for brevity
        }

    def select_all(self) -> Dict[str, Any]:
        """Select all 4096 pixels."""
        self._selected_pixels = set(range(TOTAL_PIXELS))
        self._fpga.pixel_sel_write_all()
        logger.info("All %d pixels selected", TOTAL_PIXELS)
        return {"status": "selected", "count": TOTAL_PIXELS}

    def select_region(
        self,
        row_start: int,
        row_end: int,
        col_start: int,
        col_end: int,
    ) -> Dict[str, Any]:
        """Select a rectangular region of the array.

        Ranges are inclusive: ``[row_start, row_end]``, ``[col_start, col_end]``.
        """
        if not (0 <= row_start <= row_end < ROWS):
            raise ValueError(f"Invalid row range: [{row_start}, {row_end}]")
        if not (0 <= col_start <= col_end < COLS):
            raise ValueError(f"Invalid col range: [{col_start}, {col_end}]")

        pixels = []
        for r in range(row_start, row_end + 1):
            for c in range(col_start, col_end + 1):
                pixels.append(self.rowcol_to_pixel(r, c))

        return self.select_pixels(pixels)

    def get_selected(self) -> Dict[str, Any]:
        """Return currently selected pixel list."""
        return {
            "count": len(self._selected_pixels),
            "pixels": sorted(self._selected_pixels),
        }

    # ------------------------------------------------------------------
    # Configuration (gain mode)
    # ------------------------------------------------------------------

    def configure_pixel(
        self,
        gain_mode: str,
        pixel_groups: Optional[List[Dict[str, Any]]] = None,
    ) -> Dict[str, Any]:
        """Apply a gain-mode configuration to the array.

        Parameters
        ----------
        gain_mode
            One of the ``GainMode`` values.
        pixel_groups
            Optional list of dicts with ``pixels`` and ``config_bits``
            for per-group overrides (matching the legacy multi-row table).
        """
        try:
            mode = GainMode(gain_mode)
        except ValueError:
            valid = [m.value for m in GainMode]
            raise ValueError(f"Unknown gain mode '{gain_mode}'. Valid: {valid}")

        config_word = GAIN_MODE_CONFIGS[mode]
        config_lsb = config_word >> 32
        config_msb = config_word & 0xFFFFFFFF

        # Enable array config mode on FPGA
        self._fpga.en_Array_Config(True)
        self._fpga.config_reset(True)

        import time
        time.sleep(0.001)

        # Write default config + select all pixels
        self._fpga.config_data_write(config_lsb, config_msb)
        time.sleep(0.001)
        self._fpga.pixel_sel_write_all()

        # Apply per-group overrides
        groups_applied = 0
        if pixel_groups:
            for grp in pixel_groups:
                bits = grp.get("config_bits", config_word)
                pixels = grp.get("pixels", [])
                g_lsb = bits >> 32
                g_msb = bits & 0xFFFFFFFF
                self._fpga.config_data_write(g_lsb, g_msb)
                time.sleep(0.001)
                self._fpga.pixel_sel_write_multiple(pixels)
                self._pixel_groups.append(
                    PixelGroup(
                        name=grp.get("name", f"group_{groups_applied}"),
                        pixel_indices=pixels,
                        config_bits=bits,
                    )
                )
                groups_applied += 1

        self._current_gain_mode = mode
        logger.info(
            "Pixel config applied: mode=%s, groups=%d",
            mode.value, groups_applied,
        )
        return {
            "status": "configured",
            "gain_mode": mode.value,
            "config_word": hex(config_word),
            "groups_applied": groups_applied,
        }

    def get_gain_mode(self) -> Dict[str, Any]:
        config_word = GAIN_MODE_CONFIGS.get(self._current_gain_mode, 0)
        return {
            "gain_mode": self._current_gain_mode.value,
            "config_word": hex(config_word),
            "available_modes": [m.value for m in GainMode],
        }

    # ------------------------------------------------------------------
    # CSV loading (legacy Stim_Pixels.csv format)
    # ------------------------------------------------------------------

    def load_stim_pixels_csv(self, csv_content: str) -> Dict[str, Any]:
        """Parse a CSV of stimulation pixel definitions.

        Expected format (comma-separated)::

            site_code, config_hex
            0916, 0x2420014343
            1530, 0x2420014743

        Site codes use the legacy RRCC format (1-indexed).
        """
        reader = csv.reader(io.StringIO(csv_content))
        groups: List[Dict[str, Any]] = []

        for row_num, row in enumerate(reader):
            if not row or row[0].strip().startswith("#"):
                continue
            if len(row) < 2:
                continue

            try:
                codes_str = row[0].strip()
                config_str = row[1].strip()

                # Parse site codes (may be comma-separated within quotes)
                site_codes = [int(c.strip()) for c in codes_str.split(",") if c.strip().isdigit()]
                if not site_codes and codes_str.isdigit():
                    site_codes = [int(codes_str)]

                config_bits = int(config_str, 0)  # supports 0x prefix

                pixels = []
                for sc in site_codes:
                    r, c = self.parse_site_code(sc)
                    if 0 <= r < ROWS and 0 <= c < COLS:
                        pixels.append(self.rowcol_to_pixel(r, c))

                if pixels:
                    groups.append({
                        "name": f"csv_row_{row_num}",
                        "pixels": pixels,
                        "config_bits": config_bits,
                    })
            except (ValueError, IndexError) as exc:
                logger.warning("Skipping CSV row %d: %s", row_num, exc)

        logger.info("Loaded %d pixel groups from CSV", len(groups))
        return {
            "status": "loaded",
            "groups": len(groups),
            "total_pixels": sum(len(g["pixels"]) for g in groups),
            "group_data": groups,
        }
