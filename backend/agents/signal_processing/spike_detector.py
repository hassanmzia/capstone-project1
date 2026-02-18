"""
Spike detection module.

Implements window-based threshold crossing detection originally from GUI.py's
``Spike_Detect_Win`` function.  Designed to work on numpy arrays shaped
(num_channels, num_samples) -- typically (4096, 512) for a single batch
from the CNEA v5 electrode array.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple

import numpy as np

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Data classes for spike events
# ---------------------------------------------------------------------------


@dataclass
class SpikeEvent:
    """A single detected spike."""

    site_id: int
    amplitude: float
    timestamp_sample: int
    threshold_used: float
    polarity: str  # "positive" or "negative"


@dataclass
class SpikeDetectionResult:
    """Aggregate result from one call to ``detect``."""

    spike_counts: np.ndarray  # (num_channels,) int array
    events: List[SpikeEvent] = field(default_factory=list)
    sigma: float = 5.0
    window_size: int = 512
    total_spikes: int = 0


# ---------------------------------------------------------------------------
# SpikeDetector class
# ---------------------------------------------------------------------------


class SpikeDetector:
    """Window-based threshold-crossing spike detector.

    The algorithm mirrors the original ``Spike_Detect_Win`` in the legacy
    GUI.py:

    1. Divide each channel's time series into non-overlapping windows.
    2. Compute per-channel mean and std within each window.
    3. Flag a spike when any sample exceeds ``mean +/- sigma * std``.
    4. Accumulate spike counts across windows.

    All operations use **vectorised numpy** so they scale efficiently to
    4096 channels.
    """

    # Acceptable sigma range
    SIGMA_MIN: float = 1.0
    SIGMA_MAX: float = 10.0
    DEFAULT_SIGMA: float = 5.0
    DEFAULT_WINDOW: int = 512

    def __init__(
        self,
        sigma: float = DEFAULT_SIGMA,
        window_size: int = DEFAULT_WINDOW,
        sample_rate: float = 10_000.0,
    ) -> None:
        self.sigma = self._clamp_sigma(sigma)
        self.window_size = window_size
        self.sample_rate = sample_rate

        # Running accumulator across multiple calls
        self._cumulative_counts: Optional[np.ndarray] = None

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def detect(
        self,
        data: np.ndarray,
        sigma: Optional[float] = None,
        window_size: Optional[int] = None,
        return_events: bool = False,
    ) -> SpikeDetectionResult:
        """Run spike detection on *data* (channels x samples).

        Parameters
        ----------
        data:
            2-D array with shape ``(num_channels, num_samples)``.
        sigma:
            Override the instance sigma for this call.
        window_size:
            Override the instance window size for this call.
        return_events:
            If ``True``, also populate the ``events`` list with
            individual :class:`SpikeEvent` objects (slower for large
            channel counts).

        Returns
        -------
        SpikeDetectionResult
        """
        if data.ndim == 1:
            data = data.reshape(1, -1)

        num_channels, num_samples = data.shape
        sig = self._clamp_sigma(sigma if sigma is not None else self.sigma)
        win = window_size if window_size is not None else self.window_size

        spike_counts = self._spike_detect_win(data, sig, win)

        events: List[SpikeEvent] = []
        if return_events:
            events = self._extract_events(data, sig, win)

        total = int(np.sum(spike_counts))

        # Update running accumulator
        if self._cumulative_counts is None or self._cumulative_counts.shape[0] != num_channels:
            self._cumulative_counts = np.zeros(num_channels, dtype=np.float64)
        self._cumulative_counts += spike_counts

        return SpikeDetectionResult(
            spike_counts=spike_counts,
            events=events,
            sigma=sig,
            window_size=win,
            total_spikes=total,
        )

    def get_cumulative_counts(self) -> Optional[np.ndarray]:
        """Return the running spike count vector (or ``None`` if ``detect``
        has not been called yet)."""
        if self._cumulative_counts is not None:
            return self._cumulative_counts.copy()
        return None

    def reset_counts(self) -> None:
        """Zero out the running spike accumulator."""
        if self._cumulative_counts is not None:
            self._cumulative_counts[:] = 0.0
        logger.info("Spike counts reset.")

    def set_sigma(self, sigma: float) -> None:
        self.sigma = self._clamp_sigma(sigma)

    # ------------------------------------------------------------------
    # Core algorithm  (vectorised)
    # ------------------------------------------------------------------

    @staticmethod
    def _spike_detect_win(
        data: np.ndarray,
        sigma: float,
        win_size: int,
    ) -> np.ndarray:
        """Vectorised reimplementation of the original ``Spike_Detect_Win``.

        Mirrors the legacy logic:
        - Iterate over non-overlapping windows
        - Compute per-channel mean, std, limit
        - Count windows where max > upper or min < lower
        """
        num_channels, num_samples = data.shape
        win_num = int(np.ceil(num_samples / win_size))
        spike_count = np.zeros(num_channels, dtype=np.float64)

        for idx in range(win_num):
            start = idx * win_size
            end = min((idx + 1) * win_size, num_samples)
            win_data = data[:, start:end]

            win_mean = np.mean(win_data, axis=1)
            win_std = np.std(win_data, axis=1)
            limit = sigma * win_std

            above_limit = win_mean + limit
            below_limit = win_mean - limit

            win_max = np.amax(win_data, axis=1)
            win_min = np.amin(win_data, axis=1)

            pos_spike = win_max > above_limit
            neg_spike = win_min < below_limit

            spike_count += pos_spike.astype(np.float64) + neg_spike.astype(np.float64)

        return spike_count

    # ------------------------------------------------------------------
    # Detailed event extraction (optional, slower path)
    # ------------------------------------------------------------------

    def _extract_events(
        self,
        data: np.ndarray,
        sigma: float,
        win_size: int,
    ) -> List[SpikeEvent]:
        """Extract individual spike events with amplitude and timestamp."""
        num_channels, num_samples = data.shape
        win_num = int(np.ceil(num_samples / win_size))
        events: List[SpikeEvent] = []

        for idx in range(win_num):
            start = idx * win_size
            end = min((idx + 1) * win_size, num_samples)
            win_data = data[:, start:end]

            win_mean = np.mean(win_data, axis=1)
            win_std = np.std(win_data, axis=1)
            limit = sigma * win_std

            above_limit = win_mean + limit
            below_limit = win_mean - limit

            win_max = np.amax(win_data, axis=1)
            win_min = np.amin(win_data, axis=1)

            # Positive spikes
            pos_mask = win_max > above_limit
            pos_channels = np.where(pos_mask)[0]
            for ch in pos_channels:
                peak_idx = int(np.argmax(win_data[ch])) + start
                events.append(
                    SpikeEvent(
                        site_id=int(ch),
                        amplitude=float(win_max[ch]),
                        timestamp_sample=peak_idx,
                        threshold_used=float(above_limit[ch]),
                        polarity="positive",
                    )
                )

            # Negative spikes
            neg_mask = win_min < below_limit
            neg_channels = np.where(neg_mask)[0]
            for ch in neg_channels:
                trough_idx = int(np.argmin(win_data[ch])) + start
                events.append(
                    SpikeEvent(
                        site_id=int(ch),
                        amplitude=float(win_min[ch]),
                        timestamp_sample=trough_idx,
                        threshold_used=float(below_limit[ch]),
                        polarity="negative",
                    )
                )

        return events

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    @classmethod
    def _clamp_sigma(cls, sigma: float) -> float:
        return float(np.clip(sigma, cls.SIGMA_MIN, cls.SIGMA_MAX))
