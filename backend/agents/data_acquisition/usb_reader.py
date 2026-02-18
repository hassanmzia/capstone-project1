"""
USB reader thread for continuous FPGA data acquisition.

Runs in a background thread, reads data from the FPGA DDR3 FIFO,
writes to the ring buffer, and publishes raw chunks to a Redis stream.
"""

import asyncio
import json
import logging
import threading
import time
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Optional

import numpy as np

if TYPE_CHECKING:
    import redis.asyncio as aioredis
    from .fpga_interface import SimulatedFPGA, RealFPGA
    from .ring_buffer import RingBuffer

logger = logging.getLogger(__name__)

# Default data length in 16-bit words per iteration
#   16 chunks * 65536 words = 1 048 576 words = 2 MB per read
DEFAULT_SPEED_FACTOR = 16
DEFAULT_DATA_LENGTH = DEFAULT_SPEED_FACTOR * 65536

# Redis channel for raw neural data
REDIS_RAW_DATA_CHANNEL = "neural:raw_data"


@dataclass
class USBReaderStats:
    """Live statistics for the USB read loop."""
    bytes_read: int = 0
    packets_received: int = 0
    packets_dropped: int = 0
    buffer_overruns: int = 0
    last_sequence_number: int = -1
    sequence_errors: int = 0
    throughput_bps: float = 0.0
    started_at: float = 0.0
    last_read_at: float = 0.0

    def to_dict(self) -> dict:
        elapsed = max(time.time() - self.started_at, 1e-6) if self.started_at else 0
        return {
            "bytes_read": self.bytes_read,
            "packets_received": self.packets_received,
            "packets_dropped": self.packets_dropped,
            "buffer_overruns": self.buffer_overruns,
            "sequence_errors": self.sequence_errors,
            "throughput_mbps": round(self.throughput_bps / 1e6, 3),
            "avg_throughput_mbps": round(
                (self.bytes_read * 8 / elapsed / 1e6) if elapsed else 0, 3
            ),
            "uptime_s": round(elapsed, 2),
        }


class USBReader:
    """Continuously reads data from the FPGA and pushes it downstream.

    Parameters
    ----------
    fpga
        An FPGA backend (``RealFPGA`` or ``SimulatedFPGA``).
    ring_buffer
        A ``RingBuffer`` instance to write data into.
    redis
        An async Redis client for publishing raw data chunks.
    data_length
        Number of 16-bit words to read per iteration.
    read_interval_s
        Minimum interval between consecutive reads (seconds).
        The simulated backend uses this as a pacing delay; the real
        hardware will block on the USB read itself.
    """

    def __init__(
        self,
        fpga,
        ring_buffer: "RingBuffer",
        redis: Optional["aioredis.Redis"] = None,
        data_length: int = DEFAULT_DATA_LENGTH,
        read_interval_s: float = 0.05,
    ) -> None:
        self._fpga = fpga
        self._ring = ring_buffer
        self._redis = redis
        self._data_length = data_length
        self._read_interval = read_interval_s

        self._thread: Optional[threading.Thread] = None
        self._stop_event = threading.Event()
        self._stats = USBReaderStats()

        # For Redis publishing from the reader thread we keep a
        # reference to the running asyncio event loop so we can
        # schedule coroutines safely.
        self._loop: Optional[asyncio.AbstractEventLoop] = None

        # Throughput tracking
        self._tp_bytes = 0
        self._tp_time = 0.0

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    def start(self, loop: Optional[asyncio.AbstractEventLoop] = None) -> None:
        """Start the reader thread."""
        if self._thread is not None and self._thread.is_alive():
            logger.warning("USBReader already running")
            return

        self._stop_event.clear()
        self._stats = USBReaderStats(started_at=time.time())
        self._tp_bytes = 0
        self._tp_time = time.time()
        self._loop = loop

        self._thread = threading.Thread(
            target=self._read_loop,
            name="usb-reader",
            daemon=True,
        )
        self._thread.start()
        logger.info("USBReader thread started (data_length=%d words)", self._data_length)

    def stop(self, timeout: float = 5.0) -> None:
        """Signal the reader thread to stop and wait for it to finish."""
        if self._thread is None:
            return

        self._stop_event.set()
        self._thread.join(timeout=timeout)
        if self._thread.is_alive():
            logger.warning("USBReader thread did not exit within %.1f s", timeout)
        else:
            logger.info("USBReader thread stopped")
        self._thread = None

    @property
    def is_running(self) -> bool:
        return self._thread is not None and self._thread.is_alive()

    def get_stats(self) -> dict:
        return self._stats.to_dict()

    # ------------------------------------------------------------------
    # Read loop (runs in dedicated thread)
    # ------------------------------------------------------------------

    def _read_loop(self) -> None:
        """Continuously read from the FPGA and push to ring buffer + Redis."""
        iteration = 0
        logger.info("USB read loop entered")

        while not self._stop_event.is_set():
            t0 = time.perf_counter()

            try:
                # Read from FPGA DDR3 pipe-out
                data: np.ndarray = self._fpga.data_stream_ic_ddr3(
                    self._data_length, iteration,
                )

                raw_bytes = data.tobytes()
                n_bytes = len(raw_bytes)

                # Write to ring buffer
                written = self._ring.write(raw_bytes)
                if written < n_bytes:
                    self._stats.buffer_overruns += 1

                # Update stats
                self._stats.bytes_read += n_bytes
                self._stats.packets_received += 1
                self._stats.last_read_at = time.time()

                # Sequence validation (simple monotonic check)
                expected_seq = self._stats.last_sequence_number + 1
                if iteration != expected_seq and expected_seq > 0:
                    self._stats.sequence_errors += 1
                self._stats.last_sequence_number = iteration

                # Throughput calculation (sliding 1-second window)
                self._tp_bytes += n_bytes
                now = time.time()
                dt = now - self._tp_time
                if dt >= 1.0:
                    self._stats.throughput_bps = self._tp_bytes * 8 / dt
                    self._tp_bytes = 0
                    self._tp_time = now

                # Publish to Redis (fire-and-forget from reader thread)
                if self._redis is not None and self._loop is not None:
                    self._schedule_redis_publish(raw_bytes, iteration)

                iteration += 1

            except Exception as exc:
                logger.error("USBReader error on iteration %d: %s", iteration, exc)
                self._stats.packets_dropped += 1
                time.sleep(0.1)

            # Pace the loop (important for simulated backend)
            elapsed = time.perf_counter() - t0
            sleep_time = self._read_interval - elapsed
            if sleep_time > 0:
                # Use the stop event as a waitable sleep so we can
                # exit promptly when stop() is called.
                self._stop_event.wait(timeout=sleep_time)

        logger.info("USB read loop exited after %d iterations", iteration)

    # ------------------------------------------------------------------
    # Redis publishing helper
    # ------------------------------------------------------------------

    def _schedule_redis_publish(self, raw_bytes: bytes, seq: int) -> None:
        """Schedule an async Redis publish from the reader thread."""
        try:
            # Only publish a summary / metadata + first N bytes to
            # avoid saturating Redis at full bandwidth.  Downstream
            # consumers read from the ring buffer for full data.
            header = json.dumps({
                "seq": seq,
                "size": len(raw_bytes),
                "ts": time.time(),
            })
            # Publish header only (consumers pull full frames from ring buffer)
            coro = self._redis.publish(REDIS_RAW_DATA_CHANNEL, header)
            asyncio.run_coroutine_threadsafe(coro, self._loop)
        except Exception as exc:
            # Non-fatal – the ring buffer is the primary data path
            logger.debug("Redis publish failed: %s", exc)
