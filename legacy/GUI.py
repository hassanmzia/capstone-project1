from __future__ import unicode_literals
import os.path

import sys
import time
import tables as tb

import SerialThread as st
from CNEAv5 import CNEAv5

from multiprocessing import Queue, Process, shared_memory
data_queue = Queue(maxsize=50)
data_queue_relay = Queue(maxsize=50)
data_queue_pcb = Queue(maxsize=50)
command_queue_save = Queue(maxsize=50)
command_queue_process_ic = Queue(maxsize=50)
command_queue_process_pcb = Queue(maxsize=50)

import queue
import string
import numpy as np
# import numba
import scipy.fftpack
import matplotlib.pyplot as plt
import pyqtgraph as pg
import scipy.misc
from scipy import signal

usleep = lambda x: time.sleep(x / 1000000.0)

from matplotlib import cm
import matplotlib.pyplot as plt

from PyQt5.QtCore import QThread, pyqtSignal
from datetime import datetime
from PyQt5 import QtCore, QtGui, QtWidgets
from PyQt5.QtWidgets import *
from PyQt5.QtCore import *
from PyQt5.QtGui import *

# BITSTREAM_PATH = os.path.join('./')

BITSTREAM_PATH = os.path.join(r'C:\Users\junwang90\Documents\GitHub\CNEA\v5\test_jun\CNEA_v5_GUI_TEST/')
# BITSTREAM_FILE = 'CNEAv5_v01_TOP_SPI_OkClk.bit'
BITSTREAM_FILE = 'CNEAv5_v01_TOP_div4.bit'

BITSTREAM_FILE = 'CNEAv5_v01_TOP_FIFO_Remove4.bit'
# BITSTREAM_FILE = 'CNEAv5_v01_TOP_Reading_Test.bit'
BITSTREAM_FILE = 'CNEAv5_v01_TOP_digi_test3.bit'
BITSTREAM_FILE = 'CNEAv5_v01_TOP_ADC_COMB2.bit'
BITSTREAM_FILE = 'CNEAv5_v01_TOP_Invivo7.bit'
# BITSTREAM_FILE = 'CNEAv5_v01_TOP_Block256.bit'
BITSTREAM_FILE = 'CNEAv5_v01_TOP.bit' # generated on 10/18/2025 with new Vivado version
############### added on 20210212 ##############

from PyQt5.QtGui import *
from PyQt5.QtWidgets import *
from PyQt5.QtCore import *

from pyqtgraph.Qt import QtWidgets, QtCore
import numpy as np
import pyqtgraph as pg
# from pyqtgraph.ptime import time as qtime

import time
import traceback, sys

# Dimensions for data_disp
ROWS, COLS = 4096, 521 # 4096 sites, 512 samples + 1 for spike detection + 8 for PCB data
# Create shared memory block
shm = shared_memory.SharedMemory(create=True, size=ROWS * COLS * 8)  # float64 = 8 bytes

# Wrap it with numpy
shared_array = np.ndarray((ROWS, COLS), dtype=np.float64, buffer=shm.buf)
shared_array[:] = 0.0  # Initialize to zero


# @numba.njit
# def roll_column(arr, num, fill_value=np.nan):
#     result = np.empty_like(arr)
#     result[:, num:] = fill_value
#     result[:, :num] = arr[:, -num:]
#     return result


def data_process_ic(data_queue_relay, data_queue_pcb, command_queue, shm_name):
    import numpy as np
    from multiprocessing import shared_memory
    from numba import njit

    overflow_counter = 0
    batch_size = 512 # same as self.batch_size
    program_exit = False

    shm = shared_memory.SharedMemory(name=shm_name)
    data_disp_ic = np.ndarray((4096, 521), dtype=np.float64, buffer=shm.buf)

    def Spike_Detect_Win(data, sigma=5, win_size=512):
        try:
            row_len, col_len = np.shape(data)
        except:
            row_len, = np.shape(data)
            col_len = row_len

        win_num = int(np.ceil(col_len / win_size))  # make sure include all the data, even last window is not full

        spike_count = np.zeros(row_len)  # for v5, there are 4096 sites

        for index in range(win_num):
            win_data = data[:, index * win_size:(index + 1) * win_size]
            win_mean = np.mean(win_data, axis=1)
            win_std = np.std(win_data, axis=1)
            limit = sigma * win_std  # range
            above_limit = win_mean + limit  # upperboundary
            below_limit = win_mean - limit  # lowerboundary
            win_max = np.amax(data[:, index * win_size:(index + 1) * win_size], axis=1)
            win_min = np.amin(data[:, index * win_size:(index + 1) * win_size], axis=1)
            pos_spike = win_max > above_limit
            neg_spike = win_min < below_limit
            spike_count = spike_count + pos_spike + neg_spike  # adding both positive and negative spike
        return spike_count


    while not program_exit:
        # start_time= time.perf_counter()
        try:
            # print("Waiting for command...")
            command = command_queue.get(timeout=0.01)
            
            if command['program_exit'] == True:

                print("Exit the process of IC data processing.")
                program_exit = True
                break

            if command['spike_detect'] == True:
                # print("Perform spike detection!")
                data_disp_ic[0:4096,8] = Spike_Detect_Win(data_temp, sigma=command['threshold'], win_size=512)
            else:
                # print("Spike detection is off")
                data_disp_ic[0:4096,8] = 0

            if command['spike_reset'] == True:
                # print("Reset the spike detection")
                data_disp_ic[0:4096,8] = 0

        except queue.Empty:
            pass

        try:
            data = data_queue_relay.get(timeout=0.01)
            data_temp_pcb = (data >> 12) # get the 4-bit data from PCB-ADC
            data_temp = (data & 0x0FFF) # 12 LSBs as data from IC-ADC
            # data_temp = (data & 0x0400) # 12 LSBs as data from IC-ADC, test the highest bit
            data_temp = np.fliplr(np.reshape(data_temp, (-1, 2)))
            pixel_data = np.reshape(data_temp, (-1, 4096)) / 4096.0 + 1.15
            data_temp = pixel_data.T
            # random_data = int(4095*np.random.rand())
            # data_temp[random_data, 10:20] = 10 # add some noise to the data
            data_disp_ic[0:4096,-batch_size::] = data_temp
            
            if data_queue_pcb.full(): 
                overflow_counter += 1
                print('the data_queue_pcb is full: ', overflow_counter)
                try:
                    while not program_exit:
                        data_queue_pcb.get_nowait()
                except queue.Empty:
                    pass
            data_queue_pcb.put(data_temp_pcb)

        except queue.Empty:
            pass



def data_process_pcb(data_queue_pcb, command_queue, shm_name):
    import numpy as np
    from multiprocessing import shared_memory
    from numba import njit
    batch_size = 512 # same as self.batch_size
    program_exit = False

    shm = shared_memory.SharedMemory(name=shm_name)
    data_disp_pcb = np.ndarray((4096, 521), dtype=np.float64, buffer=shm.buf)

    @njit
    def roll_column(arr, num, new_data):
        rows, cols = arr.shape
        for r in range(rows):
            for c in range(cols - num):
                arr[r, c] = arr[r, c + num]
            for c in range(num):
                arr[r, cols - num + c] = new_data[r, c]

    def data_preprocess_pcb(data_temp):
        data_temp = np.fliplr(np.reshape(data_temp,(-1,2)))
        data_temp = np.reshape(data_temp, (-1, 64)) # reshape the data to 64-col
        # print("PCB data: ", data_temp[0:2,:])
        if np.max(data_temp[0,:]) > 0:
            data_temp = data_temp[0::2, -5:-1] # extract the last four data points
            data_temp = (4096*(data_temp[::, -1]%4) + 256*data_temp[::, -2] + 16*data_temp[::, -3] + data_temp[::, -4])* 0.078125*1e-3*4 # /65536
            return np.reshape(data_temp, (-1, 8))
        else:
            data_temp = data_temp[1::2, -5:-1] # extract the last four data points
            data_temp = (4096*(data_temp[::, -1]%4) + 256*data_temp[::, -2] + 16*data_temp[::, -3] + data_temp[::, -4])* 0.078125*1e-3*4 # /65536.0
            return np.reshape(data_temp, (-1, 8))

    while not program_exit:

        try:
            # print("Waiting for command...")
            command = command_queue.get(timeout=0.01)
            
            if command['program_exit'] == True:
                print("Exit the process of PCB data processing.")
                program_exit = True
                break
        except queue.Empty:
            pass


        try:
            # start_time= time.perf_counter()
            data_temp_pcb = data_queue_pcb.get(timeout=0.01)
            data_pcb = data_preprocess_pcb(data_temp_pcb)
            data_disp_pcb[0:2048,0:8] = data_pcb
            # print("PCB data: ", data_pcb[0:1,:])
            # print(time.perf_counter()-start_time)
        except queue.Empty:
            pass



def data_process_saving(data_queue, data_queue_relay, command_queue):
    import numpy as np
    overflow_counter = 0
    index = 0
    new_data_path = False
    program_exit = False
    device_name = 'CNEAv5'
    exp_mode = 'Device_Test'  # default experimental mode
    data_save = False  # default data saving is off

    data_path = 'D:/DATA/CNEAv5/' + time.strftime("%Y_%m_%d") + '/' + device_name + '_' + time.strftime("%H_%M_%S") + '/' + exp_mode + '/'
    isdir = os.path.isdir(data_path)
    if not isdir:
        os.makedirs(data_path)
    # H5 implementation
    fhandle_data_raw = tb.open_file(data_path + time.strftime("%Y_%m_%d- ") + time.strftime("%H_%M_%S_") + 'Data_Raw.h5', "a")
    data_raw = fhandle_data_raw.create_earray(fhandle_data_raw.root, "data", tb.UInt16Atom(), shape=(0, 1))

    while not program_exit:
        # start_time= time.perf_counter()
        try:
            # print("Waiting for command...")
            command = command_queue.get(timeout=0.02)
            # print("Command received: ", command)
            
            if command['program_exit'] == True:
                try:
                    fhandle_data_raw.flush()
                    fhandle_data_raw.close()
                except:
                    print("File handle has already been clsoed.")
                print("Exit the process of data saving.")
                program_exit = True
                break

            if command['data_save'] == True:
                data_save = True
            else:
                # print("Data saving is off")
                data_save = False

            if command['program_pause'] == True:
                data_save = False
                print("Data saving is paused")
                # index = 0
                fhandle_data_raw.flush()
                fhandle_data_raw.close()
                new_data_path = True

        except queue.Empty:
            pass

        try:
            # print("Waiting for data...")
            data = data_queue.get(timeout=0.06)
            if data_save:
                if new_data_path:
                    try:
                        fhandle_data_raw = tb.open_file(data_path + time.strftime("%Y_%m_%d- ") + time.strftime("%H_%M_%S_") + 'Data_Raw.h5', "a")
                        data_raw = fhandle_data_raw.create_earray(fhandle_data_raw.root, "data", tb.UInt16Atom(), shape=(0, 1))
                    except Exception as e:
                        print("Error opening file: ", e)
                        fhandle_data_raw.close()
                        fhandle_data_raw = tb.open_file(data_path + time.strftime("%Y_%m_%d- ") + time.strftime("%H_%M_%S_") + 'Data_Raw.h5', "a")
                        data_raw = fhandle_data_raw.create_earray(fhandle_data_raw.root, "data", tb.UInt16Atom(), shape=(0, 1))

                    print("New data path created.")
                    new_data_path = False

                data_raw.append(np.reshape(data, (-1, 1)))
                # print("Data is being saved: ", index)
                # index = index + 1
            else:
                pass

            if data_queue_relay.full(): 
                overflow_counter += 1
                print('the data_relay_queue is full: ', overflow_counter)
                try:
                    while not program_exit:
                        data_queue_relay.get_nowait()
                except queue.Empty:
                    pass
            data_queue_relay.put(data)

                # print("Data saving is off, not saving data")
        except queue.Empty:
            pass

