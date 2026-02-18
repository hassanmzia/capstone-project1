"""Signal Processing Agent package."""

from .agent import SignalProcessingAgent
from .fft_analyzer import FFTAnalyzer
from .filters import SignalFilter
from .noise_reduction import NoiseReducer
from .spike_detector import SpikeDetector, SpikeDetectionResult, SpikeEvent

__all__ = [
    "SignalProcessingAgent",
    "FFTAnalyzer",
    "SignalFilter",
    "NoiseReducer",
    "SpikeDetector",
    "SpikeDetectionResult",
    "SpikeEvent",
]
