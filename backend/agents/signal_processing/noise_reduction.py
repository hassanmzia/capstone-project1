"""
Noise reduction module.

Provides common-mode rejection (from the original GUI.py noise reduction
logic), artifact detection/interpolation, and temporal smoothing.

All methods operate on numpy arrays shaped ``(num_channels, num_samples)``
matching the CNEA v5 data format.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, Optional, Tuple

import numpy as np

logger = logging.getLogger(__name__)


class NoiseReducer:
    """Noise reduction utilities for multi-channel neural recordings.

    The primary method -- :meth:`common_mode_rejection` -- mirrors the
    original GUI.py noise-reduction toggle that subtracts the mean across
    all channels at each time-point, removing correlated interference.
    """

    def __init__(self, num_channels: int = 4096) -> None:
        self.num_channels = num_channels

    # ------------------------------------------------------------------
    # Common-Mode Rejection (CAR)
    # ------------------------------------------------------------------

    def common_mode_rejection(
        self,
        data: np.ndarray,
        reference_channels: Optional[np.ndarray] = None,
    ) -> np.ndarray:
        """Subtract the common-mode signal (mean across channels).

        This is the Common Average Reference (CAR) technique used in the
        original GUI when the *Noise Reduction* checkbox is enabled.

        Parameters
        ----------
        data : ndarray
            Shape ``(num_channels, num_samples)``.
        reference_channels : ndarray, optional
            Boolean mask or index array selecting which channels to
            include when computing the common mode.  If ``None`` all
            channels are used.

        Returns
        -------
        ndarray
            Corrected data with the same shape as *data*.
        """
        data = self._ensure_2d(data)

        if reference_channels is not None:
            ref_data = data[reference_channels, :]
        else:
            ref_data = data

        common_mode = np.mean(ref_data, axis=0, keepdims=True)
        corrected = data - common_mode
        return corrected

    # ------------------------------------------------------------------
    # Median Reference (alternative to CAR)
    # ------------------------------------------------------------------

    def median_reference(
        self,
        data: np.ndarray,
        reference_channels: Optional[np.ndarray] = None,
    ) -> np.ndarray:
        """Subtract the **median** across channels (more robust to outliers).

        Parameters
        ----------
        data : ndarray
            Shape ``(num_channels, num_samples)``.
        reference_channels : ndarray, optional

        Returns
        -------
        ndarray
        """
        data = self._ensure_2d(data)

        if reference_channels is not None:
            ref_data = data[reference_channels, :]
        else:
            ref_data = data

        common_mode = np.median(ref_data, axis=0, keepdims=True)
        corrected = data - common_mode
        return corrected

    # ------------------------------------------------------------------
    # Artifact Removal
    # ------------------------------------------------------------------

    def artifact_removal(
        self,
        data: np.ndarray,
        threshold: float = 10.0,
        method: str = "interpolate",
    ) -> np.ndarray:
        """Detect large artifacts and replace them.

        Parameters
        ----------
        data : ndarray
            Shape ``(num_channels, num_samples)``.
        threshold : float
            Samples whose absolute deviation from the channel mean exceeds
            ``threshold * channel_std`` are considered artefacts.
        method : str
            ``"interpolate"`` -- linear interpolation over artefact regions.
            ``"zero"`` -- replace artefact samples with the channel mean.

        Returns
        -------
        ndarray
        """
        data = self._ensure_2d(data)
        result = data.copy()
        num_channels, num_samples = result.shape

        ch_mean = np.mean(result, axis=1, keepdims=True)
        ch_std = np.std(result, axis=1, keepdims=True)
        ch_std[ch_std < 1e-12] = 1e-12  # avoid division by zero

        # Boolean mask of artifact samples
        artifact_mask = np.abs(result - ch_mean) > (threshold * ch_std)

        if method == "zero":
            # Replace artifacts with channel mean
            result[artifact_mask] = np.broadcast_to(ch_mean, result.shape)[artifact_mask]
        else:
            # Linear interpolation per channel
            for ch in range(num_channels):
                bad = np.where(artifact_mask[ch])[0]
                if len(bad) == 0:
                    continue
                good = np.where(~artifact_mask[ch])[0]
                if len(good) < 2:
                    result[ch, bad] = ch_mean[ch, 0]
                    continue
                result[ch, bad] = np.interp(bad, good, result[ch, good])

        num_artifacts = int(np.sum(artifact_mask))
        if num_artifacts > 0:
            logger.info(
                "Artifact removal: replaced %d samples across %d channels",
                num_artifacts,
                int(np.any(artifact_mask, axis=1).sum()),
            )

        return result

    # ------------------------------------------------------------------
    # Moving Average (temporal smoothing)
    # ------------------------------------------------------------------

    def moving_average(
        self,
        data: np.ndarray,
        window_size: int = 5,
    ) -> np.ndarray:
        """Apply a causal moving-average filter along the time axis.

        Parameters
        ----------
        data : ndarray
            Shape ``(num_channels, num_samples)``.
        window_size : int
            Number of samples in the averaging window.

        Returns
        -------
        ndarray
        """
        data = self._ensure_2d(data)
        if window_size < 2:
            return data

        # Use cumsum trick for efficient 1-D convolution across channels
        num_channels, num_samples = data.shape
        kernel = np.ones(window_size, dtype=np.float64) / window_size
        result = np.empty_like(data)
        for ch in range(num_channels):
            result[ch] = np.convolve(data[ch], kernel, mode="same")
        return result

    # ------------------------------------------------------------------
    # Convenience: full pipeline
    # ------------------------------------------------------------------

    def reduce(
        self,
        data: np.ndarray,
        car: bool = True,
        artifact_threshold: Optional[float] = None,
        smooth_window: Optional[int] = None,
    ) -> Dict[str, Any]:
        """Run a configurable noise-reduction pipeline and return both
        the cleaned data and a summary dict.

        Returns
        -------
        dict
            ``{"data": ndarray, "steps_applied": [...], "artifact_count": int}``
        """
        result = data.copy()
        steps = []
        artifact_count = 0

        if car:
            result = self.common_mode_rejection(result)
            steps.append("common_mode_rejection")

        if artifact_threshold is not None and artifact_threshold > 0:
            before = result.copy()
            result = self.artifact_removal(result, threshold=artifact_threshold)
            artifact_count = int(np.sum(before != result))
            steps.append(f"artifact_removal(threshold={artifact_threshold})")

        if smooth_window is not None and smooth_window > 1:
            result = self.moving_average(result, window_size=smooth_window)
            steps.append(f"moving_average(window={smooth_window})")

        return {
            "data": result,
            "steps_applied": steps,
            "artifact_count": artifact_count,
        }

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _ensure_2d(data: np.ndarray) -> np.ndarray:
        if data.ndim == 1:
            return data.reshape(1, -1)
        return data