class MainWindow(QMainWindow):
    Waveform2FPGA_sig = pyqtSignal(list, float)
    Waveform_trig_sig = pyqtSignal()
    Waveform_repeat_mode_sig = pyqtSignal(bool, str)
    vs_ac_pulse_sig = pyqtSignal(list)
    shutdown_sig = pyqtSignal()
    CLKs_enable_sig = pyqtSignal(bool, bool, bool, bool)
    DDR3_enable_sig = pyqtSignal(bool,str,str)
    SD_enable_sig = pyqtSignal(bool, float)
    system_config_sig = pyqtSignal(np.ndarray, list, np.ndarray)
    pixel_config_sig = pyqtSignal(list)
    clock_config_sig = pyqtSignal(list)
    pg_config_sig = pyqtSignal(np.ndarray)
    CI_write_sig = pyqtSignal(bool)
    data_path_create_sig = pyqtSignal(str, str)
    duration_sig = pyqtSignal(str)
    NR_enable_sig = pyqtSignal(bool)
    stim_pixel_gen_sig = pyqtSignal(list, list)

    toggle_recording_sig = pyqtSignal(bool)
    bias_update_sig = pyqtSignal(np.ndarray)
    ref_temp_update_sig = pyqtSignal(int, int, int, int)

    def __init__(self, *args, **kwargs):
        super(MainWindow, self).__init__(*args, **kwargs)

        self.batch_size = 512
        self.batch_size_pcb = 4*self.batch_size
        self.app_timer = QTimer(self)
        self.app_timer.start(500)
        self.app_timer.timeout.connect(self.time_refresh)

        self.shm = shared_memory.SharedMemory(name=shm.name)
        self.shared_data = np.ndarray((4096, self.batch_size + 1 + 8), dtype=np.float64, buffer=self.shm.buf)

        self.display_timer = QTimer()
        self.display_timer.timeout.connect(self.data_fetch_ic)
        
        self.counter = 0
        self.temp_status = 0x00
        self.ref_status = 0x0000
        self.lpf_status = 0xFFFFF
        self.mux_status = 0x1FF

        self.sites = None
        self.sites_SD = None
        self.spiking_sites = []
        self.spike_temp = np.zeros(4096)
        self.sites_non_removed = np.ones(4096)
        self.disp_threshold = 5
        self.data_spike_ic = np.zeros(4096)

        self.pcb_disp_length = self.batch_size_pcb*40 # 2s of data
        self.pcb_disp_x_axis = np.arange(self.pcb_disp_length)/40e3 # sampling freq is ~40 kHz
        self.pcb_disp_data = np.zeros((2, self.pcb_disp_length))
        
        self.ic_disp_length = self.batch_size*40 # 2s of data
        self.ic_disp_x_axis = np.arange(self.ic_disp_length)/10e3 # sampling freq is ~10 kHz
        self.ic_disp_averaged = np.zeros(self.ic_disp_length)

        self.site_conv = np.zeros(4096, dtype=np.int32) # site lookup table
        self.site_conv_DC = np.zeros(4096, dtype=np.int32) # x-axis for DC level display
        
        for row in range(64):  # The data output order is from col_63 to col_0, need to be converted back. 
            for col in range(64):
                self.site_conv[64*row + col] = 64*row + (63-col)
                self.site_conv_DC[64*row + col] = 100*(row+1) + col + 1

        # self.site_conv
        self.site_conv_SD = self.site_conv
        self.resize(640*2, 480*2)
        self.setWindowTitle("CNEAv5 Control Program")

        self._st = QThread()
        self.serthread = st.SerialThread(self, BITSTREAM_PATH + BITSTREAM_FILE, 
                                         data_queue, command_queue_save, command_queue_process_ic, command_queue_process_pcb) #  intantiate serial
        
        self.Waveform2FPGA_sig.connect(self.serthread.Waveform2FPGA)
        self.Waveform_trig_sig.connect(self.serthread.Waveform_trigger)
        self.Waveform_repeat_mode_sig.connect(self.serthread.Waveform_repeat_mode)
        self.vs_ac_pulse_sig.connect(self.serthread.vs_ac_pulse_update)
        self.toggle_recording_sig.connect(self.serthread.set_recording)
        self.system_config_sig.connect(self.serthread.system_config)
        self.pixel_config_sig.connect(self.serthread.pixel_config)
        self.clock_config_sig.connect(self.serthread.clock_config)
        self.pg_config_sig.connect(self.serthread.pg_config)

        self.CLKs_enable_sig.connect(self.serthread.stim_CLKs_control)
        self.DDR3_enable_sig.connect(self.serthread.DDR3_control)
        self.SD_enable_sig.connect(self.serthread.spike_detect_control)

        self.CI_write_sig.connect(self.serthread.CI_write) # added on 09/11/2024

        self.bias_update_sig.connect(self.serthread.bias_update)
        self.ref_temp_update_sig.connect(self.serthread.ref_temp_update)
        self.data_path_create_sig.connect(self.serthread.data_path_create)
        self.duration_sig.connect(self.serthread.duration_set)
        self.NR_enable_sig.connect(self.serthread.NR_enable)
        self.stim_pixel_gen_sig.connect(self.serthread.pixel_selection)

        # self.serthread.ic_data_to_update.connect(self.data_fetch_ic)
        self.serthread.ic_data_spike_to_update.connect(self.spike_fetch_ic)
        self.serthread.pcb_data_to_update.connect(self.data_fetch_pcb)

        self.serthread.recording_status_update.connect(self.button_status_update)
        self.shutdown_sig.connect(self.serthread.shutdown)
        
        self.RecordModeComboBox = QComboBox()
        self.RecordModeComboBox.addItems(['GainX300_Inv_Bio','GainX100_Inv_Bio','GainX40_Inv_Bio','Buffer Mode',
                                          'Device_Test', 'GainX40', 'GainX100', 'GainX300'])# 'Buffer Mode', 'GainX34', 'GainX165', 'GainX765'
        # self.RecordModeComboBox.setCurrentIndex(3)
        self.RecordModeComboBox.activated.connect(self.ArrayConfigTableConfig)

        ########################################### Main Window UI ###################################
        self.centralwindow = QtWidgets.QWidget()
        self.centralwindow.setLayout(QtWidgets.QGridLayout())
        self.setCentralWidget(self.centralwindow)

        self.tabs = QtWidgets.QTabWidget()
        self.setbox = QtWidgets.QWidget()
        self.mainDisplayBox = QtWidgets.QGroupBox('Display')

        self.IC_Config = QtWidgets.QWidget()
        self.PCB_Config = QtWidgets.QWidget()

        self.setbox.setLayout(QtWidgets.QGridLayout())
        self.setbox.setMaximumWidth(300)
        self.centralwindow.layout().addWidget(self.tabs, 0, 0)
        self.centralwindow.layout().addWidget(self.mainDisplayBox, 0, 1)
        self.centralwindow.layout().addWidget(self.setbox, 0, 2)

        self.create_TIA_ConfigureGroup()
        self.createTemperatureGroupBox()
        self.createBiasConfigTable()
        self.createClockConfigTable()
        self.createWaveformConfigureGroup()
        self.vs_ac_pulse_control()

        self.createArrayConfigTable()
        self.createArrayConfigTable2()
        self.StimulationPatternConfig()
        self.createPulseConfigTable()
        self.createPulseConfigTable2()

        ####################################### Control Group_ Settings #########################################
        self.ctrbgr = QtWidgets.QGroupBox("System Controls")
        self.ctrbgr.setLayout(QtWidgets.QFormLayout())

        self.Current_Time = QLineEdit("")
        self.Current_Time.setMaximumWidth(150)
        self.ctrbgr.layout().addRow("Current DateTime", self.Current_Time)

        self.Current_Device = QLineEdit("Not Selected")
        self.Current_Device.setMaximumWidth(150)
        self.ctrbgr.layout().addRow("Selected Device", self.Current_Device)

        self.Duration = QLineEdit("60")
        self.Duration.setMaximumWidth(100)
        self.ctrbgr.layout().addRow("Duration (s)", self.Duration)

        self.Start_Time = QLineEdit("")
        self.Start_Time.setMaximumWidth(150)
        self.Start_Time.setReadOnly(True)
        self.ctrbgr.layout().addRow("Start DateTime", self.Start_Time)

        self.Duration_Passed = QLineEdit("0")
        self.Duration_Passed.setMaximumWidth(100)
        self.Duration_Passed.setReadOnly(True)
        self.ctrbgr.layout().addRow("Time Passed (s)", self.Duration_Passed)


        self.RecordingEnableCheckBox = QCheckBox()
        self.RecordingEnableCheckBox.setChecked(False)
        self.RecordingEnableCheckBox.toggled.connect(lambda: self.serthread.recording_enable_config(self.RecordingEnableCheckBox.isChecked()))
        self.ctrbgr.layout().addRow("&Recording Enable", self.RecordingEnableCheckBox)

        self.tableWidget = QTableWidget(8, 2)
        self.tableWidget.setFixedHeight(8*35)
        self.tableWidget.setFixedWidth(260)
        self.tableWidget.setHorizontalHeaderLabels(["Items", "Value"])
        self.tableWidget.setItem(0, 0, QTableWidgetItem("MUX_OUT 0"))
        self.tableWidget.setItem(1, 0, QTableWidgetItem("MUX_OUT 1"))
        self.tableWidget.setItem(2, 0, QTableWidgetItem("MUX_OUT 2"))
        self.tableWidget.setItem(3, 0, QTableWidgetItem("MUX_OUT 3"))
        self.tableWidget.setItem(4, 0, QTableWidgetItem("TEST_OUT"))
        self.tableWidget.setItem(5, 0, QTableWidgetItem("REF_BUFF 1"))
        self.tableWidget.setItem(6, 0, QTableWidgetItem("REF_BUFF 2"))
        self.tableWidget.setItem(7, 0, QTableWidgetItem("V_TIA"))

        self.tableWidget.setItem(0, 1, QTableWidgetItem("0"))
        self.tableWidget.setItem(1, 1, QTableWidgetItem("0"))
        self.tableWidget.setItem(2, 1, QTableWidgetItem("0"))
        self.tableWidget.setItem(3, 1, QTableWidgetItem("0"))
        self.tableWidget.setItem(4, 1, QTableWidgetItem("0"))
        self.tableWidget.setItem(5, 1, QTableWidgetItem("1.65"))
        self.tableWidget.setItem(6, 1, QTableWidgetItem("1.65"))
        self.tableWidget.setItem(7, 1, QTableWidgetItem("1.65"))
        self.ctrbgr.layout().addRow(self.tableWidget)

        # self.styleComboBox = QComboBox()
        # self.styleComboBox.addItems(QStyleFactory.keys())
        # self.ctrbgr.layout().addRow("&Style", self.styleComboBox)
        self.ctrbgr.layout().addRow("Experimental Mode", self.RecordModeComboBox)

        self.Sys_Config = QtWidgets.QPushButton("System Config")
        self.Sys_Config.setDefault(True)
        self.Sys_Config.setStyleSheet('background-color: rgb(190,159,229);')
        self.Sys_Config.setMaximumWidth(100)
        self.Sys_Config.clicked.connect(self.sys_setting) # can also use 'pressed' method
        self.ctrbgr.layout().addRow('     ', self.Sys_Config)
        #self.ctrbgr.layout().addRow("PCB_Config", self.PCB_Config)

        self.start_rec = QtWidgets.QPushButton("")
        self.start_rec.setCheckable(True)
        self.start_rec.setChecked(False)
        self.start_rec.setStyleSheet('QPushButton {background-color: pink;} QPushButton::checked {background-color : red;}')
        self.start_rec.setText('Click to start')
        self.start_rec.setMaximumWidth(100)
        self.start_rec.toggled.connect(self.start_recording)
        self.ctrbgr.layout().addRow("Start/Stop", self.start_rec)

        self.stim_CLK_all = QtWidgets.QPushButton("")
        self.stim_CLK_all.setCheckable(True)
        self.stim_CLK_all.setChecked(False)
        # self.stim_CLK_all.setStyleSheet('background-color: rgb(130,159,229);')
        self.stim_CLK_all.setStyleSheet('QPushButton {background-color: rgb(130,159,229);} QPushButton::checked {background-color : red;}')

        self.stim_CLK_all.setText('CLK_all')
        self.stim_CLK_all.setMaximumWidth(50)
        self.stim_CLK_all.toggled.connect(self.CLKs_control) #self.stim_CLK_all_set
        self.ctrbgr.layout().addRow("On/Off", self.stim_CLK_all)
        
        self.stim_CLK1 = QtWidgets.QPushButton("")
        self.stim_CLK1.setCheckable(True)
        self.stim_CLK1.setChecked(False)
        self.stim_CLK1.setStyleSheet('QPushButton {background-color: rgb(130,159,229);} QPushButton::checked {background-color : red;}')
        self.stim_CLK1.setText('CLK1')
        self.stim_CLK1.setMaximumWidth(50)
        self.stim_CLK1.toggled.connect(self.CLKs_control)
        self.ctrbgr.layout().addRow("On/Off", self.stim_CLK1)
        
        self.stim_CLK2 = QtWidgets.QPushButton("")
        self.stim_CLK2.setCheckable(True)
        self.stim_CLK2.setChecked(False)
        self.stim_CLK2.setStyleSheet('QPushButton {background-color: rgb(130,159,229);} QPushButton::checked {background-color : red;}')
        self.stim_CLK2.setText('CLK2')
        self.stim_CLK2.setMaximumWidth(50)
        self.stim_CLK2.toggled.connect(self.CLKs_control)
        self.ctrbgr.layout().addRow("On/Off", self.stim_CLK2)
        
        self.stim_CLK3 = QtWidgets.QPushButton("")
        self.stim_CLK3.setCheckable(True)
        self.stim_CLK3.setChecked(False)
        self.stim_CLK3.setStyleSheet('QPushButton {background-color: rgb(130,159,229);} QPushButton::checked {background-color : red;}')
        self.stim_CLK3.setText('CLK3')
        self.stim_CLK3.setMaximumWidth(50)
        self.stim_CLK3.toggled.connect(self.CLKs_control)
        self.ctrbgr.layout().addRow("On/Off", self.stim_CLK3)
        
        OCP_layout = QHBoxLayout()
        self.stim_OCP = QtWidgets.QPushButton("")
        self.stim_OCP.setCheckable(True)
        self.stim_OCP.setChecked(False)
        self.stim_OCP.setStyleSheet('QPushButton {background-color: rgb(130,159,229);} QPushButton::checked {background-color : red;}')
        self.stim_OCP.setText('DDR3')
        self.stim_OCP.setMaximumWidth(50)
        self.stim_OCP.toggled.connect(self.DDR3_control)

        self.OCP_on = QLineEdit('100')
        self.OCP_off = QLineEdit('900')
        OCP_layout.addWidget(self.stim_OCP)
        OCP_layout.addWidget(self.OCP_on)
        OCP_layout.addWidget(self.OCP_off)


        self.ctrbgr.layout().addRow("DDR3/On/Off", OCP_layout)

        self.stim_V = QtWidgets.QPushButton("V Stim")
        self.stim_V.setCheckable(True)
        self.stim_V.setChecked(False)
        self.stim_V.setStyleSheet('QPushButton {background-color: rgb(130,159,229);} QPushButton::checked {background-color : red;}')
        self.stim_V.setMaximumWidth(50)
        self.stim_V.toggled.connect(self.v_stim_control) # trigger Vs1 stimulation
        self.ctrbgr.layout().addRow("On/Off", self.stim_V)

        self.stim_I = QtWidgets.QPushButton("I Stim")
        self.stim_I.setCheckable(True)
        self.stim_I.setChecked(False)
        self.stim_I.setStyleSheet('QPushButton {background-color: rgb(130,159,229);} QPushButton::checked {background-color : red;}')
        self.stim_I.setMaximumWidth(50)
        self.stim_I.toggled.connect(self.i_stim_control) # 
        self.ctrbgr.layout().addRow("On/Off", self.stim_I)

        self.System_Exit = QtWidgets.QPushButton("Exit")
        self.System_Exit.setDefault(True)
        self.System_Exit.setMaximumWidth(60)
        self.System_Exit.clicked.connect(self.closeEvent)
        self.ctrbgr.layout().addRow('', self.System_Exit)

        self.test_command = QLineEdit('1')
        self.test_command.setMaximumWidth(60)
        self.ctrbgr.layout().addRow('', self.test_command)

        self.Test_Command = QtWidgets.QPushButton("Update_Test_Command")
        # self.Test_Command.setDefault(True)
        self.Test_Command.setMaximumWidth(130)
        self.Test_Command.clicked.connect(self.test_command_func)
        self.ctrbgr.layout().addRow('', self.Test_Command)

        self.setbox.layout().addWidget(self.ctrbgr, 0, 0)

        # #######################################Display the Reading from PCB and IC ###############
        mainboxLayout = QGridLayout()
        self.nPlots_PCB = 1
        self.nSamples_PCB = 40000
        self.timestamp_PCB = 0
        self.Fsample_PCB = 10000.0
        self.curves_PCB = []
        self.data_PCB = np.random.normal(size=(self.nPlots_PCB, self.nSamples_PCB))
        self.plotW_PCB = pg.PlotWidget()
        self.plotW_PCB.setBackground('w')
        self.plotW_PCB.setLabel('left', 'Iref', units='nA')
        self.plotW_PCB.setLabel('bottom', 'Time', units='s')
        for self.idx_PCB in range(self.nPlots_PCB):
            self.curve_PCB = pg.PlotCurveItem(pen=(self.idx_PCB, self.nPlots_PCB * 4))
            self.plotW_PCB.addItem(self.curve_PCB)
            self.curve_PCB.setPos(0, 0) #self.idx_PCB
            self.curves_PCB.append(self.curve_PCB)
        mainboxLayout.addWidget(self.plotW_PCB, 0, 0)


        self.nPlots_PCB2 = 1
        self.plotW_PCB2 = pg.PlotWidget()
        self.plotW_PCB2.setBackground('w')
        self.curve_PCB2 = pg.PlotCurveItem(pen=(1, 2))
        self.plotW_PCB2.addItem(self.curve_PCB2)
        self.curve_PCB2.setPos(0, 0)
        self.plotW_PCB2.setLabel('left', 'Vs1', units='V')
        self.plotW_PCB2.setLabel('bottom', 'Time', units='s')
        mainboxLayout.addWidget(self.plotW_PCB2, 1, 0)
        # mainboxLayout.setRowStretch(0, 1)

        self.nPlots = 1
        self.nSamples = 40000
        self.timestamp = 0
        self.Fsample = 10000.0
        self.curves = []
        self.plotW = pg.PlotWidget()
        self.plotW.setBackground('w')
        self.legend_fd = self.plotW.addLegend()
        self.plotW.setLabel('left', 'Vamp', units='V')
        self.plotW.setLabel('bottom', 'Time', units='s')
        mainboxLayout.addWidget(self.plotW, 2, 0)

        self.nPlots_NR = 1
        self.curves_NR = []
        self.plotW_NR = pg.PlotWidget()
        self.plotW_NR.setBackground('w')
        self.legend_fd_NR = self.plotW_NR.addLegend()
        self.plotW_NR.setLabel('left', ' Averaged', units ='V')
        self.plotW_NR.setLabel('bottom', 'Time', units='s')
        mainboxLayout.addWidget(self.plotW_NR, 3, 0)

        mainboxLayout.setRowStretch(0, 1)
        mainboxLayout.setRowStretch(1, 1)
        mainboxLayout.setRowStretch(3, 1)
        mainboxLayout.setRowStretch(2, 2)
        mainboxLayout.setColumnStretch(0, 2)
        mainboxLayout.setColumnStretch(1, 1)


        # ################## add display sites widget #########
        self.display_sites = QLineEdit('0101')
        self.Display = QtWidgets.QPushButton("Display")
        self.NR_EN = QCheckBox('Noise Reduction')
        self.NR_EN.clicked.connect(self.noise_reduction)

        self.disp_len = QLineEdit('2')
        self.disp_len.setMaximumWidth(40)
        self.disp_len.textChanged.connect(self.disp_len_refresh)
        self.disp_len_form = QWidget()
        self.disp_len_form.setLayout(QFormLayout())
        self.disp_len_form.layout().addRow('Display Length (s)', self.disp_len)

        self.display_hbox = QHBoxLayout()
        self.display_hbox.addWidget(self.Display)
        self.display_hbox.addWidget(self.NR_EN)
        self.display_hbox.addWidget(self.disp_len_form)

        self.Display.setMaximumWidth(100)
        self.Display.clicked.connect(self.site_selection) # can also use 'pressed' method
        mainboxLayout.addWidget(self.display_sites, 4, 0, 1, 1)
        mainboxLayout.setRowStretch(4, 1)
        mainboxLayout.addLayout(self.display_hbox, 5, 0)


        ############# DC Level display #################
        self.data_DC = np.zeros((1, 4096))
        self.plotW_DC = pg.PlotWidget()
        self.plotW_DC.setBackground('w')
        self.curve_DC = pg.PlotCurveItem(pen=pg.mkPen(3))
        self.plotW_DC.addItem(self.curve_DC)
        self.curve_DC.setPos(0, 0)
        self.plotW_DC.setLabel('left', 'DC Level', units='V')
        self.plotW_DC.setLabel('bottom', 'Site')
        mainboxLayout.addWidget(self.plotW_DC, 0, 1)


        ############# spikes plot display #################
        self.data_spike = np.zeros((1, 4096))
        self.plotW_spike = pg.PlotWidget()
        self.plotW_spike.setBackground('w')
        self.curve_spike = pg.PlotCurveItem(pen=pg.mkPen(3))
        self.plotW_spike.addItem(self.curve_spike)
        self.curve_spike.setPos(0, 0)
        self.plotW_spike.setLabel('left', 'Spikes')
        self.plotW_spike.setLabel('bottom', 'Site')
        mainboxLayout.addWidget(self.plotW_spike, 1, 1)


        ############# spikes detect Sigma, Enable, Reset, Threshold #################
        detect_layout = QHBoxLayout()
        self.sigma_detect = QLineEdit('5')
        self.sigma_detect.setMaximumWidth(40)
        self.sigma_detect.textChanged.connect(self.SD_control)
        sigmaLabel = QLabel("&Sigma:")
        sigmaLabel.setBuddy(self.sigma_detect)
        detect_layout.addStretch(1)
        detect_layout.addWidget(sigmaLabel)
        detect_layout.addWidget(self.sigma_detect)

        self.enable_detect = QPushButton("Click to disable SD")
        self.enable_detect.setCheckable(True)
        self.enable_detect.setChecked(False)
        self.enable_detect.setStyleSheet('QPushButton {background-color: rgb(130,159,229);} QPushButton::checked {background-color : red;}')
        self.enable_detect.clicked.connect(self.SD_control)
        detect_layout.addWidget(self.enable_detect)

        self.reset_detect = QPushButton("Reset")
        self.reset_detect.clicked.connect(self.list_spike_reset)
        detect_layout.addWidget(self.reset_detect)

        detect_layout.addStretch(1)
        self.threshold_disp = QLineEdit('5')
        self.threshold_disp.setMaximumWidth(40)
        self.threshold_disp.textChanged.connect(self.list_spike_threshold)
        thresholdLabel = QLabel("&Disp_Threshold:")
        thresholdLabel.setBuddy(self.threshold_disp)

        detect_layout.addWidget(thresholdLabel)
        detect_layout.addWidget(self.threshold_disp)

        mainboxLayout.addLayout(detect_layout, 2, 1)

        ############# spikes detected and moved list  #################

        list_layout = QHBoxLayout()
        self.list_spike = QListWidget()
        self.list_spike.setSelectionMode(3)
        self.list_spike.clicked.connect(self.site_display_byclick)

        self.remove_button = QPushButton("Remove")
        self.remove_button.setMaximumWidth(100)
        self.remove_button.clicked.connect(self.list_to_remove)
        list_layout_disp = QVBoxLayout()

        list_layout_disp.addWidget(self.list_spike)
        list_layout_disp.addWidget(self.remove_button)
        list_layout.addLayout(list_layout_disp)

        self.list_removed = QListWidget()
        self.list_removed.setSelectionMode(3)
        # self.list_removed.clicked.connect(self.site_display_byclick)
        self.add_button = QPushButton("Add")
        self.add_button.setMaximumWidth(100)
        self.add_button.clicked.connect(self.list_to_add)
        list_layout_add = QVBoxLayout()

        list_layout_add.addWidget(self.list_removed)
        list_layout_add.addWidget(self.add_button)
        list_layout.addLayout(list_layout_add)

        mainboxLayout.addLayout(list_layout, 3, 1)

        self.mainDisplayBox.setLayout(mainboxLayout)
        # self.tabs.addTab(self.mainDisplayBox, "Display")


        # ################################## Add a TableWidget to display the settings of IC #################
        # ################################## Add a TableWidget to display the settings of IC #################
        setIC_PageLayout = QGridLayout()
        # setIC_PageLayout.addLayout(tab_v_box, 0, 0)
        setIC_PageLayout.addWidget(self.ArrayConfigTable, 0, 0)
        setIC_PageLayout.addWidget(self.pixelGroupBox, 0, 1)
        # setIC_PageLayout.addLayout(self.Stim_Site_Layout, 0, 3)

        # setIC_PageLayout.addWidget(self.PulseConfigTable, 0, 3)
        setIC_PageLayout.addWidget(self.pgGroupBox, 1, 0)

        # setIC_PageLayout.addWidget(self.RecordModeComboBox, 1, 1)
        setIC_PageLayout.addWidget(self.tabs_StimPattern, 1, 1)
        setIC_PageLayout.addWidget(self.ApplyButton, 2, 1)
        setIC_PageLayout.addWidget(self.ClearButton, 3, 1)
        setIC_PageLayout.addWidget(self.DeleteButton, 4, 1)

        setIC_PageLayout.setRowStretch(0, 3)
        setIC_PageLayout.setRowStretch(1, 1)

        self.IC_Config.setLayout(setIC_PageLayout)
        self.tabs.addTab(self.IC_Config, "IC Settings")

        # ################################## Add a TableWidget to Configure PCB settings #################
        # ################################## Add a TableWidget to Configure PCB settings #################
        setPCB_PageLayout = QGridLayout()
        setPCB_PageLayout.addWidget(self.REF_EL_TIA_ConfigureGroupBox, 0, 0)
        setPCB_PageLayout.addWidget(self.temperatureGroupBox, 1, 0)

        tab_v_box_bias = QHBoxLayout()
        tab_v_box_bias.setContentsMargins(5, 5, 5, 5)
        tab_v_box_bias.addWidget(self.biasGroupBox)
        # tab_v_box_bias.addStretch(1)
        setPCB_PageLayout.addLayout(tab_v_box_bias, 0, 1)

        tab_v_box_clock = QHBoxLayout()
        tab_v_box_clock.setContentsMargins(5, 5, 5, 5)
        tab_v_box_clock.addWidget(self.clockGroupBox)
        # tab_v_box_clock.addStretch(1)
        setPCB_PageLayout.addLayout(tab_v_box_clock, 1, 1)

        setPCB_PageLayout.addWidget(self.WaveformGenBox, 0, 2)

        setPCB_PageLayout.addWidget(self.VS_Control, 1, 2)


        self.PCB_Config.setLayout(setPCB_PageLayout)
        self.tabs.addTab(self.PCB_Config, "PCB Settings")


        ########################### thread control ?? ##########################################################
        ########################### thread control ?? ##########################################################
        self.serthread.moveToThread(self._st)
        self._st.start()


    def create_TIA_ConfigureGroup(self):
        self.REF_EL_TIA_ConfigureGroupBox = QGroupBox('REF_EL_TIA_Configure')
        TIABox9 = QCheckBox('Connect on-chip REF2 to ADC')
        TIABox8 = QCheckBox('Connect on-chip REF2 to REF_EL')
        TIABox7 = QCheckBox('Connect on-chip REF1 to ADC')
        TIABox6 = QCheckBox('Connect on-chip REF1 to REF_EL')

        TIABox5 = QCheckBox('Set Feedback Impedance as: 0 Ohms')
        # TIABox5.setChecked(True)
        TIABox4 = QCheckBox('Set Feedback Impedance as: 1M Ohms')
        TIABox4.setChecked(True)
        TIABox3 = QCheckBox('Set Feedback Impedance as: 10M Ohms')
        # TIABox3.setChecked(True)
        TIABox2 = QCheckBox('Set Feedback Impedance as: 100M Ohms')
        # TIABox2.setChecked(True)

        TIABox1 = QCheckBox('Connect the pos input of TIA to REF_DC')
        TIABox1.setChecked(True)
        TIABox0 = QCheckBox('Connect the pos input of TIA to Ext REF')
        # TIABox0.setChecked(True)

        CheckBox_list = [TIABox9, TIABox8, TIABox7, TIABox6, TIABox5, TIABox4, TIABox3, TIABox2, TIABox1, TIABox0]
        tab_v_box = QVBoxLayout()
        tab_v_box.setContentsMargins(5, 5, 5, 5)
        for box_index in range(len(CheckBox_list)):
            tab_v_box.addWidget(CheckBox_list[box_index])
        # tab_v_box.addStretch(1)

        Apply = QtWidgets.QPushButton("Apply")
        Apply.setDefault(False)
        Apply.setMaximumWidth(60)
        Apply.clicked.connect(lambda: self.update_ref_status( (TIABox9.isChecked()<<9) + (TIABox8.isChecked()<<8) +
                                                              (TIABox7.isChecked()<<7) + (TIABox6.isChecked()<<6) +
                                                              (TIABox5.isChecked()<<5) + (TIABox4.isChecked()<<4) +
                                                              (TIABox3.isChecked()<<3) + (TIABox2.isChecked()<<2) +
                                                              (TIABox1.isChecked()<<1) + TIABox0.isChecked()))
        tab_v_box.addWidget(Apply)
        tab_v_box.addStretch(1)

        LPF_h_box = QHBoxLayout()
        LPF_label = QLabel('Enter LPF String (hex):')
        LPF_string = QtWidgets.QLineEdit("0x_F_F_F_F_F")
        LPF_string.setMaximumWidth(85)
        LPF_h_box.addWidget(LPF_label)
        LPF_h_box.addWidget(LPF_string)
        tab_v_box.addLayout(LPF_h_box)

        Apply_lpf = QtWidgets.QPushButton("Apply_LPF")
        Apply_lpf.setDefault(False)
        Apply_lpf.setMaximumWidth(60)
        Apply_lpf.clicked.connect(lambda: self.update_lpf_status(LPF_string.text()))
        tab_v_box.addWidget(Apply_lpf)
        tab_v_box.addStretch(1)

        MUX_h_box = QHBoxLayout()
        MUX_label = QLabel('Enter MUX String (hex):')
        MUX_string = QtWidgets.QLineEdit("0x_0_1_F")
        MUX_string.setMaximumWidth(85)
        MUX_h_box.addWidget(MUX_label)
        MUX_h_box.addWidget(MUX_string)
        tab_v_box.addLayout(MUX_h_box)

        Apply_MUX = QtWidgets.QPushButton("Apply_MUX")
        Apply_MUX.setDefault(False)
        Apply_MUX.setMaximumWidth(60)
        Apply_MUX.clicked.connect(lambda: self.update_mux_status(MUX_string.text()))
        tab_v_box.addWidget(Apply_MUX)
        tab_v_box.addStretch(1)

        self.REF_EL_TIA_ConfigureGroupBox.setLayout(tab_v_box)

    def update_ref_status(self, ref_status):
        self.ref_status = ref_status
        self.ref_temp_update_sig.emit(self.ref_status, self.temp_status, self.lpf_status, self.mux_status)
        print(hex(self.ref_status))

    def update_lpf_status(self, lpf_status):
        self.lpf_status = np.int32(int(lpf_status,16))
        print(hex(self.lpf_status))
        self.ref_temp_update_sig.emit(self.ref_status, self.temp_status, self.lpf_status, self.mux_status)

    def update_mux_status(self, mux_status):
        self.mux_status = np.int32(int(mux_status,16))
        print(hex(self.mux_status))
        self.ref_temp_update_sig.emit(self.ref_status, self.temp_status, self.lpf_status, self.mux_status)        

    def createTemperatureGroupBox(self):
        self.temperatureGroupBox = QGroupBox('Temp Control')
        TempBox7 = QCheckBox('Enable Temp_Set')
        TempBox6 = QCheckBox('Enable PI Control')
        TempBox6.setChecked(True)
        TempBox5 = QCheckBox('Scale Factor 53.4 mV/C')
        TempBox4 = QCheckBox('Scale Factor 71.2 mV/C')
        TempBox3 = QCheckBox('PI Factor 3')
        TempBox3.setChecked(True)
        TempBox2 = QCheckBox('PI Factor 2')
        TempBox1 = QCheckBox('PI Factor 1')
        TempBox0 = QCheckBox('PI Factor 0')

        tab_v_box = QVBoxLayout()
        tab_v_box.setContentsMargins(5, 5, 5, 5)
        tab_v_box.addWidget(TempBox7)
        tab_v_box.addWidget(TempBox6)
        tab_v_box.addWidget(TempBox5)
        tab_v_box.addWidget(TempBox4)
        tab_v_box.addWidget(TempBox3)
        tab_v_box.addWidget(TempBox2)
        tab_v_box.addWidget(TempBox1)
        tab_v_box.addWidget(TempBox0)

        Apply = QtWidgets.QPushButton("Apply")
        Apply.setDefault(False)
        Apply.setMaximumWidth(60)
        Apply.clicked.connect(lambda: self.update_temp_status((TempBox7.isChecked()<<7) + (TempBox6.isChecked()<<6) +
                                                              (TempBox5.isChecked()<<5) + (TempBox4.isChecked()<<4) +
                                                              (TempBox3.isChecked()<<3) + (TempBox2.isChecked()<<2) +
                                                              (TempBox1.isChecked()<<1) + TempBox0.isChecked()))
        tab_v_box.addWidget(Apply)
        tab_v_box.addStretch(1)
        self.temperatureGroupBox.setLayout(tab_v_box)


    def update_temp_status(self, temp_status):
        self.temp_status = temp_status
        self.ref_temp_update_sig.emit(self.ref_status, self.temp_status, self.lpf_status, self.mux_status)
        print(hex(self.temp_status))

    def createBiasConfigTable(self):
        self.biasGroupBox = QGroupBox('Bias Control')
        tab_v_box = QVBoxLayout()
        tab_v_box.setContentsMargins(5, 5, 5, 5)
        self.Bias_tableWidget = QTableWidget(20, 2)
        self.Bias_tableWidget.setFixedHeight(20*31)
        self.Bias_tableWidget.setFixedWidth(8*32)
        self.Bias_tableWidget.setHorizontalHeaderLabels(["Bias", "Value (V)"])

        TableItems = ["VS1", "VS2", "VS3", "VS4", "V_CI1", "V_CI2", "V_CI3", "V_CI4", "VREFL", "VREFLH", "VREFMH", "VCM", 
                      "BP_CI", "BP_OTA", "VR", "NMIR", "REF_DC", "TEMP_SET", "TEMP_OS", "TEST_IN"]
        TableValues = ['1.65', '1.5', '0', '1.2', '0', '0', '0', '0', '1.15', '2.15', '2.15', '1.65', '2.85', '2.85', '3.3','0.65','1.65','0.0','0.5','2.0']
        self.TableValues_old = TableValues


        for i in range(20):
            self.Bias_tableWidget.setItem(i, 0, QTableWidgetItem(TableItems[i]))
            self.Bias_tableWidget.setItem(i, 1, QTableWidgetItem(TableValues[i]))

        Update = QtWidgets.QPushButton("Update")
        Update.setMaximumWidth(60)
        Update.clicked.connect(self.update_bias_command)
        tab_v_box.addWidget(self.Bias_tableWidget)
        tab_v_box.addStretch(1)
        tab_v_box.addWidget(Update)
        tab_v_box.addStretch(1)
        self.biasGroupBox.setLayout(tab_v_box)


    @pyqtSlot()
    def update_bias_command(self):
        bias_command =[]
        for index in range(20):
        # if self.TableValues_old[index] != self.Bias_tableWidget.item(index, 1).text():
            if index <4:
                self.TableValues_old[index] = self.Bias_tableWidget.item(index, 1).text()
                bias_command.append([0x01, index + 0x08, float(self.Bias_tableWidget.item(index, 1).text())])
            elif index <8:
                self.TableValues_old[index] = self.Bias_tableWidget.item(index, 1).text()
                bias_command.append([0x02, index + 0x04, float(self.Bias_tableWidget.item(index, 1).text())])
            elif index <12:
                self.TableValues_old[index] = self.Bias_tableWidget.item(index, 1).text()
                bias_command.append([0x04, index, float(self.Bias_tableWidget.item(index, 1).text())])
            elif index <16:
                self.TableValues_old[index] = self.Bias_tableWidget.item(index, 1).text()
                bias_command.append([0x08, index - 0x04, float(self.Bias_tableWidget.item(index, 1).text())])
            elif index <20:
                self.TableValues_old[index] = self.Bias_tableWidget.item(index, 1).text()
                bias_command.append([0x10, index - 0x08, float(self.Bias_tableWidget.item(index, 1).text())])
        bias_command = np.array(bias_command)
        if len(bias_command) == 0:
            print('No bias is changed!')
        else:
            bias_command[:, 2] = bias_command[:, 2]/(2.518*2)*65535
            self.bias_update_sig.emit(np.array(bias_command, dtype=np.int32))



    def createClockConfigTable(self):
        self.clockGroupBox = QGroupBox('Clocks Control')
        tab_v_box = QVBoxLayout()
        tab_v_box.setContentsMargins(5, 5, 5, 5)
        self.Clocks_tableWidget = QTableWidget(15, 2)
        self.Clocks_tableWidget.setFixedHeight(15*35)
        self.Clocks_tableWidget.setFixedWidth(8*32)
        self.Clocks_tableWidget.setHorizontalHeaderLabels(["Clock", "Div (integer)"])

        TableItems = ["CLK1", "CLK2", "CLK3", "PG", "OCP", "Fs_factor"]
        TableValues = ['100',   '250',    '250',   '0',  '1', '2']
        # self.TableValues_old = TableValues

        for i in range(6):
            self.Clocks_tableWidget.setItem(i, 0, QTableWidgetItem(TableItems[i]))
            self.Clocks_tableWidget.setItem(i, 1, QTableWidgetItem(TableValues[i]))

        Update = QPushButton("Update")
        Update.setMaximumWidth(60)
        Update.clicked.connect(lambda: self.update_clock_division(len(TableValues)))
        tab_v_box.addWidget(self.Clocks_tableWidget)
        # tab_v_box.addStretch(1)
        tab_v_box.addWidget(Update)
        tab_v_box.addStretch(1)
        self.clockGroupBox.setLayout(tab_v_box)

    def update_clock_division(self, length):
        table_values = []
        for i in range(length):
            table_values.append(self.Clocks_tableWidget.item(i, 1).text())
        self.clock_config_sig.emit(table_values)

    def createWaveformConfigureGroup(self):
        self.WaveformGenBox = QGroupBox("WaveformConfig")
        self.WaveformGenBox.setCheckable(True)
        self.WaveformGenBox.setChecked(True)

        outerLayout = QVBoxLayout()
        self.WaveformGenBox.setLayout(outerLayout)

        self.nPlots_Waveform = 4
        self.nSamples_Waveform = 200
        self.timestamp_Waveform = 0

        self.curves_Waveform = []
        self.data_Waveform = np.zeros((self.nPlots_Waveform, self.nSamples_Waveform))
        self.plotW_Waveform = pg.PlotWidget()
        self.plotW_Waveform.setBackground('w')
        self.plotW_Waveform.addLegend()
        for self.idx_Waveform in range(self.nPlots_Waveform):
            self.curve_Waveform = pg.PlotCurveItem(pen=(self.idx_Waveform, self.nPlots_Waveform * 0.5), name=str(self.idx_Waveform))
            self.plotW_Waveform.addItem(self.curve_Waveform)
            self.curve_Waveform.setPos(0, 0) #self.idx_PCB
            self.curves_Waveform.append(self.curve_Waveform)


        self.curves_Waveform[0].setData(self.data_Waveform[:, 1])

        outerLayout.addWidget(self.plotW_Waveform)

        tabs_Waveform = QTabWidget()
        tab_Waveform_Gen = QWidget()
        tab_Waveform_Gen_Layout = QGridLayout()
        tab_Waveform_Gen.setLayout(tab_Waveform_Gen_Layout)
        tabs_Waveform.addTab(tab_Waveform_Gen, 'Typical')

        TypeLayout = QFormLayout()
        self.TypeComboBox = QComboBox()
        self.TypeComboBox.addItems(['Sinwave', 'Triangle', 'Pulse'])
        self.TypeComboBox.setMaximumWidth(80)
        self.TypeComboBox.activated.connect(self.Disp_Waveform_Typ)

        TypeLayout.addRow("Type:", self.TypeComboBox)

        FrequencyLayout = QFormLayout()
        self.Frequency = QLineEdit('1000')
        self.Frequency.setMaximumWidth(80)
        FrequencyLayout.addRow("Frequency (Hz):", self.Frequency)
        AmplitudeLayout = QFormLayout()
        self.Amplitude = QLineEdit('0.04')
        self.Amplitude.setMaximumWidth(80)
        AmplitudeLayout.addRow("Amplitude (V):", self.Amplitude)
        OffsetLayout = QFormLayout()
        self.Offset = QLineEdit('2.0')
        self.Offset.setMaximumWidth(80)
        OffsetLayout.addRow("Offset (V):", self.Offset)
        PhaseLayout = QFormLayout()
        self.Phase = QLineEdit('0')
        self.Phase.setMaximumWidth(80)
        PhaseLayout.addRow("Phase (0 ~ 360):", self.Phase)
        DutyLayout = QFormLayout()
        self.Duty  = QLineEdit('0.5')
        self.Duty.setMaximumWidth(80)
        DutyLayout.addRow("Duty (0 ~ 1)", self.Duty)

        tab_Waveform_Gen_Layout.addLayout(TypeLayout, 0, 0)
        tab_Waveform_Gen_Layout.addLayout(FrequencyLayout, 0, 1)
        tab_Waveform_Gen_Layout.addLayout(AmplitudeLayout, 0, 2)
        tab_Waveform_Gen_Layout.addLayout(OffsetLayout, 1, 0)
        tab_Waveform_Gen_Layout.addLayout(PhaseLayout, 1, 1)
        tab_Waveform_Gen_Layout.addLayout(DutyLayout, 1, 2)

        tab_Waveform_File = QWidget()
        tab_Waveform_File_Layout = QFormLayout()
        tab_Waveform_File.setLayout(tab_Waveform_File_Layout)
        tabs_Waveform.addTab(tab_Waveform_File, 'Arbitrary')

        FileButton = QPushButton()
        FileButton.setText('Click')
        FileButton.clicked.connect(self.Waveform_File_Func)
        tab_Waveform_File_Layout.addRow('Click to select file', FileButton)

        self.Waveform_file = QLineEdit('C:/Users/CNEA/Dropbox/CNEA_v3/Software/CNEAv3_v01/okfp_updating/Raw_Data2.csv')
        tab_Waveform_File_Layout.addRow('Selected file', self.Waveform_file)

        outerLayout.addWidget(tabs_Waveform)


        Control_Waveform_Gen = QWidget()
        Control_Waveform_Gen_Layout = QGridLayout()
        Control_Waveform_Gen.setLayout(Control_Waveform_Gen_Layout)

        SweepLayout = QFormLayout()
        self.Sweep = QLineEdit('1')
        self.Sweep.setMaximumWidth(60)
        SweepLayout.addRow("Sweeps (integer):", self.Sweep)
        RepeatEnLayout = QFormLayout()
        self.RepeatEn = QCheckBox()
        self.RepeatEn.toggled.connect(self.v_stim_mode)
        RepeatEnLayout.addRow("Repeat Enable", self.RepeatEn)


        UpdateLayout = QFormLayout()
        self.Update_Waveform = QPushButton()
        UpdateLayout.addRow("Update", self.Update_Waveform)
        self.Update_Waveform.setMaximumWidth(80)
        self.Update_Waveform.clicked.connect(lambda: self.Disp_Waveform_Typ(self.TypeComboBox.currentIndex()))

        StartLayout = QFormLayout()
        self.Start_Waveform = QPushButton()
        StartLayout.addRow("Start", self.Start_Waveform)
        self.Start_Waveform.setCheckable(True)
        self.Start_Waveform.setChecked(False)
        self.Start_Waveform.setMaximumWidth(80)
        self.Start_Waveform.toggled.connect(self.Waveform_Start)

        Control_Waveform_Gen_Layout.addLayout(SweepLayout, 0, 0)
        Control_Waveform_Gen_Layout.addLayout(RepeatEnLayout, 0, 1)
        Control_Waveform_Gen_Layout.addLayout(UpdateLayout, 1, 1)
        Control_Waveform_Gen_Layout.addLayout(StartLayout, 1, 2)

        outerLayout.addWidget(Control_Waveform_Gen)


    def Waveform_File_Func(self):
        fileName1, filetype = QFileDialog.getOpenFileName(self, "select file", "./",
                                                          "All Files (*) ;; Excel Files (* .xls)")  # set the file extension filter, note double semicolon
        self.Waveform_file.setText(fileName1)
        self.Disp_Waveform_Arb()

    def Upload_Waveform(self):
        self.Disp_Waveform_Typ(self.TypeComboBox.currentIndex())

    def Disp_Waveform_Arb(self):
        self.Waveform_file.text()
        data = np.loadtxt(self.Waveform_file.text())
        self.curves_Waveform[0].setData(data)

    def Disp_Waveform_Typ(self, index):
        Frequency = float(self.Frequency.text())
        Amplitude = float(self.Amplitude.text())
        Offset = float(self.Offset.text())
        Phase = float(self.Phase.text())
        Duty = float(self.Duty.text())
        data_points = 200
        Fsample = int(data_points*Frequency)
        t = np.linspace(0, (1.0/Frequency), data_points, endpoint=False)

        if self.TypeComboBox.itemText(index) == 'Sinwave':
            data = Amplitude * np.sin(2 * np.pi * Frequency * t + (Phase/360) * 2 * np.pi) + Offset
        elif self.TypeComboBox.itemText(index) == 'Triangle':
            data = Amplitude * signal.sawtooth(2 * np.pi * Frequency * t + (Phase/360) * 2 * np.pi, Duty) + Offset
        elif self.TypeComboBox.itemText(index) == 'Pulse':
            data = Amplitude * signal.square(2 * np.pi * Frequency * t + (Phase/360) * 2 * np.pi, Duty) + Offset
        self.curves_Waveform[0].setData(t, data)
        self.Waveform2FPGA_sig.emit(data.tolist(),Fsample)
        # self.Waveform2FPGA(data, Fsample)

    def Waveform2FPGA(self, data_digi, fsample):
        self.serthread.device.send_wire(0x0D, 0x00, 0x00000010)  # Start arbitrary waveform
        self.serthread.device.send_wire(0x0D, 0x00, 0x00000008)  # disable DAC DC output
        self.serthread.device.send_wire(0x11, int(200e6/fsample), 0xFFFFFFFF)  # set the sampling freq of arbitrary waveform
        self.serthread.device.send_wire(0x0E, len(data_digi)-1, 0xFFFFFFFF)  # set the length of the data points to be converted
        for i in range(len(data_digi)):
            address = 0x0000 + i
            self.serthread.device.write_reg(address, int(data_digi[i]/(2.518*2)*65535)) # int(address*41786/2**17)
        self.serthread.device.dac_write(0x04, 0x0A, int(1.7/(2.518*2)*65535))

    def Waveform_Start(self):
        self.serthread.device.send_wire(0x0D, self.RepeatEn.isChecked() << 5, 0x00000020) # send status if infinity sweeps
        self.serthread.device.send_wire(0x0D, (int(self.Sweep.text()) - 1) << 12, 0xFFFFF000)

        self.Disp_Waveform_Typ(self.TypeComboBox.currentIndex())

        self.serthread.device.send_wire(0x0D, 0x00, 0x00000010)  # Stop arbitrary waveform
        usleep(100)
        self.serthread.device.send_wire(0x0D, 0x10, 0x00000010)  # Start arbitrary waveform
        print('Waveform started')


    def vs_ac_pulse_control(self):
        self.VS_Control = QGroupBox("VS_AC_Pulse")
        self.VS_Control.setMaximumHeight(150)
        # Waveform_Gen = QWidget()
        Waveform_Gen_Layout = QGridLayout()
        self.VS_Control.setLayout(Waveform_Gen_Layout)

        TypeLayout = QFormLayout()
        self.vs_TypeComboBox = QComboBox()
        self.vs_TypeComboBox.addItems(['pulse','ac'])
        self.vs_TypeComboBox.setMaximumWidth(80)
        TypeLayout.addRow("Type:", self.vs_TypeComboBox)

        vs_index_Layout = QFormLayout()
        self.vs_index = QLineEdit('4')
        self.vs_index.setMaximumWidth(80)
        vs_index_Layout.addRow("vs_index (1,2,3,4):", self.vs_index)

        DCLayout = QFormLayout()
        self.vs_dc = QLineEdit('1.8')
        self.vs_dc.setMaximumWidth(80)
        DCLayout.addRow("amp_DC (V):", self.vs_dc)

        AmplitudeLayout = QFormLayout()
        self.vs_amp = QLineEdit('1.801')
        self.vs_amp.setMaximumWidth(80)
        AmplitudeLayout.addRow("amp_peak (V):", self.vs_amp)

        FrequencyLayout = QFormLayout()
        self.vs_freq = QLineEdit('1')
        self.vs_freq.setMaximumWidth(80)
        FrequencyLayout.addRow("freq (Hz):", self.vs_freq)

        DutyLayout = QFormLayout()
        self.vs_duty  = QLineEdit('0.002')
        self.vs_duty.setMaximumWidth(80)
        DutyLayout.addRow("Duty (0 ~ 1)", self.vs_duty)

        Update = QPushButton("Update")
        Update.setMaximumWidth(60)
        Update.clicked.connect(self.update_vs_ac_pulse)

        Waveform_Gen_Layout.addLayout(TypeLayout, 0, 0)
        Waveform_Gen_Layout.addLayout(vs_index_Layout, 0, 1)
        Waveform_Gen_Layout.addLayout(DCLayout, 0, 2)
        Waveform_Gen_Layout.addLayout(AmplitudeLayout, 1, 0)
        Waveform_Gen_Layout.addLayout(FrequencyLayout, 1, 1)
        Waveform_Gen_Layout.addLayout(DutyLayout, 1, 2)
        Waveform_Gen_Layout.addWidget(Update, 2, 2)

    def update_vs_ac_pulse(self):
        vs_type = self.vs_TypeComboBox.currentText()
        vs_index = self.vs_index.text()
        vs_dc = self.vs_dc.text()
        vs_amp = self.vs_amp.text()
        vs_freq = self.vs_freq.text()
        vs_duty = self.vs_duty.text()
        param_list = [vs_type, vs_index, vs_dc, vs_amp, vs_freq, vs_duty]
        self.vs_ac_pulse_sig.emit(param_list)

    def v_stim_control(self):
        self.Waveform_trig_sig.emit()

    def i_stim_control(self):
        self.CI_write_sig.emit(self.stim_I.isChecked())

    def v_stim_mode(self):
        self.Waveform_repeat_mode_sig.emit(self.RepeatEn.isChecked(), self.Sweep.text())

    def CLKs_control(self):
        self.CLKs_enable_sig.emit(self.stim_CLK1.isChecked(), self.stim_CLK2.isChecked(), self.stim_CLK3.isChecked(), self.stim_CLK_all.isChecked())

    def DDR3_control(self):
        self.DDR3_enable_sig.emit(self.stim_OCP.isChecked(), self.OCP_on.text(), self.OCP_off.text())
        # print(self.OCP_on.text())

    def SD_control(self):
        self.SD_enable_sig.emit(self.enable_detect.isChecked(), float(self.sigma_detect.text()))

        if self.enable_detect.isChecked():
            self.enable_detect.setText('Click to disable SD')
        else:
            self.enable_detect.setText('Click to enable SD')


    def createArrayConfigTable(self):
        self.ArrayConfigTable = QTableWidget(19, 4) # was 31 from v3
        self.ArrayConfigTable.verticalHeader().setVisible(False)
        self.ArrayConfigTable.horizontalHeader().setVisible(False)
        TableItems = ['AMP_EN', 'VS1_VP', 'VS2_VP', 'VS3_VP', 'VE_VP', 'VE_EN', 'VE_CAP_VN', 'VS4_CAP_VN', 'VS4_DIO_VN',
                      'CF1', 'CF2', 'CF3', 'RF1_B', 'RF2_B', 'RF3_B', 'VC_MODE', 'R_DIO', 'R_PSU', 'DCI_EN', 'DCI_DIR', 'SC_DIR',
                      'DCI_SEL0', 'DCI_SEL1', 'SC_EN_CAP1', 'SC_EN_CAP2', 'EN_CLK1', 'EN_CLK2', 'EN_CLK3', 'SM_VE1', 'SM_VE2', 
                      'SM_R', 'SM_C', 'CL1_EN', 'CL2_EN', 'OTA_BIAS_EN', 'CI_BIAS_EN', 'TIN_EN', 'TOUT_EN']
        self.ArrayConfigTableConfig(0)
        for i in range(19): # was 31 from v3
            self.ArrayConfigTable.setItem(i, 0, QTableWidgetItem(TableItems[i]))
            self.ArrayConfigTable.setItem(i, 2, QTableWidgetItem(TableItems[i+19]))

    def createArrayConfigTable2(self):
        self.pixelGroupBox = QGroupBox('Pixel Config')
        tab_v_box = QVBoxLayout()
        tab_v_box.setContentsMargins(5, 5, 5, 5)

        # TableItems = ['Sites', 'AmpMode', 'HexCode']
        TableItems = ['Sites', 'AmpMode', 'BinCode']
        self.ArrayConfigTable2 = QTableWidget(11, len(TableItems))
        self.ArrayConfigTable2.setColumnWidth(0, 180)
        self.ArrayConfigTable2.setColumnWidth(1, 120)
        self.ArrayConfigTable2.setColumnWidth(2, 155)
        self.ArrayConfigTable2.verticalHeader().setVisible(False)
        self.ArrayConfigTable2.horizontalHeader().setVisible(True)
        self.ArrayConfigTable2.setHorizontalHeaderLabels(TableItems)

        Update = QtWidgets.QPushButton("Update Pixel Settings")
        Update.setStyleSheet(
            'QPushButton {background-color: rgb(190,159,229);} QPushButton::checked {background-color : red;}')
        Update.setMaximumWidth(160)
        Update.clicked.connect(self.update_pixel_command)
        tab_v_box.addWidget(self.ArrayConfigTable2)
        tab_v_box.addWidget(Update)
        self.pixelGroupBox.setLayout(tab_v_box)

    @pyqtSlot()
    def update_pixel_command(self):
        pixel_param_temp = 0x00_0000_0000
        pixel_param = []
        for index in range(19): 
            pixel_param_temp += 2**index*int(self.ArrayConfigTable.item(index, 1).text()) + \
                           2**(19+index)*int(self.ArrayConfigTable.item(index, 3).text())
        pixel_param.append(pixel_param_temp)

        self.ArrayConfigTable2.setItem(0, 0, QTableWidgetItem('All sites')) # add default configuration to the first row of the table
        self.ArrayConfigTable2.setItem(0, 1, QTableWidgetItem(self.RecordModeComboBox.currentText()))
        # self.ArrayConfigTable2.setItem(0, 2, QTableWidgetItem(str(hex(pixel_param_temp))))
        self.ArrayConfigTable2.setItem(0, 2, QTableWidgetItem(str(format(pixel_param_temp,'038b'))))

        self.stim_pixel_gen_sig.emit(self.pixel_to_sweep, self.pixel_param)
        self.pixel_config_sig.emit(pixel_param)


    # @pyqtSlot(int)
    def ArrayConfigTableConfig(self, index):
        for i in range(19): # go back to default state
            self.ArrayConfigTable.setItem(i, 1, QTableWidgetItem('0'))
            self.ArrayConfigTable.setItem(i, 3, QTableWidgetItem('0'))
        if self.RecordModeComboBox.itemText(index) == 'Buffer Mode':
            ConfigBits = format(0x2400017003, '038b')
            for i in range(19):
                self.ArrayConfigTable.setItem(i, 1, QTableWidgetItem(ConfigBits[37 - i]))
                self.ArrayConfigTable.setItem(i, 3, QTableWidgetItem(ConfigBits[18 - i]))

        elif self.RecordModeComboBox.itemText(index) == 'GainX300_Inv_Bio':
            ConfigBits = format(0x2420014343, '038b')  # 3 diode, 4.6fF, enable Vs4_R, disable H_CLK1
            for i in range(19):
                self.ArrayConfigTable.setItem(i, 1, QTableWidgetItem(ConfigBits[37 - i]))
                self.ArrayConfigTable.setItem(i, 3, QTableWidgetItem(ConfigBits[18 - i]))

        elif self.RecordModeComboBox.itemText(index) == 'GainX100_Inv_Bio':
            ConfigBits = format(0x2420014743, '038b')  # 3 diode, 21.4fF, enable Vs4_R, disable H_CLK1
            for i in range(19):
                self.ArrayConfigTable.setItem(i, 1, QTableWidgetItem(ConfigBits[37 - i]))
                self.ArrayConfigTable.setItem(i, 3, QTableWidgetItem(ConfigBits[18 - i]))

        elif self.RecordModeComboBox.itemText(index) == 'GainX40_Inv_Bio':
            ConfigBits = format(0x2420014F43, '038b') # 3 diode, 103.1fF, enable Vs4_R, disable H_CLK1
            for i in range(19):
                self.ArrayConfigTable.setItem(i, 1, QTableWidgetItem(ConfigBits[37 - i]))
                self.ArrayConfigTable.setItem(i, 3, QTableWidgetItem(ConfigBits[18 - i]))

        elif self.RecordModeComboBox.itemText(index) == 'Device_Test':
            ConfigBits = format(0x2400014e83, '038b') # 
            for i in range(19):
                self.ArrayConfigTable.setItem(i, 1, QTableWidgetItem(ConfigBits[37 - i]))
                self.ArrayConfigTable.setItem(i, 3, QTableWidgetItem(ConfigBits[18 - i]))

        elif self.RecordModeComboBox.itemText(index) == 'GainX40':
            ConfigBits = format(0x2420014e91, '038b') # 3 diodes, x fF, disable Vs4_R
            for i in range(19):
                self.ArrayConfigTable.setItem(i, 1, QTableWidgetItem(ConfigBits[37 - i]))
                self.ArrayConfigTable.setItem(i, 3, QTableWidgetItem(ConfigBits[18 - i]))

        elif self.RecordModeComboBox.itemText(index) == 'GainX100':
            ConfigBits = format(0x2420014691, '038b') # 3 diodes, x fF, disable Vs4_R
            for i in range(19):
                self.ArrayConfigTable.setItem(i, 1, QTableWidgetItem(ConfigBits[37 - i]))
                self.ArrayConfigTable.setItem(i, 3, QTableWidgetItem(ConfigBits[18 - i]))

        elif self.RecordModeComboBox.itemText(index) == 'GainX300':
            ConfigBits = format(0x2420014291, '038b') # 3 diodes, x fF, disable Vs4_R
            for i in range(19):
                self.ArrayConfigTable.setItem(i, 1, QTableWidgetItem(ConfigBits[37 - i]))
                self.ArrayConfigTable.setItem(i, 3, QTableWidgetItem(ConfigBits[18 - i]))

    def StimulationPatternConfig(self):
        self.pixel_to_sweep = []
        self.pixel_param = []
        self.StimOnTable = QTableWidget(32, 32)
        self.StimOnTable.verticalHeader().setVisible(True)
        self.StimOnTable.horizontalHeader().setVisible(True)
        # self.StimOnTable.gridStyle()
        for i in range(32):
            self.StimOnTable.setColumnWidth(i,4)
            self.StimOnTable.setRowHeight(i,4)

        self.tabs_StimPattern = QTabWidget()

        tab_Site_List = QWidget()  # list input tab page
        tab_Site_List_Layout = QGridLayout()
        tab_Site_List.setLayout(tab_Site_List_Layout)
        self.tabs_StimPattern.addTab(tab_Site_List, 'List Input')

        ArbSiteLayout = QFormLayout()
        self.Arb_site = QLineEdit('0916')
        # self.Arb_site.setMaximumWidth(40)
        ArbSiteLayout.addRow("Separate with comma", self.Arb_site)

        ArbEnableLayout = QFormLayout()
        self.ArbEnableCheckBox = QCheckBox()
        self.ArbEnableCheckBox.setChecked(False)
        ArbEnableLayout.addRow("Enable", self.ArbEnableCheckBox)


        StartLayout = QFormLayout()
        self.Start_site = QLineEdit('0101')
        self.Start_site.setMaximumWidth(40)
        StartLayout.addRow("From", self.Start_site)
        EndLayout = QFormLayout()
        self.End_site = QLineEdit('6464')
        self.End_site.setMaximumWidth(40)
        EndLayout.addRow("To", self.End_site)
        StepLayout = QFormLayout()
        self.Step_size = QLineEdit('64')
        self.Step_size.setMaximumWidth(40)
        StepLayout.addRow("Step", self.Step_size)

        ListEnableLayout = QFormLayout()
        self.ListEnableCheckBox = QCheckBox()
        self.ListEnableCheckBox.setChecked(False)
        ListEnableLayout.addRow("Enable", self.ListEnableCheckBox)

        tab_Site_List_Layout.addLayout(ArbSiteLayout, 0, 0)
        tab_Site_List_Layout.addLayout(ArbEnableLayout, 0, 1)
        tab_Site_List_Layout.addLayout(StartLayout, 1, 0)
        tab_Site_List_Layout.addLayout(EndLayout, 1, 1)
        tab_Site_List_Layout.addLayout(StepLayout, 1, 2)
        tab_Site_List_Layout.addLayout(ListEnableLayout, 1, 3)

        tab_Site_File = QWidget() #  sites selection from a file tab page
        tab_Site_File_Layout = QFormLayout()
        tab_Site_File.setLayout(tab_Site_File_Layout)
        self.tabs_StimPattern.addTab(tab_Site_File, 'From File')


        FileButton = QPushButton()
        FileButton.setText('Click')
        FileButton.clicked.connect(self.Site_File_Func)
        tab_Site_File_Layout.addRow('Click to select file', FileButton)
        self.Site_file = QLineEdit('./Stim_Pixels.csv')
        tab_Site_File_Layout.addRow('Selected file', self.Site_file)

        self.ApplyButton = QPushButton()
        self.ApplyButton.setText('Apply/ADD')
        self.ApplyButton.clicked.connect(self.Stim_Pixel_Gen)

        self.ClearButton = QPushButton()
        self.ClearButton.setText('Clear')
        self.ClearButton.clicked.connect(self.Stim_Pixel_Clear)


        self.DeleteButton = QPushButton()
        self.DeleteButton.setText('Delete')
        self.DeleteButton.clicked.connect(self.Stim_Pixel_Delete)


        self.Stim_Site_Layout = QVBoxLayout()
        self.Stim_Site_Layout.addWidget(self.StimOnTable)
        # self.Stim_Site_Layout.addWidget(self.tabs_StimPattern)
        # self.Stim_Site_Layout.addWidget(self.ApplyButton)

    def Site_File_Func(self):
        fileName1, filetype = QFileDialog.getOpenFileName(self, "select file", "./",
                                                          "All Files (*) ;; Excel Files (* .xls)")  # set the file extension filter, note double semicolon
        self.Site_file.setText(fileName1)
        self.pixel_to_sweep.append(np.loadtxt(fileName1, delimiter=",", dtype=int))
        for site in self.pixel_to_sweep[-1].tolist():
            self.StimOnTable.setItem(int(site/64), int(site%64), QTableWidgetItem("1"))


    def Stim_Pixel_Gen(self):
        if self.ArbEnableCheckBox.isChecked():
            arbsites = self.Arb_site.text().split(',')
            arbsites = [((int(i[0:2]) - 1) * 64 + int(i[2:4]) - 1) for i in arbsites]  # convert site format
            self.pixel_to_sweep.append(np.array(arbsites, dtype=np.int32))
        elif self.ListEnableCheckBox.isChecked():
            start = (int(self.Start_site.text()[0:2])-1)*64 + int(self.Start_site.text()[2:4])-1
            end = (int(self.End_site.text()[0:2])-1)*64 + int(self.End_site.text()[2:4]) # including the endpoint
            step = int(self.Step_size.text())
            self.pixel_to_sweep.append(np.arange(start, end, step, dtype=np.int32))
        try:
            pixel_param = 0x00_0000_0000
            for index in range(19):
                pixel_param += 2**index*int(self.ArrayConfigTable.item(index, 1).text()) + \
                               2**(19+index)*int(self.ArrayConfigTable.item(index, 3).text())
            self.pixel_param.append(pixel_param)

            i = len(self.pixel_to_sweep) # write configuration info to the tablewidget
            self.ArrayConfigTable2.setItem(i, 0, QTableWidgetItem(str(self.pixel_to_sweep[-1]))) # sites
            self.ArrayConfigTable2.setItem(i, 1, QTableWidgetItem(self.RecordModeComboBox.currentText()))
            self.ArrayConfigTable2.setItem(i, 2, QTableWidgetItem(str(hex(pixel_param))))

            self.stim_pixel_gen_sig.emit(self.pixel_to_sweep, self.pixel_param)
        except:
            print('Make sure you check the enable')

    def Stim_Pixel_Clear(self):
        self.pixel_to_sweep = []
        self.pixel_param = []
        self.ArrayConfigTable2.clearContents()

    def Stim_Pixel_Delete(self):
        print(self.pixel_to_sweep)
        print(self.pixel_param)
        # self.ArrayConfigTable2.clearContents()

    def createPulseConfigTable(self):
        self.PulseConfigTable = QTableWidget(32, 4)
        self.PulseConfigTable.verticalHeader().setVisible(False)
        self.PulseConfigTable.horizontalHeader().setVisible(False)

        TableItems = ['EN_PG', 't_DEAD[9]', 't_DEAD[8]', 't_DEAD[7]','t_DEAD[6]','t_DEAD[5]','t_DEAD[4]','t_DEAD[3]',
                      't_DEAD[2]','t_DEAD[1]','t_DEAD[0]',
                      'CLK_DEAD[10]','CLK_DEAD[9]','CLK_DEAD[8]','CLK_DEAD[7]','CLK_DEAD[6]','CLK_DEAD[5]',
                      'CLK_DEAD[4]','CLK_DEAD[3]','CLK_DEAD[2]','CLK_DEAD[1]','CLK_DEAD[0]',
                      't_DURATION[9]','t_DURATION[8]','t_DURATION[7]','t_DURATION[6]','t_DURATION[5]','t_DURATION[4]',
                      't_DURATION[3]','t_DURATION[2]','t_DURATION[1]','t_DURATION[0]',
                      'CLK_DURATION[10]', 'CLK_DURATION[9]','CLK_DURATION[8]','CLK_DURATION[7]','CLK_DURATION[6]',
                      'CLK_DURATION[5]','CLK_DURATION[4]','CLK_DURATION[3]','CLK_DURATION[2]','CLK_DURATION[1]','CLK_DURATION[0]',
                      't_DELAY[9]','t_DELAY[8]','t_DELAY[7]','t_DELAY[6]','t_DELAY[5]','t_DELAY[4]','t_DELAY[3]',
                      't_DELAY[2]','t_DELAY[1]','t_DELAY[0]',
                      'CLK_DELAY[10]','CLK_DELAY[9]','CLK_DELAY[8]','CLK_DELAY[7]','CLK_DELAY[6]','CLK_DELAY[5]',
                      'CLK_DELAY[4]','CLK_DELAY[3]','CLK_DELAY[2]','CLK_DELAY[1]','CLK_DELAY[0]']

        for i in range(32):
            self.PulseConfigTable.setItem(i, 0, QTableWidgetItem(TableItems[i]))
            self.PulseConfigTable.setItem(i, 1, QTableWidgetItem('0'))
            self.PulseConfigTable.setItem(i, 2, QTableWidgetItem(TableItems[i+32]))
            self.PulseConfigTable.setItem(i, 3, QTableWidgetItem('0'))

    def createPulseConfigTable2(self):

        self.pgGroupBox = QGroupBox('PG Config')
        tab_v_box = QVBoxLayout()
        tab_v_box.setContentsMargins(5, 5, 5, 5)

        TableItems = ['PG_ID', 'ENABLE', 't_DEAD', 'CLK_DEAD', 't_Duration', 'CLK_Duration', 't_DELAY', 'CLK_DELAY', 'If_Config']
        self.PulseConfigTable2 = QTableWidget(11, len(TableItems))
        self.PulseConfigTable2.verticalHeader().setVisible(False)
        self.PulseConfigTable2.horizontalHeader().setVisible(False)
        self.PulseConfigTable2.setColumnWidth(0, 40)
        self.PulseConfigTable2.setColumnWidth(1, 50)
        self.PulseConfigTable2.setColumnWidth(2, 50)
        for i in range(6): # set the width of columns
            self.PulseConfigTable2.setColumnWidth(i+3, 65)

        for i in range(len(TableItems)):
            self.PulseConfigTable2.setItem(0, i, QTableWidgetItem(TableItems[i]))

        for i in np.linspace(1, 11, 10, endpoint=False, dtype=int):
            self.PulseConfigTable2.setItem(i, 0, QTableWidgetItem(str(i-1)))
            self.PulseConfigTable2.setItem(i, 1, QTableWidgetItem('0'))
            self.PulseConfigTable2.setItem(i, 2, QTableWidgetItem('100'))
            self.PulseConfigTable2.setItem(i, 3, QTableWidgetItem('1024'))
            self.PulseConfigTable2.setItem(i, 4, QTableWidgetItem('20'))
            self.PulseConfigTable2.setItem(i, 5, QTableWidgetItem('1024'))
            self.PulseConfigTable2.setItem(i, 6, QTableWidgetItem('2'))
            self.PulseConfigTable2.setItem(i, 7, QTableWidgetItem('1024'))
            self.PulseConfigTable2.setItem(i, 8, QTableWidgetItem('0'))

        Update = QtWidgets.QPushButton("Update")
        Update.setMaximumWidth(60)
        Update.clicked.connect(self.update_pg_command)
        tab_v_box.addWidget(self.PulseConfigTable2)
        tab_v_box.addWidget(Update)
        self.pgGroupBox.setLayout(tab_v_box)

    @pyqtSlot()
    def update_pg_command(self):
        pulse_param = np.zeros((10, 3))
        for i in range(10):
            pg_enable = int(self.PulseConfigTable2.item(i+1, 1).text())
            t_dead = int(self.PulseConfigTable2.item(i+1, 2).text())
            clk_dead = int(self.PulseConfigTable2.item(i+1, 3).text())
            t_duration = int(self.PulseConfigTable2.item(i+1, 4).text())
            clk_duration = int(self.PulseConfigTable2.item(i + 1, 5).text())
            t_delay = int(self.PulseConfigTable2.item(i+1, 6).text())
            clk_delay = int(self.PulseConfigTable2.item(i + 1, 7).text())
            if_config = int(self.PulseConfigTable2.item(i + 1, 8).text())
            pulse_param[i, 2] = if_config
            pulse_param[i, 1] = t_duration + (clk_dead << 10) + (t_dead << 21) + (pg_enable << 31)
            pulse_param[i, 0] = clk_delay + (t_delay << 11) + (clk_duration << 21)
        self.pg_config_sig.emit(pulse_param)

    @pyqtSlot()
    def sys_setting(self):
        bias_param = np.zeros(20)
        for index in range(20):
            bias_param[index] = float(self.Bias_tableWidget.item(index, 1).text())
        bias_param = bias_param/(2.518*2)*65535


        pixel_param_temp = 0x0000_0000_0000_0000
        pixel_param = []
        for index in range(19):
            pixel_param_temp += 2**index*int(self.ArrayConfigTable.item(index, 1).text()) + \
                           2**(19+index)*int(self.ArrayConfigTable.item(index, 3).text())
        pixel_param.append(pixel_param_temp)

        self.ArrayConfigTable2.setItem(0, 0, QTableWidgetItem('All sites')) # add default configuration to the first row of the table
        self.ArrayConfigTable2.setItem(0, 1, QTableWidgetItem(self.RecordModeComboBox.currentText()))
        self.ArrayConfigTable2.setItem(0, 2, QTableWidgetItem(str(hex(pixel_param_temp))))

        pulse_param = np.zeros((10, 3))
        for i in range(10):
            pg_enable = int(self.PulseConfigTable2.item(i+1, 1).text())
            t_dead = int(self.PulseConfigTable2.item(i+1, 2).text())
            clk_dead = int(self.PulseConfigTable2.item(i+1, 3).text())
            t_duration = int(self.PulseConfigTable2.item(i+1, 4).text())
            clk_duration = int(self.PulseConfigTable2.item(i + 1, 5).text())
            t_delay = int(self.PulseConfigTable2.item(i+1, 6).text())
            clk_delay = int(self.PulseConfigTable2.item(i + 1, 7).text())
            if_config = int(self.PulseConfigTable2.item(i + 1, 8).text())
            pulse_param[i, 2] = if_config
            pulse_param[i, 1] = t_duration + (clk_dead << 10) + (t_dead << 21) + (pg_enable << 31)
            pulse_param[i, 0] = clk_delay + (t_delay << 11) + (clk_duration << 21)

        self.stim_pixel_gen_sig.emit(self.pixel_to_sweep, self.pixel_param)
        self.system_config_sig.emit(bias_param, pixel_param, pulse_param)
        self.ref_temp_update_sig.emit(self.ref_status, self.temp_status, self.lpf_status, self.mux_status)

        self.data_path_create_sig.emit(self.Current_Device.text(), self.RecordModeComboBox.currentText())
        self.duration_sig.emit(self.Duration.text())
        self.NR_enable_sig.emit(self.NR_EN.isChecked())


    @pyqtSlot()
    def start_recording(self):
        if self.start_rec.isChecked():
            # self.sys_setting() # combine sysconfig with start
            self.data_path_create_sig.emit(self.Current_Device.text(), self.RecordModeComboBox.currentText())
            self.duration_sig.emit(self.Duration.text())
            print('Start Recording!')
            self.start_rec.setText('Click to stop')
            self.toggle_recording_sig.emit(True)
            self.site_selection()
            self.Start_Time.setText(QDateTime.currentDateTime().toString())
            self.display_timer.start(5)  # update every 5 ms

        else:
            print('Stop Recording!')
            self.start_rec.setText('Click to start')
            self.toggle_recording_sig.emit(False)
            # self.serthread.adc_ic_control(Enable=0)
            self.display_timer.stop() 

    @pyqtSlot()
    def ic_display(self, curves):
        self.curves = curves

