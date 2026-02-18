"""
Updated the PG_clk_div on 2022/08/19
"""

import itertools
import struct
import sys
import time
import tables as tb
import os
import ok

import numpy as np
# import zarr

# import numba
from PyQt5.QtCore import QThread, pyqtSignal, QTimer, QObject, QRunnable, pyqtSlot, QThreadPool
usleep = lambda x: time.sleep(x / 1000000.0)

class CNEAv5(QObject):
    def __init__(self, bitstreamFile):
        QObject.__init__(self)
        self.xem = None
        self.reg = None
        self.devInfo = None
        self.bitstreamFile = bitstreamFile
        self.device_name = None
        self.exp_mode = None
        self.data_path = None
        self.ads8688_data = np.zeros((30000, 4))
        self.pixel_data = np.zeros((51200, 4))
        self.data_pipe = bytearray(1*65536*16*4)
        self.data_temp_pixel = None
        self.data_temp_ads8688 = None
        self.data_raw = None

        self.fhandle_pcb = None
        self.fhandle_ic = None
        self.fhandle_data_raw = None
        

        self.recording_start = 0
        self.recording_timeout = 0
        self.recording_enable = False
        self.DDR3_enable = True

    def recording_enable_config(self, status):
        self.recording_enable = status
        if status:
            print('You are keeping saving data.')
        else:
            print('Attention! You are not saving data!')


    def initialize_device(self):

        # Setup okFP
        self.xem = ok.okCFrontPanel()
        num_devices = self.xem.GetDeviceCount()
        print("Found {0} device(s)".format(num_devices))

        self.reg = ok.okTRegisterEntry()
        self.regs = ok.okTRegisterEntries(64)
        self.inreg = ok.okTRegisterEntries(64)
        if num_devices != 0:
            for i in range(num_devices):
                print('Device[{0}] Model: {1}'.format(i, self.xem.GetDeviceListModel(i)))
                print('Device[{0}] Serial: {1}'.format(i, self.xem.GetDeviceListSerial(i)))
        else:
            print("No devices found. Exiting...")
            return False

        if self.xem.OpenBySerial("") is not self.xem.NoError:
            print("A device could not be opened.  Is one connected?")
            return False

        # Get some general information about the device.
        self.devInfo = ok.okTDeviceInfo()
        if self.xem.GetDeviceInfo(self.devInfo) is not self.xem.NoError:
            print("Unable to retrieve device information.")
            return False

        print("         Product: " + self.devInfo.productName)
        print("Firmware version: %d.%d" % (self.devInfo.deviceMajorVersion, self.devInfo.deviceMinorVersion))
        print("   Serial Number: %s" % self.devInfo.serialNumber)
        print("       Device ID: %s" % self.devInfo.deviceID)

        # Download the configuration file.
        print("Configuring bitstream upload with file:\n\t" + self.bitstreamFile)
        if self.xem.ConfigureFPGA(self.bitstreamFile) is not self.xem.NoError:
            print("FPGA configuration failed.")
            return False
        else:
            print("Uploaded bitstream to FPGA...")

        # Check for FrontPanel support in the FPGA configuration.
        if self.xem.IsFrontPanelEnabled() is False:
            print("FrontPanel support is not available.")
            return False

        print("FrontPanel support is available.")

        return True

    # ================= WIRE/PIPE + CFG =========================

    def send_wire(self, bank, value, mask=0xFFFFFFFF):
        self.xem.SetWireInValue(bank, value, mask)
        self.xem.UpdateWireIns()

    def get_wire(self, bank, mask):
        self.xem.UpdateWireOuts()
        return self.xem.GetWireOutValue(bank) & mask

    # @numba.jit
    def pipe_out(self, bank, data_length):
        data_pipe = bytearray([0]*4*data_length)
        self.xem.ReadFromPipeOut(bank, data_pipe)
        data = np.reshape(data_pipe, (-1,4))  
        return np.copy(data)

    def pipe_out_block(self, bank, data_length):
        # data_pipe = bytearray(data_length*4)
        self.xem.ReadFromBlockPipeOut(bank, 1024, self.data_pipe)
        return np.frombuffer(self.data_pipe, dtype='uint16')

    def pipe_in_block(self, bank, block_size, data):
        self.xem.WriteToBlockPipeIn(bank, block_size, data) # block_size = 512

    def write_reg(self, address, data):
        self.reg.address = address
        self.xem.WriteRegister(self.reg.address, data)

    def read_reg(self, address):
        self.reg.address = address
        return self.xem.ReadRegister(self.reg.address)

    def send_reset(self):
        print("Resetting...")
        self.send_wire(0x00, 0, 0x01)
        time.sleep(0.001)
        self.send_wire(0x00, 1, 0x01)
        time.sleep(0.001)

    def device_close(self):
        self.xem.Close()

    def VDD_SHDN(self, SHDN=True):
        print("Shutdown " + str(SHDN))
        if SHDN:
            self.send_wire(0x00, 0 << 7, 0x00000080)
        else:
            self.send_wire(0x00, 1 << 7, 0x00000080)

    def AO_SHDN(self, SHDN=True):
        if SHDN:
            self.send_wire(0x00, 0 << 8, 0x00000100)
        else:
            self.send_wire(0x00, 1 << 8, 0x00000100)

    def counts_from_freq(self, mclock, freq):
        counts = round(mclock / freq)
        print("Clock rate:    ", mclock)
        print("Sample rate:   ", freq)
        print("Sample counts: ", counts)
        return counts, 1 / mclock

    # ================= DAC =========================
    def pcb_config_write(self, reset, ref_data, temp_data, lpf_data):
        if reset:
            self.send_wire(0x05, 0, 0x80000000)  # Reset
            usleep(100)
        self.send_wire(0x05, 1 << 31, 0x80000000)  # NOT Reset
        usleep(100)
        self.send_wire(0x05, (ref_data << 6) | temp_data, 0x0000FFFF)  # Data
        self.send_wire(0x09, (lpf_data << 12), 0xFFFFF000)  # Data

        self.xem.ActivateTriggerIn(0x40, 0x01)
        #print("Trigger1 happens")

    def dac_vs_write_ac_pulse(self, mode, vs, amp_dc, amp_peak, freq, duty):
        vs_pcb = [0,1,2,3]
        vs = vs_pcb[vs-1] # calculate mapped channel
        counts, period = self.counts_from_freq(200e6, freq)
        duty_count = round(counts * duty)

        if mode == "ac":
            mode = 1
            amp_dc_shift = amp_dc - amp_peak
            counts = counts >> 6
        elif mode == "pulse":
            mode = 2
            amp_dc_shift = amp_dc

        amp_dc_code = round(65535 * amp_dc_shift / 5)
        amp_peak_code = round(65535 * amp_peak / 5)
        # print(amp_dc_code, amp_peak_code, counts, duty_count)

        #self.send_wire(0x01, 0x00, 0x00FFFFFF)
        self.send_wire(0x0F, 0x01 << 24, 0x07000000)  # DAC select, select VS, change from 0x01 to 0x0F on 07/18/2024
        self.send_wire(0x01, mode << 27, 0x18000000)  # [PULSE, AC]
        self.send_wire(0x01, vs << 29, 0xE0000000)  # Vs Channel Select
        self.send_wire(0x02, (amp_peak_code << 16) | amp_dc_code, 0xFFFFFFFF)  # amplitudes (Peak[15:0], DC[15:0])
        self.send_wire(0x03, counts, 0xFFFFFFFF)  # Period
        self.send_wire(0x04, duty_count, 0xFFFFFFFF)  # Duty Cycle

        self.xem.ActivateTriggerIn(0x40, 0x00)

    # @pyqtSlot(int, int, int)
    def dac_write(self, dac_sel, address, data):
        # dac_sel: VS=0x01, VIN_CI=0x02, VREF_ADC=0x04, VBIAS=0x08,TEMP&TEST_IN=0x10 
        data = min(data, 47186) # Make sure data < 3.6V
        self.send_wire(0x0F, dac_sel << 24, 0x1F000000)  # select DAC, changed to ep0FwireIn[28:24]
        self.send_wire(0x01, 0 << 27, 0x18000000)  # ensure mode = DC
        self.send_wire(0x01, ((address << 16) | (data & 0xFFFF)), 0xFFFFFF)
        self.xem.ActivateTriggerIn(0x40, 0x00)


    def dac_init(self):
        # VS, V_CI, VREF_ADC, VBIAS,  REF&TEMP&TEST_IN
        for dac_sel in [0x01, 0x02, 0x04, 0x08, 0x10]:
            self.dac_write(dac_sel, 0x05, 0x000A)  # reset
            self.dac_write(dac_sel, 0x03, 0x0200)  # 0x0200 config (disable SDO)
            #self.dac_write(dac_sel, 0x02, 0xFF00)  # sync
            self.dac_write(dac_sel, 0x04, 0x000F)  # gain
            #self.dac_write(dac_sel, 0x03, 0x010F)  # power down all channels
        # # VREF DAC
        # self.dac_write(0x02, 0x05, 0x000A)  # reset
        # #self.dac_write(0x02, 0x03, 0x0200)  # config (disable SDO)0x0200
        # # self.dac_write(0x02, 0x02, 0xFF00)  # sync might be (0x01, 0xC2, 0xFF00)
        # self.dac_write(0x02, 0x04, 0x00FF)  # gain


    def en_Array_Config(self, enable=False):
        self.send_wire(0x00, enable << 1, 0x02)

    def en_PG_Config(self, enable=False):
        self.send_wire(0x00, enable << 2, 0x04)

    def config_reset(self, reset=True):
        if reset:
            self.send_wire(0x00, 0 << 3, 0x08)
            time.sleep(0.001)
        self.send_wire(0x00, 1 << 3, 0x08)
        time.sleep(0.001)

    # def pixel_sel_write(self, pixel_sel):
    #     for d in range(31, -1, -1):  # from 31 to 0
    #         self.send_wire(0x07, int(pixel_sel[d]), 0xFFFFFFFF)
    #         self.xem.ActivateTriggerIn(0x40, 0x03)
    #         self.xem.UpdateTriggerOuts()
    #         while self.xem.IsTriggered(0x60, 0x1) is False:
    #             print("waiting for trigger 0...")
    #             self.xem.UpdateTriggerOuts()

    def pixel_sel_write_all(self):
        self.send_wire(0x07, 1 << 13, 0x00002000)  # Enable WRITE
        for col in range(64):  # from 0 to 63
            self.send_wire(0x07, col << 6, 0x00000FC0)
            usleep(100)
            for row in range(64):
                self.send_wire(0x07, row, 0x0000003F)
                usleep(100)
        self.send_wire(0x07, 0 << 13, 0x00002000)  #
        print('pixel_sel_write_all is excuted.')

            # self.xem.ActivateTriggerIn(0x40, 0x03)
            # self.xem.UpdateTriggerOuts()
            # while self.xem.IsTriggered(0x60, 0x1) is False:
            #     print("waiting for trigger 0...")
            #     self.xem.UpdateTriggerOuts()

    def pixel_sel_write_single(self, pixel_number):
        row = int(pixel_number/64)
        col = int(pixel_number%64)
        self.send_wire(0x07, col << 6, 0x00000FC0)
        self.send_wire(0x07, row, 0x0000003F)
        # self.send_wire(0x07, 1 << 13, 0x00002000)  # Enable WRITE
        # usleep(100)
        # self.send_wire(0x07, 0 << 13, 0x00002000)  #

    def pixel_sel_write_multiple(self, pixel_list):
        for index in range(len(pixel_list)):
            pixel_number = pixel_list[index]
            row = int(pixel_number/64)
            col = int(pixel_number%64)
            self.send_wire(0x07, col << 6, 0x00000FC0)
            self.send_wire(0x07, row, 0x0000003F)
            usleep(100)
            self.send_wire(0x07, 1 << 13, 0x00002000)  # Enable WRITE
            usleep(100)
            self.send_wire(0x07, 0 << 13, 0x00002000)  #
            usleep(100)

        print('pixel_sel_write_multiple is excuted.')


    def config_data_write(self, config_data_LSB, config_data_MSB):
        self.send_wire(0x07, 0 << 13, 0x00002000)  # Disable WRITE

        self.send_wire(0x00, 1 << 4, 0x00000010) # write all, not used, 09/12/2024
        self.send_wire(0x08, config_data_MSB, 0xFFFFFFFF)
        self.send_wire(0x09, config_data_LSB, 0x0000003F)

        self.send_wire(0x07, 0 << 12, 0x00001000)  # 
        self.send_wire(0x07, 1 << 12, 0x00001000)  # triger the shift register
        time.sleep(0.01)
        self.send_wire(0x07, 0 << 12, 0x00001000)  #

        # self.send_wire(0x07, 1 << 13, 0x00002000)  # Enable WRITE
        # # time.sleep(0.01)
        # self.send_wire(0x07, 0 << 13, 0x00002000)  #

        # self.xem.ActivateTriggerIn(0x40, 0x04)
        # usleep(10000)
        # self.xem.UpdateTriggerOuts()
        # commented on 07/17/2024
        # while self.xem.IsTriggered(0x60, 0x02) is False: # was 0x01
        #     print("waiting for trigger 1...")
        #     self.xem.UpdateTriggerOuts()

    def spi_Latch(self, write_all=False):
        self.send_wire(0x00, write_all << 4, 0x00000010)
        self.xem.ActivateTriggerIn(0x40, 0x05)
        #print("Trigger5 happens")
        self.xem.UpdateTriggerOuts()
        while self.xem.IsTriggered(0x60, 0x04) is False: # was 0x02
            print("waiting for trigger 2...")
            self.xem.UpdateTriggerOuts()


    def IC_Data_Start(self, data_en=False, data_pulse_en=False, data_clk_div=100, channel=0):
        self.send_wire(0x0C, data_clk_div, 0xFFFF)
        if channel > 0:
            self.send_wire(0x0C, channel << 16, 0xFF0000) # change 'channel*2-1 <<8' to 'channel <<16'
        self.send_wire(0x00, ((0 << 5) | (0 << 6)), 0x0060) # added on 01/23/21
        time.sleep(0.001)
        self.send_wire(0x00, ((data_en << 5) | (data_pulse_en << 6)), 0x0060)

    # def PG_RS_EN(self, nPG_CLK_RS=False, PG_RS=True, nPG_READ=True):
    #     self.send_wire(0x0B, ((nPG_READ << 18) | (PG_RS << 17) | (nPG_CLK_RS << 16)), 0x00070000)
    # ================= ADC =========================


    # ================= MISC =========================
    def write_sr(self, adc_sr_b, led_sr_b):
        self.send_wire(0x01, (adc_sr_b << 8) | (led_sr_b), 0x0FFFF)
        usleep(10)
        self.xem.ActivateTriggerIn(0x40, 0x0)
        #print("Trigger0 happens")

    def stim_clk_init(self, clk1_div, clk2_div, clk3_div, pg_clk_div):
        clk_div = clk3_div << 20 | clk2_div << 10 | clk1_div
        self.send_wire(0x0A, clk_div, 0x3FFFFFFF)
        self.send_wire(0x0B, pg_clk_div << 8, 0x0000FF00)
        print('Clock division set.')

    # ================ MISC ADC =======================
    def ad8688_trigger(self):
        self.send_wire(0x0C, 0<<9, 0x0000_0200)
        usleep(100)
        self.send_wire(0x0C, 1<<9, 0x0000_0200)
        usleep(100)
        self.send_wire(0x0C, 0<<9, 0x0000_0200)

    def ad8688_write_prog_reg(self, address, data):
        self.send_wire(0x06, (((address << 9 | (0x01 << 8) | data) << 16) & 0xFFFF0000), 0xFFFFFFFF)
        usleep(100)
        # self.xem.ActivateTriggerIn(0x40, 0x2)
        self.ad8688_trigger()
        print("Trigger2 happens")
        print(bin(self.get_wire(0x24, 0xFFFFFFFF)))
        usleep(100)

    def ads8688_write_comd_reg(self, address, data):
        self.send_wire(0x06, (address << 16 | data), 0xFFFFFFFF)
        usleep(100)
        self.ad8688_trigger()
        # self.xem.ActivateTriggerIn(0x40, 0x2)
        #print("Trigger2 happens")
        usleep(100)

    def ads8688_init(self):
        self.ads8688_write_comd_reg(0x8500, 0x00)
        self.ad8688_write_prog_reg(0x01, 0xFF) # AUTO SEQ
        self.ad8688_write_prog_reg(0x02, 0x00) # CH PWDWN
        self.ad8688_write_prog_reg(0x03, 0x00) # FEATURE SEL --> SDO = [DATA | CH | DEVICE | RANGE]
        for i in range(8):
            self.ad8688_write_prog_reg(i + 0x5, 0b00000001)

    def data_stream_init(self):
        # self.send_wire(0x10, 0x0008_0000, 0x0008_0000)  # 0x000n_0000, ep10wireIn[19] bypass R_CLK,
        self.send_wire(0x10, 0x0001_0000, 0x0007_0000)  # 0x000n_0000, ep10wireIn[18:16] sets the testpoints,
        self.send_wire(0x06, 0x00000000, 0xFFFFFFFF)  # set ADS8688 as auto scan mode

        if self.recording_enable:
            self.data_path = 'D:/DATA/CNEAv5/' + time.strftime("%Y_%m_%d") + '/' + self.device_name + '_' + time.strftime("%H_%M_%S") + '/' + self.exp_mode + '/'
            isdir = os.path.isdir(self.data_path)
            if not isdir:
                os.makedirs(self.data_path)

            self.fhandle_pcb = tb.open_file(self.data_path + time.strftime("%Y_%m_%d- ") + time.strftime("%H_%M_%S_") + 'pcb.h5', "a")
            self.data_temp_ads8688 = self.fhandle_pcb.create_earray(self.fhandle_pcb.root, "data", tb.UInt8Atom(), shape=(0, 8))
            self.fhandle_ic = tb.open_file(self.data_path + time.strftime("%Y_%m_%d- ") + time.strftime("%H_%M_%S_") + 'IC.h5', "a")
            self.data_temp_pixel = self.fhandle_ic.create_earray(self.fhandle_ic.root, "data", tb.UInt16Atom(), shape=(0, 4096))
            ################# H5 implementation #################
            self.fhandle_data_raw = tb.open_file(self.data_path + time.strftime("%Y_%m_%d- ") + time.strftime("%H_%M_%S_") + 'Data_Raw.h5', "a")
            self.data_raw = self.fhandle_data_raw.create_earray(self.fhandle_data_raw.root, "data", tb.UInt16Atom(), shape=(0, 2))
            ################# ZARR implementation #################
            self.fhandle_data_raw = zarr.open(self.data_path + time.strftime("%Y_%m_%d- ") + time.strftime("%H_%M_%S_") + 'Data_Raw.zarr', mode='w-')
            # Signals group : chunk size is 1 channel and 512 samples
            #self.data_raw = self.fhandle_data_raw.zeros('raw', shape=(4096, 0), chunks = (1, 512), dtype='uint16') # type: ignore
            self.data_raw = self.fhandle_data_raw.zeros('raw', shape=(65536*16*4), chunks = (65536*16*2), dtype='uint16') # type: ignore


    def data_stream_close(self):
        try:
            self.send_wire(0x00, 0x00000000, 0x00010000)  # ep00wireIn[16] is start_conv
            self.fhandle_pcb.close()
            self.fhandle_ic.close()
            self.fhandle_data_raw.close()
        except:
            pass

    def adc_ic_control(self, L_Cb = 1, Enable=1, T_CNV = 5, T_Wait = 5, Fs_Div = 50, CLK_Div = 4):
        self.send_wire(0x0F, (CLK_Div << 24) | (Fs_Div << 16) | (T_Wait << 9) | (T_CNV << 2) | (Enable << 1)| L_Cb, 0xFFFFFFFF)

    def data_preprocess_pcb(self,data_temp):
        data_temp = np.fliplr(np.reshape(data_temp,(-1,2)))
        # data_temp = np.reshape(data_temp, (-1, 4096))
        data_temp = np.reshape(data_temp, (-1, 64)) # reshape the data to 64-col
        data_temp = data_temp[1::2, -9:-5] + data_temp[0::2, -9:-5] # extract the last four data points
        data_temp = (4096*data_temp[::, -1] + 256*data_temp[::, -2] + 16*data_temp[::, -3] + data_temp[::, -4])* 0.078125*1e-3 # /51200.0
        return np.reshape(data_temp, (-1, 8))
    

    def data_stream_pcb(self):
        # pass
        self.ads8688_data = self.pipe_out(0xA0, 16384)
        pcb_adc = self.get_wire(0x24, 0x0000_FFFF)
        print(pcb_adc)
        if self.recording_enable:
            self.data_temp_ads8688.append(self.ads8688_data)
        self.xem.UpdateTriggerOuts()

    def data_stream_ic_ddr3(self,data_length):

        for i in range(60):
            time.sleep(0.01)
            start_time= time.perf_counter()
            datain = self.pipe_out_block(0xA2, int(data_length))  # pipeout from DDR3, data_length,length =65536*speed_factor
            print(time.perf_counter()-start_time)
            print('i is: ' +str(i))
        # data_temp = np.reshape(datain, (-1, 2)) # covert 4 x 8-bit to 2 x 8-bit
        # data_temp_pcb = (data_temp[::, 1] >> 4) # get the 4-bit data from PCB-ADC
        # data_temp = (data_temp[::, 0] + 256 * (data_temp[::, 1]%16)) # first 8 LSBs + 4 MSBs
        # data_temp = np.fliplr(np.reshape(data_temp,(-1,2)))
        # self.pixel_data = np.reshape(data_temp, (-1, 4096))
        # self.ads8688_data = self.data_preprocess_pcb(data_temp_pcb)
        if self.recording_enable:
            # self.data_temp_ads8688.append(self.ads8688_data)
            # self.data_temp_pixel.append(self.pixel_data)
            #self.data_raw.append(data_temp)
            self.data_raw.append(datain)
  