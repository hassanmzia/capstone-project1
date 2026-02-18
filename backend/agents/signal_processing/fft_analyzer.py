"""
FFT / spectral analysis module.

Provides FFT, power spectral density (Welch), and spectrogram computation
on neural signal data.  All public methods return plain Python dicts so
they can be directly serialised to JSON.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional, Tuple, Union

import numpy as np
from scipy.signal import spectrogram as scipy_spectrogram
from scipy.signal import welch

logger = logging.getLogger(__name__)


class FFTAnalyzer:
    """Frequency-domain analysis utilities for neural signals.

    Accepts data shaped ``(num_channels, num_samples)`` or ``(num_samples,)``
    for a single channel.
    """

    DEFAULT_SAMPLE_RATE: float = 10_000.0  # 10 kHz

    def __init__(self, default_sample_rate: float = DEFAULT_SAMPLE_RATE) -> None:
        self.default_sample_rate = default_sample_rate

    # ------------------------------------------------------------------
    # FFT
    # ------------------------------------------------------------------

    def compute_fft(
        self,
        data: np.ndarray,
        sample_rate: Optional[float] = None,
        channels: Optional[List[int]] = None,
    ) -> Dict[str, Any]:
        """Compute the one-sided FFT of each channel.

        Parameters
        ----------
        data : ndarray
            Shape ``(channels, samples)`` or ``(samples,)``.
        sample_rate : float, optional
        channels : list[int], optional
            Subset of channel indices to process.

        Returns
        -------
        dict
            ``{"frequencies": [...], "magnitudes": {...}, "num_channels": int}``
            where ``magnitudes`` maps channel index (str) to a list of float.
        """
        fs = sample_rate or self.default_sample_rate
        data = self._ensure_2d(data)

        if channels is not None:
            data = data[channels, :]
            channel_ids = channels
        else:
            channel_ids = list(range(data.shape[0]))

        num_samples = data.shape[1]
        # Apply Hanning window
        window = np.hanning(num_samples)
        windowed = data * window[np.newaxis, :]

        fft_vals = np.fft.rfft(windowed, axis=1)
        magnitudes = np.abs(fft_vals) * 2.0 / num_samples
        frequencies = np.fft.rfftfreq(num_samples, d=1.0 / fs)

        mag_dict: Dict[str, List[float]] = {}
        for i, ch_id in enumerate(channel_ids):
            mag_dict[str(ch_id)] = magnitudes[i].tolist()

        return {
            "frequencies": frequencies.tolist(),
            "magnitudes": mag_dict,
            "num_channels": len(channel_ids),
            "sample_rate": fs,
            "num_samples": num_samples,
        }

    # ------------------------------------------------------------------
    # Power Spectral Density (Welch)
    # ------------------------------------------------------------------

    def compute_psd(
        self,
        data: np.ndarray,
        sample_rate: Optional[float] = None,
        nperseg: Optional[int] = None,
        channels: Optional[List[int]] = None,
    ) -> Dict[str, Any]:
        """Compute the power spectral density using Welch's method.

        Parameters
        ----------
        data : ndarray
            Shape ``(channels, samples)`` or ``(samples,)``.
        sample_rate : float, optional
        nperseg : int, optional
            Length of each segment for Welch.  Defaults to
            ``min(256, num_samples)``.
        channels : list[int], optional
            Subset of channel indices.

        Returns
        -------
        dict
            ``{"frequencies": [...], "psd": {...}, "num_channels": int}``
        """
        fs = sample_rate or self.default_sample_rate
        data = self._ensure_2d(data)

        if channels is not None:
            data = data[channels, :]
            channel_ids = channels
        else:
            channel_ids = list(range(data.shape[0]))

        num_samples = data.shape[1]
        seg_len = nperseg or min(256, num_samples)

        psd_dict: Dict[str, List[float]] = {}
        freqs_out: Optional[np.ndarray] = None

        for i, ch_id in enumerate(channel_ids):
            f, pxx = welch(data[i], fs=fs, nperseg=seg_len)
            if freqs_out is None:
                freqs_out = f
            psd_dict[str(ch_id)] = pxx.tolist()

        return {
            "frequencies": freqs_out.tolist() if freqs_out is not None else [],
            "psd": psd_dict,
            "num_channels": len(channel_ids),
            "sample_rate": fs,
            "nperseg": seg_len,
        }

    # ------------------------------------------------------------------
    # Spectrogram
    # ------------------------------------------------------------------

    def compute_spectrogram(
        self,
        data: np.ndarray,
        sample_rate: Optional[float] = None,
        window_size: int = 256,
        overlap: Optional[int] = None,
        channel: int = 0,
    ) -> Dict[str, Any]:
        """Compute a time-frequency spectrogram for a single channel.

        Parameters
        ----------
        data : ndarray
            Shape ``(channels, samples)`` or ``(samples,)``.
        sample_rate : float, optional
        window_size : int
            STFT window length in samples.
        overlap : int, optional
            Number of overlapping samples.  Defaults to ``window_size // 2``.
        channel : int
            Which channel to compute the spectrogram for.

        Returns
        -------
        dict
            ``{"frequencies": [...], "times": [...], "power": [[...], ...]}``
        """
        fs = sample_rate or self.default_sample_rate
        data = self._ensure_2d(data)

        if channel >= data.shape[0]:
            channel = 0

        signal = data[channel]
        noverlap = overlap if overlap is not None else window_size // 2

        f, t, Sxx = scipy_spectrogram(
            signal,
            fs=fs,
            nperseg=window_size,
            noverlap=noverlap,
        )

        # Convert power to dB for readability
        Sxx_db = 10.0 * np.log10(Sxx + 1e-20)

        return {
            "frequencies": f.tolist(),
            "times": t.tolist(),
            "power_db": Sxx_db.tolist(),
            "channel": channel,
            "sample_rate": fs,
            "window_size": window_size,
            "overlap": noverlap,
        }

    # ------------------------------------------------------------------
    # Convenience: dominant frequency
    # ------------------------------------------------------------------

    def dominant_frequency(
        self,
        data: np.ndarray,
        sample_rate: Optional[float] = None,
        channels: Optional[List[int]] = None,
    ) -> Dict[str, float]:
        """Return the frequency with maximum magnitude for each channel."""
        fft_result = self.compute_fft(data, sample_rate=sample_rate, channels=channels)
        freqs = np.array(fft_result["frequencies"])
        dom: Dict[str, float] = {}
        for ch_str, mags in fft_result["magnitudes"].items():
            mag_arr = np.array(mags)
            # Skip DC component (index 0)
            idx = int(np.argmax(mag_arr[1:])) + 1
            dom[ch_str] = float(freqs[idx])
        return dom

    # ------------------------------------------------------------------
    # Internal
    # ------------------------------------------------------------------

    @staticmethod
    def _ensure_2d(data: np.ndarray) -> np.ndarray:
        if data.ndim == 1:
            return data.reshape(1, -1)
        return data
