"""
Multi-format data export module.

Supports exporting HDF5 neural recordings to:
- **CSV** (with optional channel subset)
- **MAT** (MATLAB .mat v5 format via ``scipy.io``)
- **NWB** (Neurodata Without Borders -- basic HDF5-based structure)

Each exporter reads from an existing HDF5 recording produced by
:class:`HDF5Writer` and writes to the requested output path.
"""

from __future__ import annotations

import logging
import os
import time
from typing import Any, Callable, Dict, List, Optional

import h5py
import numpy as np

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Progress callback type
# ---------------------------------------------------------------------------

ProgressCallback = Optional[Callable[[float], None]]


class DataExporter:
    """Export neural recordings from HDF5 to CSV, MAT, or NWB.

    Parameters
    ----------
    num_channels : int
        Number of electrode channels (default 4096).
    samples_per_frame : int
        Samples per frame / batch (default 512).
    """

    def __init__(
        self,
        num_channels: int = 4096,
        samples_per_frame: int = 512,
    ) -> None:
        self.num_channels = num_channels
        self.samples_per_frame = samples_per_frame

    # ------------------------------------------------------------------
    # CSV export
    # ------------------------------------------------------------------

    def export_csv(
        self,
        recording_path: str,
        output_path: str,
        channels: Optional[List[int]] = None,
        chunk_size: int = 100_000,
        progress_callback: ProgressCallback = None,
    ) -> Dict[str, Any]:
        """Export recording to CSV.

        Parameters
        ----------
        recording_path : str
            Path to the source HDF5 file.
        output_path : str
            Destination ``.csv`` file path.
        channels : list[int], optional
            Subset of channel indices to include.  If ``None``, all
            channels are exported.
        chunk_size : int
            Number of raw samples to read per chunk (to limit memory).
        progress_callback : callable, optional
            Called with a float in [0, 1] to report progress.

        Returns
        -------
        dict
            Summary including ``output_path``, ``rows_written``, etc.
        """
        self._validate_source(recording_path)
        os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)

        start = time.time()
        rows_written = 0

        with h5py.File(recording_path, "r") as hf:
            ds = hf["raw_data"]
            total_samples = ds.shape[0]

            # Determine actual number of frames
            frame_size = self.num_channels  # one sample per channel per frame
            total_frames = total_samples // frame_size if frame_size > 0 else 0

            with open(output_path, "w") as out:
                # Header
                if channels is not None:
                    header = ",".join(f"ch_{c}" for c in channels)
                else:
                    header = ",".join(f"ch_{c}" for c in range(self.num_channels))
                out.write(header + "\n")

                offset = 0
                while offset < total_samples:
                    end = min(offset + chunk_size, total_samples)
                    raw_chunk = ds[offset:end, 0]

                    # Reshape into (frames, channels)
                    usable = (len(raw_chunk) // self.num_channels) * self.num_channels
                    if usable == 0:
                        offset = end
                        continue

                    frame_data = raw_chunk[:usable].reshape(-1, self.num_channels)

                    if channels is not None:
                        frame_data = frame_data[:, channels]

                    for row in frame_data:
                        out.write(",".join(str(int(v)) for v in row) + "\n")
                        rows_written += 1

                    offset = end
                    if progress_callback and total_samples > 0:
                        progress_callback(min(offset / total_samples, 1.0))

        elapsed = time.time() - start
        result = {
            "output_path": os.path.abspath(output_path),
            "format": "csv",
            "rows_written": rows_written,
            "channels_exported": len(channels) if channels else self.num_channels,
            "elapsed_seconds": round(elapsed, 2),
        }
        logger.info("CSV export complete: %s", result)
        return result

    # ------------------------------------------------------------------
    # MATLAB .mat export
    # ------------------------------------------------------------------

    def export_mat(
        self,
        recording_path: str,
        output_path: str,
        channels: Optional[List[int]] = None,
        progress_callback: ProgressCallback = None,
    ) -> Dict[str, Any]:
        """Export recording to MATLAB ``.mat`` format (v5).

        Uses ``scipy.io.savemat``.  For very large files this loads
        the data in one pass (limited by available memory).
        """
        from scipy.io import savemat

        self._validate_source(recording_path)
        os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)

        start = time.time()

        with h5py.File(recording_path, "r") as hf:
            ds = hf["raw_data"]
            raw = ds[:, 0]

            # Read metadata
            metadata_dict: Dict[str, Any] = {}
            if "metadata" in hf:
                for k, v in hf["metadata"].attrs.items():
                    metadata_dict[k] = _safe_value(v)

        if progress_callback:
            progress_callback(0.3)

        # Reshape into (frames, channels)
        usable = (len(raw) // self.num_channels) * self.num_channels
        if usable > 0:
            data_matrix = raw[:usable].reshape(-1, self.num_channels)
        else:
            data_matrix = raw.reshape(1, -1)

        if channels is not None:
            data_matrix = data_matrix[:, channels]
            channel_ids = np.array(channels)
        else:
            channel_ids = np.arange(self.num_channels)

        if progress_callback:
            progress_callback(0.6)

        mat_dict = {
            "data": data_matrix,
            "channel_ids": channel_ids,
            "sample_rate": metadata_dict.get("sample_rate", 10000.0),
            "device_name": metadata_dict.get("device_name", "CNEAv5"),
            "num_channels": data_matrix.shape[1],
            "num_frames": data_matrix.shape[0],
        }

        savemat(output_path, mat_dict, do_compression=True)

        if progress_callback:
            progress_callback(1.0)

        elapsed = time.time() - start
        result = {
            "output_path": os.path.abspath(output_path),
            "format": "mat",
            "num_frames": int(data_matrix.shape[0]),
            "channels_exported": int(data_matrix.shape[1]),
            "elapsed_seconds": round(elapsed, 2),
        }
        logger.info("MAT export complete: %s", result)
        return result

    # ------------------------------------------------------------------
    # NWB export (basic HDF5-based structure)
    # ------------------------------------------------------------------

    def export_nwb(
        self,
        recording_path: str,
        output_path: str,
        channels: Optional[List[int]] = None,
        session_description: str = "Neural recording from CNEA v5",
        identifier: Optional[str] = None,
        progress_callback: ProgressCallback = None,
    ) -> Dict[str, Any]:
        """Export recording to a basic NWB-like HDF5 structure.

        This creates an HDF5 file following the Neurodata Without Borders
        convention (simplified):

        ::

            /
              general/
                session_description (attr)
                identifier (attr)
                device/
                  name (attr)
              acquisition/
                ElectricalSeries/
                  data  (float64, shape=(frames, channels))
                  timestamps (float64, shape=(frames,))
                  electrodes (int, channel indices)
              file_create_date (attr)
              nwb_version (attr)

        This is a *basic* NWB structure intended for interoperability.
        Full NWB compliance requires the ``pynwb`` library.
        """
        self._validate_source(recording_path)
        os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)

        start = time.time()

        # Read source data
        with h5py.File(recording_path, "r") as hf:
            ds = hf["raw_data"]
            raw = ds[:, 0]
            src_meta: Dict[str, Any] = {}
            if "metadata" in hf:
                for k, v in hf["metadata"].attrs.items():
                    src_meta[k] = _safe_value(v)

        if progress_callback:
            progress_callback(0.3)

        sample_rate = float(src_meta.get("sample_rate", 10000.0))
        device_name = str(src_meta.get("device_name", "CNEAv5"))

        # Reshape
        usable = (len(raw) // self.num_channels) * self.num_channels
        if usable > 0:
            data_matrix = raw[:usable].reshape(-1, self.num_channels).astype(np.float64)
        else:
            data_matrix = raw.reshape(1, -1).astype(np.float64)

        if channels is not None:
            data_matrix = data_matrix[:, channels]
            electrode_ids = np.array(channels, dtype=np.int64)
        else:
            electrode_ids = np.arange(self.num_channels, dtype=np.int64)

        num_frames = data_matrix.shape[0]
        timestamps = np.arange(num_frames, dtype=np.float64) / sample_rate

        if progress_callback:
            progress_callback(0.6)

        # Build NWB file
        nwb_id = identifier or f"cnea5_{int(time.time())}"

        with h5py.File(output_path, "w") as nwb:
            # Root attributes
            nwb.attrs["nwb_version"] = "2.0.0"
            nwb.attrs["file_create_date"] = time.strftime("%Y-%m-%dT%H:%M:%S")
            nwb.attrs["identifier"] = nwb_id

            # /general
            general = nwb.create_group("general")
            general.attrs["session_description"] = session_description

            device_grp = general.create_group("devices")
            dev = device_grp.create_group(device_name)
            dev.attrs["description"] = f"{device_name} electrode array"
            dev.attrs["manufacturer"] = "CNEA Lab"

            # /acquisition/ElectricalSeries
            acq = nwb.create_group("acquisition")
            es = acq.create_group("ElectricalSeries")
            es.create_dataset(
                "data",
                data=data_matrix,
                compression="gzip",
                compression_opts=4,
            )
            es.create_dataset("timestamps", data=timestamps)
            es.create_dataset("electrodes", data=electrode_ids)
            es.attrs["description"] = "Raw extracellular electrophysiology data"
            es.attrs["unit"] = "arbitrary"
            es.attrs["sample_rate"] = sample_rate

        if progress_callback:
            progress_callback(1.0)

        elapsed = time.time() - start
        result = {
            "output_path": os.path.abspath(output_path),
            "format": "nwb",
            "num_frames": num_frames,
            "channels_exported": int(data_matrix.shape[1]),
            "identifier": nwb_id,
            "elapsed_seconds": round(elapsed, 2),
        }
        logger.info("NWB export complete: %s", result)
        return result

    # ------------------------------------------------------------------
    # Validation
    # ------------------------------------------------------------------

    @staticmethod
    def _validate_source(path: str) -> None:
        if not os.path.exists(path):
            raise FileNotFoundError(f"Recording file not found: {path}")
        if not path.endswith((".h5", ".hdf5")):
            raise ValueError(f"Expected an HDF5 file, got: {path}")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _safe_value(val: Any) -> Any:
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
