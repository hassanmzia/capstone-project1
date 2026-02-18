from __future__ import unicode_literals
import os.path
import struct

from PyQt5 import QtCore
from multiprocessing import Queue
import sys
import time

import itertools
import string
import numpy as np
import matplotlib.pyplot as plt
import pyqtgraph as pg
import scipy.misc
import random

from CNEAv5 import CNEAv5

def usleep(u):
    for _ in range(u * 33):
        pass

from PyQt5.QtCore import QThread, pyqtSignal, QTimer, QObject, QRunnable, pyqtSlot, QThreadPool

class SerialThread(QObject): #QObject

    ic_data_to_update = pyqtSignal(np.ndarray)
    ic_data_spike_to_update = pyqtSignal(np.ndarray)
    recording_status_update = pyqtSignal(bool)
    # device_dac_write_sig = pyqtSignal(int, int, int)

    pcb_data_to_update = pyqtSignal(np.ndarray)

    finished = pyqtSignal()
    error = pyqtSignal(tuple)
    result = pyqtSignal(object)
    progress_ic = pyqtSignal(np.ndarray)
    progress_ic_spike = pyqtSignal(np.ndarray)
    progress_pcb = pyqtSignal(np.ndarray)

    def __init__(self, ui, bitstreamFile, data_queue, command_queue_save, command_queue_process_ic, command_queue_process_pcb):

        # State variables
        self.state_shutdown = False

        # Setup
        QObject.__init__(self)
        self.device = CNEAv5(bitstreamFile, data_queue)
        self.command_queue_save = command_queue_save
        self.command_queue_process_ic = command_queue_process_ic
        self.command_queue_process_pcb = command_queue_process_pcb

        if not self.device.initialize_device():
            print("Failure to Initialize Device")
            sys.exit()
        else:
            print("FPGA configuration complete, starting FrontPanel interface")
    
        self.device.send_reset()
        self.device.pcb_config_write(1, 0x0000, 0x00, 0xFFFFF, 0x01F) # reset the PCB
        self.device.dac_init()
    
        self.device.send_wire(0x10, 5 << 16, 0x0007_0000) # set the initial testing command 
        self.device.send_wire(0x0B, 0 << 25, 0x0200_0000) # read from single ADC when high, from all adcs when low
        
        self.device.send_wire(0x0D, 0<<6, 0x0000_0040)  # when ep0DwireIn[6]= fifo_ddr3= 1, reading from fifo directly
        self.device.send_wire(0x0C, 0<<9, 0x0000_0200) # cancel the 'trigger'

        self.ocp_status =True
        self.ocp_counter = 0 # initialize the counter
        self.ocp_on = 10
        self.ocp_off = 90
        self.device.stim_clk_init(100, 250, 250, 0)  #configure the division factor of main clock to generate the stimulation CLKs
        # self.device.send_wire(0x00, 0x00008000, 0x00008000) # ep00wireIn[15] is EN_SD (enable spike_detector output)
        self.device.send_wire(0x00, 0x00000000, 0x00010000) # ep00wireIn[16] is start_conv

        self.device.send_wire(0x0C, 0x0000_001F, 0x0000_01FF) #  {MUX_A[3:0], MUX_VS_EN, MUX_CI_EN, MUX_REF_EN, MUX_TEMP_EN, MUX_OUT_EN}

        ######################## make sure the data streaming is ready ####################
        self.device.send_wire(0x0D, 0x00, 0x00000004)  # clear the reset of DDR3
        self.device.send_wire(0x00, 1, 0x01) # clear the reset of FIFO
        self.device.send_wire(0x10, 0x0008_0000, 0x0008_0000)  # 0x000n_0000, ep10wireIn[19] bypass R_CLK,
        time.sleep(0.005)

        time.sleep(0.01)
        self.device.ads8688_init() # Need DDR3 to be running and 'start_conv' being low to configure ads8688
        time.sleep(0.01)
        self.device.send_wire(0x06, 0xA000_0000, 0xFFFFFFFF) # 0x06 is the address for command of ADC8688, enter into auto_scan mode
        self.device.ad8688_trigger()
        time.sleep(0.01)
        self.device.send_wire(0x06, 0x0000_0000, 0xFFFFFFFF) # keeping auto scan mode
        self.device.ad8688_trigger()
        
        # ddr3 writing first and then reading
        self.device.send_wire(0x0D, 0x02, 0x00000002)  # enable DDR3 writing
        time.sleep(0.005)
        self.device.send_wire(0x00, 0x00010000, 0x00010000)  # ep00wireIn[16] is start_conv
        self.device.send_wire(0x0D, 0x01, 0x00000001)  # enable DDR3 reading

        time.sleep(0.1)
        self.device.send_wire(0x10, 0x0000_0000, 0x0008_0000)  # 0x000n_0000, ep10wireIn[19] bypass R_CLK,
        self.device.send_wire(0x0D, 0x04, 0x00000004)  # reset DDR3
        ######################## make sure the data streaming is ready ####################

        self.device.send_wire(0x0D, 0x00, 0x00000004)  # clear the reset of DDR3
        self.device.send_wire(0x00, 1, 0x01) # clear the reset of FIFO
        self.device.send_wire(0x10, 0x0008_0000, 0x0008_0000)  # 0x000n_0000, ep10wireIn[19] bypass R_CLK,
        time.sleep(0.005)

        # ddr3 writing first and then reading
        self.device.send_wire(0x0D, 0x02, 0x00000002)  # enable DDR3 writing
        time.sleep(0.005)
        self.device.send_wire(0x00, 0x00010000, 0x00010000)  # ep00wireIn[16] is start_conv
        self.device.send_wire(0x0D, 0x01, 0x00000001)  # enable DDR3 reading
        # self.device.pipe_out_block(0xA2, int(16*65536))
        time.sleep(1) 
        self.device.send_wire(0x00, 0, 0x01) # reset_b for reset FIFO
        self.device.send_wire(0x00, 0x00000000, 0x00010000)  # ep00wireIn[16] is start_conv
        self.device.send_wire(0x10, 0x0000_0000, 0x0008_0000)  # 0x000n_0000, ep10wireIn[19] bypass R_CLK,
        self.device.send_wire(0x0D, 0x04, 0x00000004)  # reset DDR3
        ######################## make sure the data streaming is ready ####################

        self.runc = True
        self.nADCs = 8
        self.chunk_accum_time_ic = 0
        self.chunk_data_disp_ic = np.zeros((4096, 128))

        self.chunk = 1
        self.speed_factor = 16*self.chunk

        self.accum_time_pcb = 0
        self.data_disp_pcb = np.zeros((40960*2, self.nADCs)) # 16384*2/8 *50
        
        self.sigma = 5
        self.spike_detect_enable = False
        self.recording_enable = False

        self.recording = False
        self.stim_status = False
        self.write_stim = False
        self.bias_update_request = False
        self.bias_command = None
        self.test_command = 1
        self.pixel_to_sweep = np.linspace(0, 4096, 4096, endpoint=False, dtype=int)
        self.pixel_lists = []
        self.pixel_params_lists = []

        self.ic_timer = QTimer(self)
        self.ic_timer.setTimerType(QtCore.Qt.PreciseTimer)
        self.ic_timer.timeout.connect(self.process_ic_events)

        self.freq_scan = [0.5,1,2,4,6,8,16,32,64,128,256,512,1024,2048]
        self.freq_index = 0
        self.freq = self.freq_scan[self.freq_index]
        self.duration = 600 # unit second
        self.iteration_total = int(self.duration/51.2*1000) # every iteration is 51.2ms
        self.iteration_index = 0
        self.scan_init = False
        self.NR_en = False

        self.command ={'spike_detect': False, 'threshold': self.sigma, 'spike_reset': False, 
                       'data_save': False,'file_handle': None, 'data_handle': None,
                       'program_pause': False,'program_exit': False}


    @pyqtSlot(bool)
    def NR_enable(self, enable):
        self.NR_en = enable


    @pyqtSlot()
    def shutdown(self):
        print('Exit GUI')
        self.ic_timer.stop()
        self.device.program_exit = True
        self.device.data_stream_close() # make sure the data in the buffer is saved
        self.device.VDD_SHDN(SHDN=True)
        self.device.pcb_config_write(1, 0x0000, 0x00, 0xFFFFF, 0x000)
        self.device.device_close()
        self.command['program_exit'] = True
        self.command_queue_save.put(self.command)  # send the command to the data processing thread
        self.command_queue_process_ic.put(self.command)  # send the command to the data processing thread
        self.command_queue_process_pcb.put(self.command)
        # self.device.send_wire(0x00, 0, 0x01) #stop FPGA functions
        # time.sleep(0.1)

    def __del__(self):
        pass

    @pyqtSlot(str, str)
    def data_path_create(self, device_name, exp_mode):
        self.device.device_name = str(device_name)
        self.device.exp_mode = str(exp_mode)

    @pyqtSlot(str)
    def duration_set(self, duration):
        self.duration = int(duration)
        self.iteration_total = int(self.duration /(51.2*self.chunk) * 1000)  # every iteration is 51.2ms
        print('iteration_total is: ' + str(self.iteration_total))

    @pyqtSlot(bool, bool, bool, bool)
    def stim_CLKs_control(self, status1, status2, status3, status_all):
        status = (status_all << 27) | (status3 << 26) | (status2 << 25) | (status1 << 24)
        self.device.send_wire(0x00, status, 0x0F000000)

    @pyqtSlot(bool)
    def CI_write(self, status):
        self.device.send_wire(0x0B, status<<31, 0x80000000)
        self.device.send_wire(0x0D, status<<7, 0x00000080) # switching the OUT_MUX
        # if status == True:
        #     for index in range(4096):
        #         self.device.pixel_sel_write_single(index)
        #         time.sleep(0.005)
        #         print('scan pixel: ' + str(index)) 

    @pyqtSlot(bool, str, str)
    def DDR3_control(self, is_enable, on_time, off_time):
        if is_enable == False:
            self.device.send_wire(0x0D, 1<<6, 0x0000_0040)  # when ep0DwireIn[6]= fifo_ddr3= 1, reading from fifo directly
            self.device.DDR3_enable = False
            # self.ocp_status = False
            # self.ocp_counter = 0
            # # self.ocp_timer.stop()
        else:
            self.device.send_wire(0x0D, 0<<6, 0x0000_0040)  # when ep0DwireIn[6]= fifo_ddr3= 1, reading from fifo directly
            self.device.DDR3_enable = True
            # self.ocp_status = True
            # self.ocp_on = float(on_time)
            # self.ocp_off = float(off_time)
            # # self.ocp_timer.start(100)

    @pyqtSlot()
    def OCP_On_OFF(self):
        self.ocp_counter = self.ocp_counter +1
        if (self.ocp_counter > self.ocp_on) and (self.ocp_counter < (self.ocp_on + self.ocp_off)):
            temp_status =  False
        else:
            temp_status = True

        if self.ocp_status != temp_status: # to avoid keeping calling self.device.OCP()
            self.device.OCP(temp_status)
            self.ocp_status = temp_status

        if self.ocp_counter > (self.ocp_on + self.ocp_off):
            self.ocp_counter = 0 # restart another cycle


    @pyqtSlot(bool, float)
    def spike_detect_control(self, detect_status, sigma_value):
        self.command['spike_detect'] = detect_status
        # self.command['threshold'] = sigma_value
        self.sigma = sigma_value
        # self.spike_detect_enable = detect_status
        print(sigma_value)


    def recording_enable_config(self, status):
        self.recording_enable = status
        self.device.recording_enable = status
        self.command['data_save'] = status
        if status:
            print('You are keeping saving data.')
        else:
            print('Attention! You are not saving data!')

    # -------------------- Waveform Functions
    @pyqtSlot(list, float)
    def Waveform2FPGA(self, data_digi, fsample):
        self.device.send_wire(0x0D, 0x00, 0x00000010)  # Start arbitrary waveform
        self.device.send_wire(0x0D, 0x00, 0x00000008)  # disable DAC DC output
        self.device.send_wire(0x11, int(200e6/fsample), 0xFFFFFFFF)  # set the sampling freq of arbitrary waveform
        self.device.send_wire(0x0E, len(data_digi)-1, 0xFFFFFFFF)  # set the length of the data points to be converted
        for i in range(len(data_digi)):
            address = 0x0000 + i
            self.device.write_reg(address, int(data_digi[i]/(2.518*2)*65535)) # int(address*41786/2**17)
        self.device.dac_write(0x04, 0x0A, int(1.7/(2.518*2)*65535)) # the DC value after arbitrary waveform

    @pyqtSlot(bool, str)
    def Waveform_repeat_mode(self, repeat_enabled, sweep_txt):
        self.device.send_wire(0x0D, repeat_enabled << 5, 0x00000020) # send status if infinity sweeps
        time.sleep(0.001)
        self.device.send_wire(0x0D, (int(sweep_txt) - 1) << 12, 0xFFFFF000)
        print('command sent')

    @pyqtSlot()
    def Waveform_trigger(self):
        self.device.send_wire(0x0D, 0x00, 0x00000010)  # Stop arbitrary waveform
        time.sleep(0.001)
        self.device.send_wire(0x0D, 0x10, 0x00000010)  # Start arbitrary waveform

    @pyqtSlot(list)
    def clock_config(self, div):
        # print(div)
        self.device.stim_clk_init(int(div[0]), int(div[1]), int(div[2]), int(div[3]))
        self.chunk = int(div[5])

    @pyqtSlot(np.ndarray)
    def bias_update(self, bias_command_arr):
        print(bias_command_arr)
        # self.device.dac_write(0x01, 0x11, 28629)
        for index in range(len(bias_command_arr)): # it's not stable if only write once. Need to shift from AC to DC
            self.device.dac_write(int(bias_command_arr[index, 0]), int(bias_command_arr[index, 1]), int(bias_command_arr[index, 2]))
            self.device.dac_write(int(bias_command_arr[index, 0]), int(bias_command_arr[index, 1]), int(bias_command_arr[index, 2]))
            # self.device_dac_write_sig.emit(int(
            # 
            # _arr[index, 0]), int(bias_command_arr[index, 1]), int(bias_command_arr[index, 2]))

    @pyqtSlot(int, int, int, int)
    def ref_temp_update(self, ref_param, temp_param, lpf_param, mux_param):
        self.device.pcb_config_write(reset=False, ref_data=ref_param, temp_data=temp_param, lpf_data=lpf_param, mux_data=mux_param)

    @pyqtSlot(list)
    def vs_ac_pulse_update(self, param_list):
        self.device.dac_vs_write_ac_pulse(mode=param_list[0], vs=int(param_list[1]), amp_dc=float(param_list[2]),
                                          amp_peak=float(param_list[3]), freq=float(param_list[4]), duty=float(param_list[5]))
        print(param_list)

    @pyqtSlot(list, list)
    def pixel_selection(self, pixel_lists, pixel_params_lists):
        self.pixel_lists = pixel_lists
        self.pixel_params_lists = pixel_params_lists
        print(pixel_lists)

        for i in range(len(self.pixel_lists)):
            self.device.pixel_sel_write_multiple(self.pixel_lists[i])
        
        # adc selection
        try:
            print(len(self.pixel_lists))
            pixel = self.pixel_lists[i]
            col = pixel[-1] % 64
            strobe_delay = int((63 - col)*2)
            self.device.send_wire(0x0B, strobe_delay << 16, 0x01FF_0000)
        except:
            pass

    @pyqtSlot(list)
    def pixel_config(self, pixel_param):
        self.device.en_Array_Config(True)
        self.device.config_reset(True)
        time.sleep(0.001)

        self.device.config_data_write(pixel_param[0] >> 32, pixel_param[0] & 0xFFFFFFFF)  # Reading the configuration from table
        time.sleep(0.001)
        self.device.pixel_sel_write_all()

        for i in range(len(self.pixel_lists)):
            print(len(self.pixel_lists))
            self.device.config_data_write(self.pixel_params_lists[i] >> 32, self.pixel_params_lists[i] & 0xFFFFFFFF)  # Reading the configuration from table
            time.sleep(0.001)
            self.device.pixel_sel_write_multiple(self.pixel_lists[i])

        print('pixel config runs!')

    @pyqtSlot(np.ndarray)
    def pg_config(self, pulse_param):
        print('PG config runs!')

    def stop(self):
        print("Stopping serial thread")
        self.runc = False

    @pyqtSlot(np.ndarray, list, np.ndarray)
    def system_config(self, bias_param, pixel_param, pulse_param):

        time.sleep(0.1)
        self.device.send_wire(0x00, 0x80000000, 0xE0000000)  # nCONFIG_ALL =1, CONFIG_WRITE =0, CONFIG_LATCH =0
        self.device.send_wire(0x10, 1, 0x0000FFFF)  # set the pixel_sel_clk_div
        self.device.send_wire(0x00, 0 << 12, 0x0000_1000)  # Pixel_sel from python(1<<12) for testing, or from FPGA_SPI(0<<12)

        self.device.send_wire(0x0D, 0x08, 0x00000008)  # enable DAC DC output
        self.device.dac_init()

        self.device.dac_write(0x01, 0x08, int(bias_param[0]))  # vs1
        self.device.send_wire(0x00, 0 << 22, 0x00400000)   # enable Vs1_LP
        self.device.dac_write(0x01, 0x09, int(bias_param[1]))  # vs2
        self.device.send_wire(0x00, 0 << 23, 0x00800000)   # enable Vs2_LP
        self.device.dac_write(0x01, 0x0A, int(bias_param[2]))  # vs3  16384
        self.device.send_wire(0x00, 0 << 20, 0x00100000)   # enable Vs3_LP
        self.device.dac_write(0x01, 0x0B, int(bias_param[3]))  # vs4
        self.device.send_wire(0x00, 1 << 21, 0x00200000)   # enable Vs4_LP

        self.device.dac_write(0x02, 0x08, int(bias_param[4]))  # V_CI1
        self.device.dac_write(0x02, 0x09, int(bias_param[5]))  # V_CI2
        self.device.dac_write(0x02, 0x0A, int(bias_param[6]))  # V_CI3
        self.device.dac_write(0x02, 0x0B, int(bias_param[7]))  # V_CI4

        self.device.dac_write(0x04, 0x08, int(bias_param[8]))  # VREFL
        self.device.dac_write(0x04, 0x09, int(bias_param[9]))  # VREFLH
        self.device.dac_write(0x04, 0x0A, int(bias_param[10]))  # VREFMH
        self.device.dac_write(0x04, 0x0B, int(bias_param[11]))  # VCM

        self.device.dac_write(0x08, 0x08, int(bias_param[12]))  # BP_CI
        self.device.dac_write(0x08, 0x09, int(bias_param[13]))  # BP_OTA 
        self.device.dac_write(0x08, 0x0A, int(bias_param[14]))  # VR
        self.device.dac_write(0x08, 0x0B, int(bias_param[15]))  # NMIR

        self.device.dac_write(0x10, 0x08, int(bias_param[16]))  # REF_DC
        self.device.dac_write(0x10, 0x09, int(bias_param[17]))  # TEMP_SET 
        self.device.dac_write(0x10, 0x0A, int(bias_param[18]))  # TEMP_OS
        self.device.dac_write(0x10, 0x0B, int(bias_param[19]))  # TEST_IN

        # self.device.dac_write(0x01, 0x03, 0x0001)  # power down channels of VSx, 0x0001 =Vs1, 2=Vs2, 4=Vs3, 8=Vs4

        # self.device.dac_vs_write_ac_pulse(mode="ac", vs=4, amp_dc=1.8, amp_peak=0.0010, freq=50, duty=0.5)
        # self.device.dac_vs_write_ac_pulse(mode="pulse", vs=4, amp_dc=1.8, amp_peak=1.8005, freq=1, duty=0.002)
        # self.device.pcb_config_write(reset=True, ref_data=0xBC2F, temp_data=0x58)  # Current measurement from External REF_EL, Can be used for Bio-experiment

        # self.pixel_config(pixel_param)  # Configure pixels ##############


    @pyqtSlot(bool)
    def set_recording(self, enable):
        if enable:

            self.iteration_index = 0
            self.command['program_pause'] = False
            self.device.send_wire(0x0D, 0x00, 0x00000004)  # clear the reset of DDR3
            self.device.send_wire(0x00, 1, 0x01) # clear the reset of FIFO
            self.device.send_wire(0x10, 0x0008_0000, 0x0008_0000)  # 0x000n_0000, ep10wireIn[19] bypass R_CLK,
            time.sleep(0.005)
            
            # self.device.data_stream_init()

            # ddr3 writing first and then reading
            self.device.send_wire(0x0D, 0x02, 0x00000002)  # enable DDR3 writing
            time.sleep(0.005)
            self.device.send_wire(0x00, 0x00010000, 0x00010000)  # ep00wireIn[16] is start_conv
            self.device.send_wire(0x0D, 0x01, 0x00000001)  # enable DDR3 reading

            self.recording = enable
            self.ic_timer.start(2) # start the timer to process the data from IC, 10 ms is not accurate.
            print('data streaming started')

            # self.device.send_wire(0x00, 1<<17, 0x0002_0000) # enable the data from on-PCB ADC
            # self.device.send_wire(0x0D, 0<<6, 0x0000_0040)  # when ep0DwireIn[6]= fifo_ddr3= 1, reading from fifo directly

        else:
            self.device.send_wire(0x00, 0, 0x01) # reset_b for reset FIFO
            time.sleep(0.005)
            self.device.send_wire(0x00, 0x00000000, 0x00010000)  # ep00wireIn[16] is start_conv
            self.device.send_wire(0x10, 0x0000_0000, 0x0008_0000)  # 0x000n_0000, ep10wireIn[19] bypass R_CLK,
            self.device.send_wire(0x0D, 0x04, 0x00000004)  # reset DDR3
            
            # self.device.data_stream_close()
            self.command['program_pause'] = True
            self.ic_timer.stop()
            self.recording = enable
            time.sleep(0.1) #until the IC_FIFO be empty
            self.device.overflow_counter = 0

            time.sleep(0.01)
            self.device.ads8688_init() # Need DDR3 to be running and 'start_conv' being low to configure ads8688
            time.sleep(0.01)
            self.device.send_wire(0x06, 0xA000_0000, 0xFFFFFFFF) # 0x06 is the address for command of ADC8688, enter into auto_scan mode
            self.device.ad8688_trigger()
            time.sleep(0.01)
            self.device.send_wire(0x06, 0x0000_0000, 0xFFFFFFFF) # keeping auto scan mode
            self.device.ad8688_trigger()


    @pyqtSlot()
    def process_ic_events(self):
        if self.recording:
            if self.iteration_index < self.iteration_total:
                # start_time= time.perf_counter()
                self.command_queue_save.put(self.command) # send the command to the data processing thread
                self.command_queue_process_ic.put(self.command)
                self.command_queue_process_pcb.put(self.command)
                
                self.device.data_stream_ic_ddr3(self.speed_factor*65536, self.iteration_index)
                self.iteration_index = self.iteration_index + 1
                # print(time.perf_counter()-start_time)

            else:
                self.device.send_wire(0x00, 0, 0x01) # reset_b for reset FIFO
                self.device.send_wire(0x00, 0x00000000, 0x00010000)  # ep00wireIn[16] is start_conv
                self.device.send_wire(0x10, 0x0000_0000, 0x0008_0000)  # 0x000n_0000, ep10wireIn[19] bypass R_CLK,
                self.device.send_wire(0x0D, 0x04, 0x00000004)  # reset DDR3
                
                self.command['program_pause'] = True
                self.command_queue_process_pcb.put(self.command)
                self.command_queue_process_ic.put(self.command)
                self.command_queue_save.put(self.command) # send the command to the data processing thread
                # self.device.data_stream_close()
                self.ic_timer.stop()
                self.recording_status_update.emit(True)
                self.device.overflow_counter = 0

