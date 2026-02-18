from __future__ import unicode_literals
import os.path
import struct

import ok
import sys
import time

import itertools

import string
import numpy as np
import scipy.fftpack
import matplotlib.pyplot as plt
import pyqtgraph as pg
import serial
import scipy.misc

from CNEAv3 import CNEAv3

usleep = lambda x: time.sleep(x / 1000000.0)
from PyQt5.QtCore import QThread, pyqtSignal, QTimer, QObject, QRunnable, pyqtSlot, QThreadPool



class WorkerSignals(QObject):
    finished = pyqtSignal()
    error = pyqtSignal(tuple)
    result = pyqtSignal(object)
    progress_ic = pyqtSignal(np.ndarray)
    progress_ic_spike = pyqtSignal(np.ndarray)
    progress_pcb = pyqtSignal(np.ndarray)
    # progress_dummy = pyqtSignal(int)

class Worker(QRunnable):
    def __init__(self, fn, *args, **kwargs):
        super(Worker, self).__init__()

        # Store constructor arguments (re-used for processing)
        self.fn = fn
        self.args = args
        self.kwargs = kwargs
        self.signals = WorkerSignals()

        # Add the callback to our kwargs
        self.kwargs['progress_callback_ic'] = self.signals.progress_ic
        self.kwargs['progress_callback_ic_spike'] = self.signals.progress_ic_spike

        self.kwargs['progress_callback_pcb'] = self.signals.progress_pcb

        # self.kwargs['dummy'] = self.signals.progress_dummy

    @pyqtSlot()
    def run(self):
        '''
        Initialise the runner function with passed args, kwargs.
        '''

        # Retrieve args/kwargs here; and fire processing using them
        try:
            result = self.fn(*self.args, **self.kwargs)
        except:
            traceback.print_exc()
            exctype, value = sys.exc_info()[:2]
            self.signals.error.emit((exctype, value, traceback.format_exc()))
        else:
            self.signals.result.emit(result)  # Return the result of the processing
        finally:
            self.signals.finished.emit()  # Done



class SerialThread(QThread):

    ic_data_to_update = pyqtSignal(np.ndarray)
    pcb_data_to_update = pyqtSignal(np.ndarray)

    def __init__(self, ui, bitstreamFile):

        # State variables

        self.state_shutdown = False
        # Setup

        QThread.__init__(self)
        self.device = CNEAv3(bitstreamFile)
        if not self.device.initialize_device():
            print("Failure to Initialize Device")
            sys.exit()
        else:
            print("FPGA configuration complete, starting FrontPanel interface")

        self.device.send_reset()
        self.device.pcb_config_write(1, 0x0000, 0x00)
        self.device.dac_init()
        self.device.ads8688_init()
        self.device.stim_clk_init(100, 200, 1, 125)  # configure the division factor of main clock to generate the stimulation CLKs

        self.device.send_wire(0x00, 0x00000000, 0x00010000) # ep00wireIn[16] is start_conv
        self.device.send_wire(0x06, 0xA0000000, 0xFFFFFFFF) # 0x06 is the address for command of ADC8688

        self.device.xem.ActivateTriggerIn(0x40, 0x2)

        self.device.data_stream_init()
        self.runc = True

        self.nADCs = 8
        self.accum_time_ic = 0
        self.data_disp_ic = np.zeros((163840*2, self.nADCs)) # 65536*2/8 *50
        self.accum_time_pcb = 0
        self.data_disp_pcb = np.zeros((40960*2, self.nADCs)) # 16384*2/8 *50

        self.data_dict = {}
        for i in range(1024):
            self.data_dict[i] = []