###################

    @pyqtSlot(np.ndarray)
    def data_fetch_pcb(self):
        if not np.array_equal(self.pcb_disp_data[0, -20:], self.shared_data[2028:2048, 2].T): # check if the data is updated
            data = self.shared_data[0:2048, 0:8] # get the data from shared memory
            offset = 0 # uA
            I_meas = (data[:, 1]-data[:,4] - offset) * 1e3 # nA
            I_av = round(np.average(I_meas),4)

            # plot VS1 =2
            self.pcb_disp_data[0, 0:-self.batch_size_pcb] = self.pcb_disp_data[0, self.batch_size_pcb:] # shift the data to the left
            self.pcb_disp_data[0, -self.batch_size_pcb:] = data[:,2] # add the new data to the end of the array
            self.curve_PCB2.setData(self.pcb_disp_x_axis, self.pcb_disp_data[0, :]) # update the data

            # plot measured current with TIA on PCB
            self.pcb_disp_data[1, 0:-self.batch_size_pcb] = self.pcb_disp_data[1, self.batch_size_pcb:] # shift the data to the left
            self.pcb_disp_data[1, -self.batch_size_pcb:] = I_meas # add the new data to the end of the array
            self.curves_PCB[0].setData(self.pcb_disp_x_axis, self.pcb_disp_data[1, :]) # update the data

            order = [2, 3, 4, 5, 6, 7, 0, 1] # the data reading order is mixed
            
            VTEMP = round(np.average(data[:, order[3]]), 3)
            temp = (VTEMP - 0.7)/0.06 + 35
            self.tableWidget.setItem(3, 1, QTableWidgetItem(str(VTEMP) + ' ('+ str(temp)[0:4]+' C)'))
            self.tableWidget.setItem(7, 1, QTableWidgetItem(str(round(np.average(data[:, order[7]]), 3))+' ('+ str(I_av)+ ' nA)'))
            for i in [0, 1, 2, 4, 5, 6]:
                self.tableWidget.setItem(i, 1, QTableWidgetItem(str(round(np.average(data[:, order[i]]), 3))))

    @pyqtSlot()
    def data_fetch_ic(self):
        # start_time= time.perf_counter()
        if not np.array_equal(self.data_disp[0, -20:], self.shared_data[self.sites[0], -20:]): # check if the data is updated
            data = self.shared_data[0:4096,-self.batch_size::]
            self.ic_disp_averaged = np.zeros(self.ic_disp_length)
            for i in range(self.nPlots): # display the typed sites waveform
                self.data_disp[i, 0:-self.batch_size] = self.data_disp[i, self.batch_size:] # shift the data to the left
                self.data_disp[i, -self.batch_size:] = data[self.sites[i], -self.batch_size:]  # + np.random.rand(self.batch_size)/1000 # add the new data to the end of the array

                self.curves[i].setData(self.ic_disp_x_axis, self.data_disp[i, :]) # update the data
                self.ic_disp_averaged = self.ic_disp_averaged + self.data_disp[i, :] # accumulate the data

            # self.curves_NR[0].setData(self.ic_disp_x_axis, self.ic_disp_averaged/(i + 1))

            DC_level = np.reshape(np.average(data, axis=1),(64,64))
            DC_level = np.fliplr(DC_level) # reverse back the column order
            self.curve_DC.setData(self.site_conv_DC, DC_level.flatten()) # xais is the row-col format
            self.spike_fetch_ic() # update the spike count

        self.data_fetch_pcb() # update the pcb data display
        # print('disp time:', time.perf_counter() - start_time)

    @pyqtSlot(np.ndarray)
    def spike_fetch_ic(self):  # generate data
        self.data_spike_ic += self.shared_data[0:4096,8] # get the spike count (8th column) from the shared memory
        for i in range(4096):
            self.spike_temp[self.site_conv[i]] = self.data_spike_ic[i]
        temp = self.spike_temp * self.sites_non_removed
        self.curve_spike.setData(temp)
        temp = temp > (self.disp_threshold - 0.1)
        temp = np.nonzero(temp)[0]
        if not np.array_equal(temp, self.spiking_sites):
            spiking_sites_new = np.setdiff1d(temp, self.spiking_sites)
            self.spiking_sites = temp
            sites_to_add = [str(int(i/64)+1).zfill(2) + str(int(i%64) + 1).zfill(2) for i in spiking_sites_new] # format sites
            self.list_spike.addItems(sites_to_add)

    def site_selection(self):
        self.sites = self.display_sites.text().split(',')
        ###### commented on 07/22/2024
        line_legend = self.sites
        sites_converted = [((int(i[0:2])-1)*64 + int(i[2:4])-1) for i in self.sites] # convert site format
        self.sites = [self.site_conv[i] for i in sites_converted]

        self.nPlots = len(self.sites)

        self.data_disp = np.zeros((self.nPlots, self.ic_disp_length))

        line_num = (len(self.curves))
        line_NR_num = (len(self.curves_NR))
        for i in range(line_num): # clear all the lines
            self.plotW.removeItem(self.curves[i])

        for i in range(line_NR_num): # clear all the lines
            self.plotW_NR.removeItem(self.curves_NR[i])

        self.curves = []
        self.curves_NR = []
        self.legend_fd.clear() # clear old legend of data
        self.legend_fd_NR.clear() # clear old legend of averaged data
        for self.idx in range(self.nPlots):
            self.curve = pg.PlotCurveItem(pen=pg.mkPen(self.idx+6), name=line_legend[self.idx])
            self.plotW.addItem(self.curve)
            self.curves.append(self.curve)

        self.curve_NR = pg.PlotCurveItem(pen=pg.mkPen(self.idx+6), name='NR')
        self.plotW_NR.addItem(self.curve_NR)
        self.curves_NR.append(self.curve_NR)

        print(self.sites)

    def site_display_byclick(self):
        site_index = self.list_spike.currentItem().text()
        self.display_sites.setText(site_index)
        self.site_selection() # update legend
        print(self.sites[0])

    def list_spike_reset(self):
        self.data_spike_ic = np.zeros(4096)
        # for i in range(50):
        #     command_queue.put({"type": "reset_spike"}) # tell subprocess to reset spike count
        self.spiking_sites = []
        self.list_spike.clear()
        # self.disp_threshold = float(self.threshold_disp.text())

    def list_spike_threshold(self):
        self.spiking_sites = []
        self.list_spike.clear()
        self.disp_threshold = float(self.threshold_disp.text())

    def list_to_remove(self):
        site_index = self.list_spike.selectedItems()
        for SelectedItem in self.list_spike.selectedItems():
            self.list_spike.takeItem(self.list_spike.row(SelectedItem))
        for site in site_index:
            self.list_removed.addItem(site.text())
            site_text = site.text()
            site_value = (int(site_text[0:2]) - 1) * 64 + int(site_text[2:4])-1 # convert format back
            self.sites_non_removed[site_value] = 0
        # self.spiking_sites = []
        # self.list_spike.clear()

    def list_to_add(self):
        site_index = self.list_removed.selectedItems()
        for SelectedItem in self.list_removed.selectedItems():
            self.list_removed.takeItem(self.list_removed.row(SelectedItem))
        for site in site_index:
            # self.list_spike.addItem(site.text())
            site_text = site.text()
            site_value = (int(site_text[0:2]) - 1) * 32 + int(site_text[2:4])-1 # convert format back
            self.sites_non_removed[site_value] = 1

    def test_command_func(self):
        self.serthread.test_command = int(self.test_command.text())
        self.serthread.device.send_wire(0x10, self.serthread.test_command << 16, 0x0007_0000)
        print(int(self.test_command.text()))

    @pyqtSlot(bool)
    def button_status_update(self, status):
        self.start_rec.setChecked(False)
        self.start_rec.setText('Click to start')

    @pyqtSlot()
    def disp_len_refresh(self):
        length = 240*int(self.disp_len.text())
        self.ic_disp_x_axis = 2*np.arange(length)/(1e6/128)
        self.serthread.data_disp_ic = np.zeros((4096, length))

    @pyqtSlot()
    def noise_reduction(self):
        if self.NR_EN.isChecked(): 
            print('Common mode noise reduction is enabled.')
        else:
            print('Common mode noise reduction is off.')
        self.NR_enable_sig.emit(self.NR_EN.isChecked())

    @pyqtSlot()
    def time_refresh(self):
        self.Duration_Passed.setText(str(int(self.serthread.iteration_index*self.serthread.chunk*51.2/1000)+1))
        self.Current_Time.setText(QDateTime.currentDateTime().toString())

    def closeEvent(self, event):
        close = QMessageBox()
        close.setWindowTitle('CNEAv5')
        close.setStyleSheet('background-color: rgb(255,198,129);')
        close.setText("Sure to Exit?")
        close.setStandardButtons(QMessageBox.Yes | QMessageBox.Cancel)
        close = close.exec()

        if close == QMessageBox.Yes:
            self.shutdown_sig.emit()
            self.display_timer.stop()
            self.app_timer.stop()
            time.sleep(0.5)
            self.close()
            app.quit()
            # try: #there is a bug that closeEvent exits twice after click Exit button
            #     event.accept()
            # except:
            #     pass
        # else:
        #     try:
        #         event.ignore()
        #     except:
        #         pass


def cleanup():
    command_queue_process_pcb.put({'program_exit': True})  # tell your subprocess to stop
    command_queue_process_ic.put({'program_exit': True})  # tell your subprocess to stop
    command_queue_save.put({'program_exit': True})

    data_proc_pcb.join(timeout=3)
    data_proc_ic.join(timeout=3)
    data_proc_save.join(timeout=3)

    shm.close()
    shm.unlink()


if __name__ == '__main__':
    app = QApplication(sys.argv)
    app.setStyle('Fusion')
    main_window = MainWindow() # main  window for measurement control and data view
    main_window.show()
    # main_window.move(-3000, 400)
    main_window.showMaximized()

    data_proc_save = Process(target=data_process_saving, args=(data_queue, data_queue_relay, command_queue_save))
    data_proc_ic = Process(target=data_process_ic, args=(data_queue_relay, data_queue_pcb, command_queue_process_ic, shm.name))
    data_proc_pcb = Process(target=data_process_pcb, args=(data_queue_pcb, command_queue_process_pcb, shm.name))
    
    data_proc_save.start()
    data_proc_ic.start()
    data_proc_pcb.start()
    

    exit_code = app.exec_()
    cleanup()
    sys.exit(exit_code)

