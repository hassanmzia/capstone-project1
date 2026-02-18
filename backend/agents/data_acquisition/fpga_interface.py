"""
FPGA interface wrapper around the legacy CNEAv5 driver.

When the Opal Kelly ``ok`` library is available and an XEM device is
detected, the wrapper delegates to real hardware.  Otherwise it falls
back transparently to ``SimulatedFPGA`` which generates realistic
neural waveform data (sine waves + noise + random spikes).
"""

import logging
import os
import struct
import time
from dataclasses import dataclass
from typing import Optional

import numpy as np

logger = logging.getLogger(__name__)

# Master clock of the Opal Kelly XEM board
MASTER_CLOCK_HZ = 200_000_000

# Default bitstream path
DEFAULT_BITSTREAM = os.getenv(
    "FPGA_BITSTREAM",
    os.path.join(os.path.dirname(__file__), "..", "..", "..", "legacy", "CNEAv5_v01_TOP.bit"),
)


@dataclass
class DeviceInfo:
    """Snapshot of FPGA/ASIC identification."""
    product_name: str = "Unknown"
    serial_number: str = "N/A"
    device_id: str = "N/A"
    firmware_major: int = 0
    firmware_minor: int = 0
    is_simulated: bool = True

    def to_dict(self) -> dict:
        return {
            "product_name": self.product_name,
            "serial_number": self.serial_number,
            "device_id": self.device_id,
            "firmware_version": f"{self.firmware_major}.{self.firmware_minor}",
            "is_simulated": self.is_simulated,
        }


# ---------------------------------------------------------------------------
# Simulated FPGA
# ---------------------------------------------------------------------------