###############testing ##############################

        self.threadpool = QThreadPool()
        print("Multithreading with maximum %d threads" % self.threadpool.maxThreadCount())


    def __del__(self):
        self.wait()

    def stop(self):
        print("Stopping serial thread")
        self.runc = False


    def progress_fn_ic(self, datain):
        self.accum_time_ic = self.accum_time_ic + 1
        data_temp = datain.astype(np.uint16)
        data_temp[::, 0] = (data_temp[::, 0] + 256 * data_temp[::, 1])  # /51200.0
        data_temp[::, 1] = (data_temp[::, 2] - 1) * 128 + data_temp[::, 3] # calculate the pixel index
        data_value = data_temp[::, 0]

        # datatest1 = data_temp[data_temp[::, 1].argsort(kind='mergesort')]

        # print(data_value[0:64])
        # for i in range(len(pixel_index)):
        #     self.data_dict[pixel_index[i]].append((data_temp[i]))

        data_value = np.reshape(data_value, (-1, self.nADCs))

        self.data_disp_ic = np.roll(self.data_disp_ic, -8192, axis=0)  # shift row
        self.data_disp_ic[-8192::, :] = data_value/16384.0

        if self.accum_time_ic == 5:
            self.accum_time_ic = 0
            self.ic_data_to_update.emit(self.data_disp_ic)

    def progress_fn_ic_spike(self, datain):
        # self.accum_time_ic = self.accum_time_ic + 1
        data_temp = datain.astype(np.uint16)
        data_temp[::, 0] = (data_temp[::, 0] + 256 * data_temp[::, 1])  # /51200.0
        pixel_index = (data_temp[::, 2] - 1) * 128 + data_temp[::, 3] # calculate the pixel index
        data_value = data_temp[::, 0]

        # datatest1 = data_temp[data_temp[::, 1].argsort(kind='mergesort')]

        # print(data_value[0:64])
        for i in range(len(pixel_index)):
            self.data_dict[pixel_index[i]].append((data_value[i]))

        print(self.data_dict[1])

        # data_value = np.reshape(data_value, (-1, self.nADCs))
        #
        # self.data_disp_ic = np.roll(self.data_disp_ic, -8192, axis=0)  # shift row
        # self.data_disp_ic[-8192::, :] = data_value/16384.0
        #
        # if self.accum_time_ic == 5:
        #     self.accum_time_ic = 0
        #     self.ic_data_to_update.emit(self.data_disp_ic)



    def progress_fn_pcb(self, datain):
        self.accum_time_pcb = self.accum_time_pcb + 1
        data_temp = np.reshape(datain, (-1, 2))
        data_temp = (data_temp[::, 0] + 256 * data_temp[::, 1])* 0.078125*1e-3 # /51200.0
        data_temp = np.reshape(data_temp, (-1, self.nADCs))

        self.data_disp_pcb = np.roll(self.data_disp_pcb, -4096, axis=0)  # shift row
        self.data_disp_pcb[-4096::, :] = data_temp

        if self.accum_time_pcb == 5:
            self.accum_time_pcb = 0
            self.pcb_data_to_update.emit(self.data_disp_pcb)

    def execute_this_fn(self, progress_callback_ic, progress_callback_ic_spike, progress_callback_pcb):
        if self.device.recording_start ==1:
            self.adc_ic_control(Enable=1)
            while self.device.recording_start ==1:
                self.device.xem.UpdateTriggerOuts()
                if self.device.xem.IsTriggered(0x60, 0x10):
                    self.device.data_stream_ic()
                    progress_callback_ic.emit(self.device.ad7626_data)

                if self.device.xem.IsTriggered(0x60, 0x8):
                    self.device.data_stream_pcb()
                    progress_callback_pcb.emit(self.device.ads8688_data)

                else:
                    for i in range(5): # space for command sending
                        self.device.send_wire(0x0D, int(np.random.rand()+0.5), 0x00000001)
                #time.sleep(0.000001)
        return "Done."

    def execute_this_fn_spike(self, progress_callback_ic, progress_callback_ic_spike, progress_callback_pcb):
        progress_callback_ic_spike.emit(self.device.ad7626_data)
        print('hahahah')
        return "Done."

    def print_output(self, s):
        print(s)

    def thread_complete(self):
        print("THREAD COMPLETE!")

    def oh_no(self):
        # Pass the function to execute
        worker = Worker(self.execute_this_fn)  # any other args, kwargs are passed to the run function
        worker.signals.result.connect(self.print_output)
        worker.signals.finished.connect(self.thread_complete)
        worker.signals.progress_ic.connect(self.progress_fn_ic)
        worker.signals.progress_pcb.connect(self.progress_fn_pcb)
        # Execute
        self.threadpool.start(worker)



    def oh_no_spike(self):
        # Pass the function to execute
        worker = Worker(self.execute_this_fn_spike)  # any other args, kwargs are passed to the run function
        # worker.signals.result.connect(self.print_output)
        # worker.signals.finished.connect(self.thread_complete)
        # worker.signals.progress_ic.connect(self.progress_fn_ic)
        worker.signals.progress_ic_spike.connect(self.progress_fn_ic_spike)
        # worker.signals.progress_pcb.connect(self.progress_fn_pcb)
        # worker.signals.progress_dummy.connect(self.progress_fn_dummy)
        # Execute
        self.threadpool_spike.start(worker)




    def run(self):
        pass
        # while self.runc:
        #     time.sleep(0.001)
        #     # if self.device.recording_start ==1:
        #     #     self.oh_no()


