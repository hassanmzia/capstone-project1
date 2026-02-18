"""
Thread-safe ring buffer for high-throughput neural data acquisition.

Uses numpy arrays for efficient storage.  Default capacity is 160 MB,
matching the DDR3 buffer on the FPGA carrier board.
"""

import logging
import threading
import time
from dataclasses import dataclass, field
from typing import Optional

import numpy as np

logger = logging.getLogger(__name__)

DEFAULT_BUFFER_SIZE_BYTES = 160 * 1024 * 1024  # 160 MB


@dataclass
class RingBufferStats:
    """Cumulative statistics for the ring buffer."""
    total_bytes_written: int = 0
    total_bytes_read: int = 0
    overflow_count: int = 0
    underflow_count: int = 0
    peak_fill_bytes: int = 0
    created_at: float = field(default_factory=time.time)

    def to_dict(self) -> dict:
        return {
            "total_bytes_written": self.total_bytes_written,
            "total_bytes_read": self.total_bytes_read,
            "overflow_count": self.overflow_count,
            "underflow_count": self.underflow_count,
            "peak_fill_bytes": self.peak_fill_bytes,
            "uptime_s": round(time.time() - self.created_at, 2),
        }


class RingBuffer:
    """Lock-free-style ring buffer backed by a flat numpy uint8 array.

    Parameters
    ----------
    capacity : int
        Total buffer size in bytes (default 160 MB).
    """

    def __init__(self, capacity: int = DEFAULT_BUFFER_SIZE_BYTES) -> None:
        self._capacity = capacity
        self._buf: np.ndarray = np.zeros(capacity, dtype=np.uint8)

        # Atomic-ish indices – protected by a lightweight lock for
        # cross-thread safety when both a reader and writer are active.
        self._write_idx: int = 0
        self._read_idx: int = 0
        self._lock = threading.Lock()

        self._stats = RingBufferStats()

    # ------------------------------------------------------------------
    # Properties
    # ------------------------------------------------------------------

    @property
    def capacity(self) -> int:
        return self._capacity

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def write(self, data: bytes | np.ndarray) -> int:
        """Write *data* into the buffer.

        Returns the number of bytes actually written.  If the buffer is
        full the oldest data is **overwritten** and an overflow is logged.
        """
        if isinstance(data, np.ndarray):
            raw = data.tobytes()
        else:
            raw = bytes(data)

        n = len(raw)
        if n == 0:
            return 0

        arr = np.frombuffer(raw, dtype=np.uint8)

        with self._lock:
            avail = self._capacity - self._fill_level_unlocked()
            if n > avail:
                # Overflow: advance read pointer to make room
                overflow_bytes = n - avail
                self._read_idx = (self._read_idx + overflow_bytes) % self._capacity
                self._stats.overflow_count += 1
                logger.warning(
                    "Ring buffer overflow – dropped %d bytes (total overflows: %d)",
                    overflow_bytes,
                    self._stats.overflow_count,
                )

            # Write – may wrap around
            start = self._write_idx
            end = start + n
            if end <= self._capacity:
                self._buf[start:end] = arr
            else:
                first_chunk = self._capacity - start
                self._buf[start:] = arr[:first_chunk]
                self._buf[: n - first_chunk] = arr[first_chunk:]

            self._write_idx = (self._write_idx + n) % self._capacity
            self._stats.total_bytes_written += n

            fill = self._fill_level_unlocked()
            if fill > self._stats.peak_fill_bytes:
                self._stats.peak_fill_bytes = fill

        return n

    def read(self, size: int) -> Optional[bytes]:
        """Read up to *size* bytes from the buffer.

        Returns ``None`` when the buffer is empty (underflow).
        """
        with self._lock:
            available = self._fill_level_unlocked()
            if available == 0:
                self._stats.underflow_count += 1
                return None

            to_read = min(size, available)
            start = self._read_idx
            end = start + to_read

            if end <= self._capacity:
                out = bytes(self._buf[start:end])
            else:
                first_chunk = self._capacity - start
                out = bytes(self._buf[start:]) + bytes(self._buf[: to_read - first_chunk])

            self._read_idx = (self._read_idx + to_read) % self._capacity
            self._stats.total_bytes_read += to_read

        return out

    def get_fill_level(self) -> int:
        """Return the current number of bytes available for reading."""
        with self._lock:
            return self._fill_level_unlocked()

    def get_fill_fraction(self) -> float:
        """Return fill level as a fraction [0.0, 1.0]."""
        return self.get_fill_level() / self._capacity

    def reset(self) -> None:
        """Clear the buffer and reset statistics."""
        with self._lock:
            self._write_idx = 0
            self._read_idx = 0
            self._buf[:] = 0
            self._stats = RingBufferStats()
        logger.info("Ring buffer reset (capacity=%d bytes)", self._capacity)

    def get_stats(self) -> dict:
        """Return a snapshot of buffer statistics."""
        with self._lock:
            d = self._stats.to_dict()
            d["capacity_bytes"] = self._capacity
            d["fill_bytes"] = self._fill_level_unlocked()
            d["fill_pct"] = round(self._fill_level_unlocked() / self._capacity * 100, 2)
        return d

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _fill_level_unlocked(self) -> int:
        """Must be called while holding ``self._lock``."""
        if self._write_idx >= self._read_idx:
            return self._write_idx - self._read_idx
        return self._capacity - self._read_idx + self._write_idx