class SimulatedFPGA:
    """Drop-in replacement that generates synthetic neural data.

    The simulated device produces 4096-channel x 512-sample frames as
    uint16 values in the range 0-4095 (12-bit ADC), mimicking:
      - baseline offset at ~1.15 V (code ~2360)
      - 10 uV-scale broadband noise
      - occasional randomly placed spikes (negative deflections)
      - a subtle 60 Hz line-noise component
    """

    CHANNELS = 4096
    SAMPLES_PER_FRAME = 512
    SAMPLE_RATE_HZ = 10_000.0
    ADC_BITS = 12
    ADC_FULL_SCALE = (1 << 12) - 1
    BASELINE_CODE = 2360  # ~1.15 V on 5 V scale

    def __init__(self) -> None:
        self._rng = np.random.default_rng(seed=42)
        self._phase = 0.0
        self._frame_index = 0
        self._is_streaming = False
        logger.info("SimulatedFPGA initialised (4096 channels, 10 kHz)")

    # ---- lifecycle ----------------------------------------------------

    def initialize_device(self) -> bool:
        logger.info("[SIM] Device initialised")
        return True

    def send_reset(self) -> None:
        logger.debug("[SIM] Reset")
        self._phase = 0.0
        self._frame_index = 0

    def data_stream_init(self) -> None:
        self._is_streaming = True
        logger.info("[SIM] Data stream started")

    def data_stream_close(self) -> None:
        self._is_streaming = False
        logger.info("[SIM] Data stream stopped")

    def device_close(self) -> None:
        self._is_streaming = False
        logger.info("[SIM] Device closed")

    # ---- DDR3 read emulation ------------------------------------------

    def data_stream_ic_ddr3(self, data_length: int, index: int) -> np.ndarray:
        """Return a flat uint16 array simulating a DDR3 pipe-out block.

        ``data_length`` is measured in 16-bit words (matching the real
        ``pipe_out_block`` convention).
        """
        n_samples = self.SAMPLES_PER_FRAME
        n_channels = self.CHANNELS

        # Time vector for this block
        dt = 1.0 / self.SAMPLE_RATE_HZ
        t = self._phase + np.arange(n_samples) * dt

        # Broadband Gaussian noise  (std ~ 5 ADC codes ≈ ~6 uV)
        noise = self._rng.normal(0, 5, size=(n_channels, n_samples))

        # 60 Hz line noise (amplitude ~3 codes)
        line_noise = 3.0 * np.sin(2.0 * np.pi * 60.0 * t)

        # Build signal matrix
        signal = self.BASELINE_CODE + noise + line_noise[np.newaxis, :]

        # Inject random spikes on ~0.5% of channels per frame
        n_spiking = max(1, int(n_channels * 0.005))
        spike_channels = self._rng.choice(n_channels, size=n_spiking, replace=False)
        for ch in spike_channels:
            spike_pos = self._rng.integers(20, n_samples - 20)
            # Negative-going spike template (Gaussian shape)
            spike_width = self._rng.integers(5, 15)
            spike_amp = self._rng.uniform(30, 120)
            x = np.arange(n_samples) - spike_pos
            spike_template = -spike_amp * np.exp(-0.5 * (x / spike_width) ** 2)
            signal[ch, :] += spike_template

        # Clip to ADC range and cast
        signal = np.clip(signal, 0, self.ADC_FULL_SCALE).astype(np.uint16)

        # Advance phase
        self._phase += n_samples * dt
        self._frame_index += 1

        # Flatten to match real pipe_out_block output ordering:
        # the hardware interleaves data as pairs (see legacy
        # processing that does ``np.fliplr(np.reshape(data, (-1, 2)))``).
        # We replicate that encoding here.
        flat = signal.T.ravel()  # column-major interleave
        # Interleave with a filler upper nibble (PCB ADC bits = 0)
        return flat[:data_length] if len(flat) >= data_length else np.pad(flat, (0, data_length - len(flat)))

    # ---- wire stubs ---------------------------------------------------

    def send_wire(self, bank: int, value: int, mask: int = 0xFFFFFFFF) -> None:
        pass

    def get_wire(self, bank: int, mask: int) -> int:
        return 0

    def dac_init(self) -> None:
        pass

    def dac_write(self, dac_sel: int, address: int, data: int) -> None:
        pass

    def dac_vs_write_ac_pulse(self, mode: str, vs: int, amp_dc: float,
                              amp_peak: float, freq: float, duty: float) -> None:
        pass

    def pcb_config_write(self, reset: bool, ref_data: int, temp_data: int,
                         lpf_data: int, mux_data: int) -> None:
        pass

    def stim_clk_init(self, clk1_div: int, clk2_div: int, clk3_div: int,
                      pg_clk_div: int) -> None:
        pass

    def ads8688_init(self) -> None:
        pass

    def pixel_sel_write_all(self) -> None:
        pass

    def pixel_sel_write_single(self, pixel_number: int) -> None:
        pass

    def pixel_sel_write_multiple(self, pixel_list: list) -> None:
        pass

    def config_data_write(self, config_data_LSB: int, config_data_MSB: int) -> None:
        pass

    def en_Array_Config(self, enable: bool = False) -> None:
        pass

    def config_reset(self, reset: bool = True) -> None:
        pass

    def pipe_out_block(self, bank: int, data_length: int) -> np.ndarray:
        return self.data_stream_ic_ddr3(data_length, 0)

    def pipe_in_block(self, bank: int, block_size: int, data: bytes) -> None:
        pass

    def write_reg(self, address: int, data: int) -> None:
        pass

    def read_reg(self, address: int) -> int:
        return 0

    def ad8688_trigger(self) -> None:
        pass

    def get_device_info(self) -> DeviceInfo:
        return DeviceInfo(
            product_name="Simulated XEM7310",
            serial_number="SIM-0001",
            device_id="SIM",
            firmware_major=1,
            firmware_minor=0,
            is_simulated=True,
        )

    def IC_Data_Start(self, data_en: bool = False, data_pulse_en: bool = False,
                      data_clk_div: int = 100, channel: int = 0) -> None:
        pass

    def adc_ic_control(self, L_Cb: int = 1, Enable: int = 1, T_CNV: int = 5,
                       T_Wait: int = 5, Fs_Div: int = 50, CLK_Div: int = 4) -> None:
        pass

    def VDD_SHDN(self, SHDN: bool = True) -> None:
        pass

    def AO_SHDN(self, SHDN: bool = True) -> None:
        pass

    def spi_Latch(self, write_all: bool = False) -> None:
        pass


# ---------------------------------------------------------------------------
# Real FPGA wrapper (delegates to ``ok`` library)
# ---------------------------------------------------------------------------

