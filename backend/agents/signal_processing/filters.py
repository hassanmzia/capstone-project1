"""
Signal filtering module.

Provides bandpass, highpass, lowpass, and notch filters using
``scipy.signal`` IIR filter design (Butterworth) and zero-phase
filtering (``filtfilt``).  Designed for batch processing across many
channels simultaneously.
"""

from __future__ import annotations

import logging
from typing import Optional, Tuple

import numpy as np
from scipy.signal import butter, filtfilt, iirnotch, sosfilt, sosfiltfilt

logger = logging.getLogger(__name__)


class SignalFilter:
    """Collection of IIR digital filters for neural signal processing.

    All public methods accept data shaped ``(num_channels, num_samples)``
    and return an identically-shaped array.  They can also accept a 1-D
    array for a single channel.

    Parameters
    ----------
    default_order : int
        Default Butterworth filter order (used when *order* is not passed
        to individual filter calls).
    """

    DEFAULT_ORDER: int = 4
    DEFAULT_SAMPLE_RATE: float = 10_000.0  # 10 kHz

    def __init__(
        self,
        default_order: int = DEFAULT_ORDER,
        default_sample_rate: float = DEFAULT_SAMPLE_RATE,
    ) -> None:
        self.default_order = default_order
        self.default_sample_rate = default_sample_rate

    # ------------------------------------------------------------------
    # Public filter methods
    # ------------------------------------------------------------------

    def bandpass(
        self,
        data: np.ndarray,
        low_freq: float,
        high_freq: float,
        sample_rate: Optional[float] = None,
        order: Optional[int] = None,
    ) -> np.ndarray:
        """Apply a zero-phase Butterworth **bandpass** filter.

        Parameters
        ----------
        data : ndarray
            Shape ``(channels, samples)`` or ``(samples,)``.
        low_freq : float
            Low cutoff frequency in Hz.
        high_freq : float
            High cutoff frequency in Hz.
        sample_rate : float, optional
            Sampling rate in Hz.  Falls back to ``default_sample_rate``.
        order : int, optional
            Filter order.  Falls back to ``default_order``.
        """
        fs = sample_rate or self.default_sample_rate
        n = order or self.default_order
        data, was_1d = self._ensure_2d(data)

        nyq = fs / 2.0
        low = max(low_freq / nyq, 1e-6)
        high = min(high_freq / nyq, 1.0 - 1e-6)

        if low >= high:
            logger.warning(
                "bandpass: low_freq (%.1f Hz) >= high_freq (%.1f Hz); returning unfiltered data",
                low_freq, high_freq,
            )
            return self._restore_shape(data, was_1d)

        sos = butter(n, [low, high], btype="bandpass", output="sos")
        filtered = sosfiltfilt(sos, data, axis=1)
        return self._restore_shape(filtered, was_1d)

    def highpass(
        self,
        data: np.ndarray,
        cutoff: float,
        sample_rate: Optional[float] = None,
        order: Optional[int] = None,
    ) -> np.ndarray:
        """Apply a zero-phase Butterworth **highpass** filter."""
        fs = sample_rate or self.default_sample_rate
        n = order or self.default_order
        data, was_1d = self._ensure_2d(data)

        nyq = fs / 2.0
        wn = max(cutoff / nyq, 1e-6)

        if wn >= 1.0:
            logger.warning(
                "highpass: cutoff (%.1f Hz) >= Nyquist (%.1f Hz); returning unfiltered data",
                cutoff, nyq,
            )
            return self._restore_shape(data, was_1d)

        sos = butter(n, wn, btype="highpass", output="sos")
        filtered = sosfiltfilt(sos, data, axis=1)
        return self._restore_shape(filtered, was_1d)

    def lowpass(
        self,
        data: np.ndarray,
        cutoff: float,
        sample_rate: Optional[float] = None,
        order: Optional[int] = None,
    ) -> np.ndarray:
        """Apply a zero-phase Butterworth **lowpass** filter."""
        fs = sample_rate or self.default_sample_rate
        n = order or self.default_order
        data, was_1d = self._ensure_2d(data)

        nyq = fs / 2.0
        wn = min(cutoff / nyq, 1.0 - 1e-6)

        if wn <= 0:
            logger.warning(
                "lowpass: cutoff (%.1f Hz) is non-positive; returning unfiltered data",
                cutoff,
            )
            return self._restore_shape(data, was_1d)

        sos = butter(n, wn, btype="lowpass", output="sos")
        filtered = sosfiltfilt(sos, data, axis=1)
        return self._restore_shape(filtered, was_1d)

    def notch(
        self,
        data: np.ndarray,
        freq: float,
        sample_rate: Optional[float] = None,
        quality_factor: float = 30.0,
    ) -> np.ndarray:
        """Apply a zero-phase **notch** (band-reject) filter.

        Useful for removing power-line interference (50 / 60 Hz).

        Parameters
        ----------
        freq : float
            Centre frequency to reject (Hz).
        quality_factor : float
            Quality factor *Q*.  Higher values produce a narrower notch.
        """
        fs = sample_rate or self.default_sample_rate
        data, was_1d = self._ensure_2d(data)

        nyq = fs / 2.0
        if freq >= nyq:
            logger.warning(
                "notch: freq (%.1f Hz) >= Nyquist (%.1f Hz); returning unfiltered data",
                freq, nyq,
            )
            return self._restore_shape(data, was_1d)

        b, a = iirnotch(freq, quality_factor, fs)
        filtered = filtfilt(b, a, data, axis=1)
        return self._restore_shape(filtered, was_1d)

    # ------------------------------------------------------------------
    # Batch convenience
    # ------------------------------------------------------------------

    def apply_filter_chain(
        self,
        data: np.ndarray,
        filters: list,
        sample_rate: Optional[float] = None,
    ) -> np.ndarray:
        """Apply a sequence of filters in order.

        Parameters
        ----------
        filters : list[dict]
            Each dict must have a ``"type"`` key (one of ``"bandpass"``,
            ``"highpass"``, ``"lowpass"``, ``"notch"``) plus the
            corresponding parameters.

        Example::

            [
                {"type": "highpass", "cutoff": 300},
                {"type": "notch", "freq": 60, "quality_factor": 30},
            ]
        """
        result = data.copy()
        for filt in filters:
            ftype = filt["type"]
            if ftype == "bandpass":
                result = self.bandpass(
                    result, filt["low_freq"], filt["high_freq"],
                    sample_rate=sample_rate, order=filt.get("order"),
                )
            elif ftype == "highpass":
                result = self.highpass(
                    result, filt["cutoff"],
                    sample_rate=sample_rate, order=filt.get("order"),
                )
            elif ftype == "lowpass":
                result = self.lowpass(
                    result, filt["cutoff"],
                    sample_rate=sample_rate, order=filt.get("order"),
                )
            elif ftype == "notch":
                result = self.notch(
                    result, filt["freq"],
                    sample_rate=sample_rate,
                    quality_factor=filt.get("quality_factor", 30.0),
                )
            else:
                logger.warning("Unknown filter type '%s', skipping.", ftype)
        return result

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _ensure_2d(data: np.ndarray) -> Tuple[np.ndarray, bool]:
        """Promote 1-D input to ``(1, N)`` and remember the original shape."""
        if data.ndim == 1:
            return data.reshape(1, -1), True
        return data, False

    @staticmethod
    def _restore_shape(data: np.ndarray, was_1d: bool) -> np.ndarray:
        if was_1d:
            return data.squeeze(axis=0)
        return data
