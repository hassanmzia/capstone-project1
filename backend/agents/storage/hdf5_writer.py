"""
HDF5 file writer module.

Provides chunked, expandable HDF5 storage for raw neural data using
``h5py``.  Mirrors the original PyTables-based saving logic from
``data_process_saving`` in GUI.py, but uses h5py for broader
compatibility.

Directory convention
--------------------
::

    DATA_DIR/YYYY_MM_DD/DeviceName_HH_MM_SS/
        recording.h5
            /raw_data   (UInt16, shape=(N, 1), expandable along axis 0)
            /metadata   (group with HDF5 attributes)

"""

from __future__ import annotations

import logging
import os
import time
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Optional

import h5py
import numpy as np

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

DEFAULT_DATA_DIR = os.getenv("DATA_DIR", "/tmp/cnea_data")
DEFAULT_DEVICE_NAME = "CNEAv5"
DEFAULT_CHUNK_SIZE = (4096 * 512, 1)  # ~2M rows per chunk
DEFAULT_DTYPE = np.uint16


class HDF5Writer:
    """Manages a single HDF5 recording file with expandable datasets.

    Usage::

        writer = HDF5Writer()
        writer.create_file("/data/recording.h5", metadata={...})
        for chunk in stream:
            writer.append_data(chunk)
        writer.close()
    """

    def __init__(
        self,
        data_dir: str = DEFAULT_DATA_DIR,
        device_name: str = DEFAULT_DEVICE_NAME,
    ) -> None:
        self.data_dir = data_dir
        self.device_name = device_name

        self._file: Optional[h5py.File] = None
        self._dataset: Optional[h5py.Dataset] = None
        self._file_path: Optional[str] = None
        self._sample_count: int = 0
        self._start_time: Optional[float] = None
        self._is_open: bool = False

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def create_file(
        self,
        path: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> str:
        """Create (or open for append) an HDF5 recording file.

        Parameters
        ----------
        path : str, optional
            Full file path.  If ``None`` a path is generated following
            the convention ``DATA_DIR/YYYY_MM_DD/Device_HH_MM_SS/recording.h5``.
        metadata : dict, optional
            Arbitrary key-value metadata to store as HDF5 attributes.

        Returns
        -------
        str
            The absolute path to the created file.
        """
        if self._is_open:
            self.close()

        if path is None:
            path = self._generate_path()

        # Ensure parent directory exists
        parent = os.path.dirname(path)
        os.makedirs(parent, exist_ok=True)

        self._file = h5py.File(path, "a")
        self._file_path = os.path.abspath(path)

        # Create or open the raw_data dataset (expandable along axis 0)
        if "raw_data" in self._file:
            self._dataset = self._file["raw_data"]
            self._sample_count = self._dataset.shape[0]
        else:
            self._dataset = self._file.create_dataset(
                "raw_data",
                shape=(0, 1),
                maxshape=(None, 1),
                dtype=DEFAULT_DTYPE,
                chunks=(min(DEFAULT_CHUNK_SIZE[0], 65536), 1),
                compression="gzip",
                compression_opts=4,
            )
            self._sample_count = 0

        # Store metadata
        meta_group = self._file.require_group("metadata")
        if metadata:
            for key, value in metadata.items():
                try:
                    meta_group.attrs[key] = value
                except TypeError:
                    meta_group.attrs[key] = str(value)

        # Always record creation time and device
        meta_group.attrs["device_name"] = self.device_name
        meta_group.attrs["created_at"] = datetime.now().isoformat()
        meta_group.attrs.setdefault("sample_rate", 10000.0)

        self._start_time = time.time()
        self._is_open = True

        logger.info("HDF5 file created: %s", self._file_path)
        return self._file_path

    def append_data(self, data: np.ndarray) -> int:
        """Append a data chunk to the recording file.

        Parameters
        ----------
        data : ndarray
            Raw data to append.  Will be reshaped to ``(-1, 1)`` and
            cast to ``uint16`` to match the original format.

        Returns
        -------
        int
            Updated total sample count.
        """
        if not self._is_open or self._dataset is None:
            raise RuntimeError("No HDF5 file is open.  Call create_file() first.")

        flat = data.reshape(-1, 1).astype(DEFAULT_DTYPE)
        current_rows = self._dataset.shape[0]
        new_rows = flat.shape[0]
        self._dataset.resize(current_rows + new_rows, axis=0)
        self._dataset[current_rows:] = flat
        self._sample_count = current_rows + new_rows

        return self._sample_count

    def flush(self) -> None:
        """Flush buffered writes to disk."""
        if self._file is not None:
            self._file.flush()

    def close(self) -> None:
        """Flush and close the current file."""
        if self._file is not None:
            try:
                # Update metadata with final counts
                if "metadata" in self._file:
                    meta = self._file["metadata"]
                    meta.attrs["total_samples"] = self._sample_count
                    if self._start_time is not None:
                        meta.attrs["duration_seconds"] = time.time() - self._start_time
                    meta.attrs["closed_at"] = datetime.now().isoformat()
                self._file.flush()
                self._file.close()
            except Exception as exc:
                logger.error("Error closing HDF5 file: %s", exc)
            finally:
                self._file = None
                self._dataset = None
                self._is_open = False
                logger.info(
                    "HDF5 file closed: %s (%d samples)",
                    self._file_path, self._sample_count,
                )

    def get_file_info(self) -> Dict[str, Any]:
        """Return current file information."""
        info: Dict[str, Any] = {
            "file_path": self._file_path,
            "is_open": self._is_open,
            "sample_count": self._sample_count,
        }
        if self._file_path and os.path.exists(self._file_path):
            info["file_size_bytes"] = os.path.getsize(self._file_path)
            info["file_size_mb"] = round(os.path.getsize(self._file_path) / (1024 * 1024), 2)

        if self._start_time is not None and self._is_open:
            info["duration_seconds"] = round(time.time() - self._start_time, 2)

        if self._is_open and self._file is not None and "metadata" in self._file:
            meta = self._file["metadata"]
            sr = meta.attrs.get("sample_rate", 10000.0)
            if self._sample_count > 0:
                info["recording_duration_seconds"] = round(
                    self._sample_count / sr, 2,
                )

        return info

    @property
    def is_open(self) -> bool:
        return self._is_open

    @property
    def file_path(self) -> Optional[str]:
        return self._file_path

    # ------------------------------------------------------------------
    # Static utility: read existing file
    # ------------------------------------------------------------------

    @staticmethod
    def read_file(path: str) -> Dict[str, Any]:
        """Read an existing HDF5 recording and return a summary dict."""
        if not os.path.exists(path):
            raise FileNotFoundError(f"File not found: {path}")

        info: Dict[str, Any] = {
            "file_path": os.path.abspath(path),
            "file_size_bytes": os.path.getsize(path),
            "file_size_mb": round(os.path.getsize(path) / (1024 * 1024), 2),
        }

        with h5py.File(path, "r") as f:
            if "raw_data" in f:
                ds = f["raw_data"]
                info["sample_count"] = ds.shape[0]
                info["dtype"] = str(ds.dtype)
            if "metadata" in f:
                meta = f["metadata"]
                info["metadata"] = {k: _convert_attr(v) for k, v in meta.attrs.items()}

        return info

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _generate_path(self) -> str:
        """Generate a path following the legacy convention."""
        now = datetime.now()
        date_dir = now.strftime("%Y_%m_%d")
        time_dir = f"{self.device_name}_{now.strftime('%H_%M_%S')}"
        filename = now.strftime("%Y_%m_%d-%H_%M_%S_Data_Raw.h5")
        return os.path.join(self.data_dir, date_dir, time_dir, filename)


def _convert_attr(val: Any) -> Any:
    """Convert HDF5 attribute values to JSON-friendly types."""
    if isinstance(val, (np.integer,)):
        return int(val)
    if isinstance(val, (np.floating,)):
        return float(val)
    if isinstance(val, np.ndarray):
        return val.tolist()
    if isinstance(val, bytes):
        return val.decode("utf-8", errors="replace")
    return val