class RealFPGA:
    """Thin wrapper around the Opal Kelly FrontPanel API.

    This class mirrors the legacy ``CNEAv5`` interface but is decoupled
    from PyQt5 and multiprocessing queues.
    """

    def __init__(self, bitstream_file: str = DEFAULT_BITSTREAM) -> None:
        import ok as _ok  # Opal Kelly FrontPanel SDK
        self._ok = _ok

        self.xem = None
        self.devInfo = None
        self._bitstream_file = bitstream_file
        self._info: Optional[DeviceInfo] = None

    # ---- lifecycle ----------------------------------------------------

    def initialize_device(self) -> bool:
        self.xem = self._ok.okCFrontPanel()
        num_devices = self.xem.GetDeviceCount()
        logger.info("Found %d Opal Kelly device(s)", num_devices)

        if num_devices == 0:
            logger.error("No Opal Kelly devices found")
            return False

        for i in range(num_devices):
            logger.info(
                "  Device[%d] Model=%s Serial=%s",
                i,
                self.xem.GetDeviceListModel(i),
                self.xem.GetDeviceListSerial(i),
            )

        if self.xem.OpenBySerial("") != self.xem.NoError:
            logger.error("Could not open Opal Kelly device")
            return False

        self.devInfo = self._ok.okTDeviceInfo()
        if self.xem.GetDeviceInfo(self.devInfo) != self.xem.NoError:
            logger.error("Unable to retrieve device information")
            return False

        self._info = DeviceInfo(
            product_name=self.devInfo.productName,
            serial_number=self.devInfo.serialNumber,
            device_id=self.devInfo.deviceID,
            firmware_major=self.devInfo.deviceMajorVersion,
            firmware_minor=self.devInfo.deviceMinorVersion,
            is_simulated=False,
        )
        logger.info(
            "Opened %s  FW %d.%d  SN %s",
            self._info.product_name,
            self._info.firmware_major,
            self._info.firmware_minor,
            self._info.serial_number,
        )

        if self.xem.ConfigureFPGA(self._bitstream_file) != self.xem.NoError:
            logger.error("FPGA configuration (bitstream upload) failed")
            return False
        logger.info("Bitstream uploaded: %s", self._bitstream_file)

        if not self.xem.IsFrontPanelEnabled():
            logger.error("FrontPanel support not available in bitstream")
            return False

        logger.info("FrontPanel support enabled")
        return True

    def send_reset(self) -> None:
        self.send_wire(0x00, 0, 0x01)
        time.sleep(0.001)
        self.send_wire(0x00, 1, 0x01)
        time.sleep(0.001)

    def device_close(self) -> None:
        if self.xem:
            self.xem.Close()

    # ---- wire / pipe primitives ---------------------------------------

    def send_wire(self, bank: int, value: int, mask: int = 0xFFFFFFFF) -> None:
        self.xem.SetWireInValue(bank, value, mask)
        self.xem.UpdateWireIns()

    def get_wire(self, bank: int, mask: int) -> int:
        self.xem.UpdateWireOuts()
        return self.xem.GetWireOutValue(bank) & mask

    def pipe_out_block(self, bank: int, data_length: int) -> np.ndarray:
        data_pipe = bytearray(data_length * 4)
        self.xem.ReadFromBlockPipeOut(bank, 1024, data_pipe)
        return np.frombuffer(data_pipe, dtype="uint16")

    def pipe_in_block(self, bank: int, block_size: int, data: bytes) -> None:
        self.xem.WriteToBlockPipeIn(bank, block_size, data)

    def write_reg(self, address: int, data: int) -> None:
        self.xem.WriteRegister(address, data)

    def read_reg(self, address: int) -> int:
        return self.xem.ReadRegister(address)

    # ---- DAC ----------------------------------------------------------

    def dac_init(self) -> None:
        for dac_sel in [0x01, 0x02, 0x04, 0x08, 0x10]:
            self.dac_write(dac_sel, 0x05, 0x000A)
            self.dac_write(dac_sel, 0x03, 0x0200)
            self.dac_write(dac_sel, 0x04, 0x000F)

    def dac_write(self, dac_sel: int, address: int, data: int) -> None:
        data = min(data, 47186)
        self.send_wire(0x0F, dac_sel << 24, 0x1F000000)
        self.send_wire(0x01, 0 << 27, 0x18000000)
        self.send_wire(0x01, ((address << 16) | (data & 0xFFFF)), 0xFFFFFF)
        self.xem.ActivateTriggerIn(0x40, 0x00)

    def dac_vs_write_ac_pulse(self, mode: str, vs: int, amp_dc: float,
                              amp_peak: float, freq: float, duty: float) -> None:
        vs_pcb = [0, 1, 2, 3]
        vs_mapped = vs_pcb[vs - 1]
        counts, period = self._counts_from_freq(MASTER_CLOCK_HZ, freq)
        duty_count = round(counts * duty)

        if mode == "ac":
            mode_code = 1
            amp_dc_shift = amp_dc - amp_peak
            counts = counts >> 6
        elif mode == "pulse":
            mode_code = 2
            amp_dc_shift = amp_dc
        else:
            mode_code = 0
            amp_dc_shift = amp_dc

        amp_dc_code = round(65535 * amp_dc_shift / 5)
        amp_peak_code = round(65535 * amp_peak / 5)

        self.send_wire(0x0F, 0x01 << 24, 0x07000000)
        self.send_wire(0x01, mode_code << 27, 0x18000000)
        self.send_wire(0x01, vs_mapped << 29, 0xE0000000)
        self.send_wire(0x02, (amp_peak_code << 16) | amp_dc_code, 0xFFFFFFFF)
        self.send_wire(0x03, counts, 0xFFFFFFFF)
        self.send_wire(0x04, duty_count, 0xFFFFFFFF)
        self.xem.ActivateTriggerIn(0x40, 0x00)

    def pcb_config_write(self, reset: bool, ref_data: int, temp_data: int,
                         lpf_data: int, mux_data: int) -> None:
        if reset:
            self.send_wire(0x05, 0, 0x80000000)
            time.sleep(0.0001)
        self.send_wire(0x05, 1 << 31, 0x80000000)
        time.sleep(0.0001)
        self.send_wire(0x05, (ref_data << 6) | temp_data, 0x0000FFFF)
        self.send_wire(0x09, lpf_data << 12, 0xFFFFF000)
        self.send_wire(0x0C, mux_data, 0x0000_01FF)
        self.xem.ActivateTriggerIn(0x40, 0x01)

    def stim_clk_init(self, clk1_div: int, clk2_div: int, clk3_div: int,
                      pg_clk_div: int) -> None:
        clk_div = clk3_div << 20 | clk2_div << 10 | clk1_div
        self.send_wire(0x0A, clk_div, 0x3FFFFFFF)
        self.send_wire(0x0B, pg_clk_div << 8, 0x0000FF00)

    # ---- ADS8688 external ADC -----------------------------------------

    def ads8688_init(self) -> None:
        self._ads8688_write_cmd(0x8500, 0x00)
        self._ad8688_write_prog(0x01, 0xFF)
        self._ad8688_write_prog(0x02, 0x00)
        self._ad8688_write_prog(0x03, 0x00)
        for i in range(8):
            self._ad8688_write_prog(i + 0x5, 0b00000001)

    def ad8688_trigger(self) -> None:
        self.send_wire(0x0C, 0 << 9, 0x0000_0200)
        time.sleep(0.0001)
        self.send_wire(0x0C, 1 << 9, 0x0000_0200)
        time.sleep(0.0001)
        self.send_wire(0x0C, 0 << 9, 0x0000_0200)

    def _ad8688_write_prog(self, address: int, data: int) -> None:
        self.send_wire(0x06, (((address << 9 | (0x01 << 8) | data) << 16) & 0xFFFF0000), 0xFFFFFFFF)
        time.sleep(0.0001)
        self.ad8688_trigger()
        time.sleep(0.0001)

    def _ads8688_write_cmd(self, address: int, data: int) -> None:
        self.send_wire(0x06, (address << 16 | data), 0xFFFFFFFF)
        time.sleep(0.0001)
        self.ad8688_trigger()
        time.sleep(0.0001)

    # ---- pixel / config -----------------------------------------------

    def pixel_sel_write_all(self) -> None:
        self.send_wire(0x07, 1 << 13, 0x00002000)
        for col in range(64):
            self.send_wire(0x07, col << 6, 0x00000FC0)
            time.sleep(0.0001)
            for row in range(64):
                self.send_wire(0x07, row, 0x0000003F)
                time.sleep(0.0001)
        self.send_wire(0x07, 0 << 13, 0x00002000)

    def pixel_sel_write_single(self, pixel_number: int) -> None:
        row = pixel_number // 64
        col = pixel_number % 64
        self.send_wire(0x07, col << 6, 0x00000FC0)
        self.send_wire(0x07, row, 0x0000003F)

    def pixel_sel_write_multiple(self, pixel_list: list) -> None:
        for pix in pixel_list:
            row = pix // 64
            col = pix % 64
            self.send_wire(0x07, col << 6, 0x00000FC0)
            self.send_wire(0x07, row, 0x0000003F)
            time.sleep(0.0001)
            self.send_wire(0x07, 1 << 13, 0x00002000)
            time.sleep(0.0001)
            self.send_wire(0x07, 0 << 13, 0x00002000)
            time.sleep(0.0001)

    def config_data_write(self, config_data_LSB: int, config_data_MSB: int) -> None:
        self.send_wire(0x07, 0 << 13, 0x00002000)
        self.send_wire(0x00, 1 << 4, 0x00000010)
        self.send_wire(0x08, config_data_MSB, 0xFFFFFFFF)
        self.send_wire(0x09, config_data_LSB, 0x0000003F)
        self.send_wire(0x07, 0 << 12, 0x00001000)
        self.send_wire(0x07, 1 << 12, 0x00001000)
        time.sleep(0.01)
        self.send_wire(0x07, 0 << 12, 0x00001000)

    def en_Array_Config(self, enable: bool = False) -> None:
        self.send_wire(0x00, int(enable) << 1, 0x02)

    def config_reset(self, reset: bool = True) -> None:
        if reset:
            self.send_wire(0x00, 0 << 3, 0x08)
            time.sleep(0.001)
        self.send_wire(0x00, 1 << 3, 0x08)
        time.sleep(0.001)

    def IC_Data_Start(self, data_en: bool = False, data_pulse_en: bool = False,
                      data_clk_div: int = 100, channel: int = 0) -> None:
        self.send_wire(0x0C, data_clk_div, 0xFFFF)
        if channel > 0:
            self.send_wire(0x0C, channel << 16, 0xFF0000)
        self.send_wire(0x00, 0, 0x0060)
        time.sleep(0.001)
        self.send_wire(0x00, ((int(data_en) << 5) | (int(data_pulse_en) << 6)), 0x0060)

    def adc_ic_control(self, L_Cb: int = 1, Enable: int = 1, T_CNV: int = 5,
                       T_Wait: int = 5, Fs_Div: int = 50, CLK_Div: int = 4) -> None:
        val = (CLK_Div << 24) | (Fs_Div << 16) | (T_Wait << 9) | (T_CNV << 2) | (Enable << 1) | L_Cb
        self.send_wire(0x0F, val, 0xFFFFFFFF)

    def VDD_SHDN(self, SHDN: bool = True) -> None:
        bit = 0 if SHDN else 1
        self.send_wire(0x00, bit << 7, 0x00000080)

    def AO_SHDN(self, SHDN: bool = True) -> None:
        bit = 0 if SHDN else 1
        self.send_wire(0x00, bit << 8, 0x00000100)

    def spi_Latch(self, write_all: bool = False) -> None:
        self.send_wire(0x00, int(write_all) << 4, 0x00000010)
        self.xem.ActivateTriggerIn(0x40, 0x05)
        self.xem.UpdateTriggerOuts()
        while not self.xem.IsTriggered(0x60, 0x04):
            self.xem.UpdateTriggerOuts()

    # ---- data streaming -----------------------------------------------

    def data_stream_init(self) -> None:
        self.send_wire(0x10, 0x0001_0000, 0x0007_0000)
        self.send_wire(0x06, 0x00000000, 0xFFFFFFFF)

    def data_stream_ic_ddr3(self, data_length: int, index: int) -> np.ndarray:
        return self.pipe_out_block(0xA2, data_length)

    def data_stream_close(self) -> None:
        try:
            self.send_wire(0x00, 0x00000000, 0x00010000)
        except Exception:
            pass

    def get_device_info(self) -> DeviceInfo:
        if self._info:
            return self._info
        return DeviceInfo()

    # ---- helpers -------------------------------------------------------

    @staticmethod
    def _counts_from_freq(mclock: float, freq: float):
        counts = round(mclock / freq)
        return counts, 1.0 / mclock


# ---------------------------------------------------------------------------
# Factory
# ---------------------------------------------------------------------------

class FPGAInterface:
    """Factory / facade that returns the appropriate backend.

    Usage::

        fpga = FPGAInterface.create()
        fpga.initialize_device()
    """

    @staticmethod
    def create(bitstream: str = DEFAULT_BITSTREAM):
        """Return a ``RealFPGA`` if the Opal Kelly SDK is importable
        and a device is connected, otherwise a ``SimulatedFPGA``.
        """
        try:
            import ok as _ok  # noqa: F401

            probe = _ok.okCFrontPanel()
            if probe.GetDeviceCount() > 0:
                logger.info("Opal Kelly device detected – using RealFPGA")
                return RealFPGA(bitstream)
            else:
                logger.warning("Opal Kelly SDK found but no devices connected – falling back to SimulatedFPGA")
        except ImportError:
            logger.info("Opal Kelly SDK (ok) not installed – using SimulatedFPGA")
        except Exception as exc:
            logger.warning("Error probing for Opal Kelly hardware: %s – using SimulatedFPGA", exc)

        return SimulatedFPGA()
