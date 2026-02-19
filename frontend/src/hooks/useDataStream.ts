/**
 * Real-time neural data stream hook.
 * Connects to WebSocket /ws/neural-data, maintains a client-side RingBuffer,
 * and provides throttled access to the latest data for rendering.
 */

import { useEffect, useRef, useCallback, useState } from "react";
import { useWebSocket } from "./useWebSocket";
import { ClientRingBuffer } from "@/components/common/RingBuffer";

/* ---------- Mock data generator for demo mode ---------- */
const MOCK_SAMPLE_RATE = 30000;
const MOCK_BATCH_SIZE = 1500; // samples per batch (50ms at 30kHz)

function generateMockBatch(channelCount: number, batchIndex: number): Float32Array[] {
  const channels: Float32Array[] = [];
  const t0 = batchIndex * MOCK_BATCH_SIZE;

  for (let ch = 0; ch < channelCount; ch++) {
    const samples = new Float32Array(MOCK_BATCH_SIZE);
    // Each channel gets a unique mix of frequencies
    const baseFreq = 5 + (ch % 8) * 3; // 5-26 Hz theta/beta range
    const fastFreq = 80 + (ch % 5) * 40; // 80-240 Hz gamma range
    const ampBase = 80 + (ch % 4) * 20; // 80-140 µV
    const ampFast = 15 + (ch % 3) * 5;

    for (let s = 0; s < MOCK_BATCH_SIZE; s++) {
      const t = (t0 + s) / MOCK_SAMPLE_RATE;
      // Slow oscillation + fast oscillation + noise
      samples[s] =
        ampBase * Math.sin(2 * Math.PI * baseFreq * t + ch * 0.7) +
        ampFast * Math.sin(2 * Math.PI * fastFreq * t + ch * 1.3) +
        (Math.random() - 0.5) * 40; // ±20 µV noise

      // Occasional spike-like events (~1% chance per sample)
      if (Math.random() < 0.0003) {
        samples[s] += (Math.random() > 0.5 ? 1 : -1) * (200 + Math.random() * 150);
      }
    }
    channels.push(samples);
  }
  return channels;
}

type DataSourceMode = "simulation" | "live" | "playback";

interface DataStreamConfig {
  channelCount?: number;
  samplesPerChannel?: number;
  targetFps?: number;
  wsUrl?: string;
  autoConnect?: boolean;
  /** Data source mode — "playback" skips WebSocket and generates recording-like data immediately */
  mode?: DataSourceMode;
  /** Whether playback is paused (only used in playback mode) */
  playbackPaused?: boolean;
  /** Sample rate from the recording (used in playback mode for realistic data) */
  playbackSampleRate?: number;
}

interface SpikeEventData {
  channelId: number;
  electrodeId: number;
  timestamp: number;
  amplitude: number;
}

interface DataStreamReturn {
  /** Get the latest N samples for a channel */
  getLatestData: (channelIndex: number, length: number) => Float32Array;
  /** Recent spike events (last 1000) */
  spikeEvents: SpikeEventData[];
  /** Whether the WebSocket is connected */
  isConnected: boolean;
  /** Buffer fill level (0-1) */
  bufferFill: number;
  /** Current data rate in samples/sec */
  dataRate: number;
  /** Reference to the ring buffer for direct access */
  ringBuffer: ClientRingBuffer | null;
  /** Number of packets received */
  packetCount: number;
  /** Number of dropped packets */
  droppedPackets: number;
}

export function useDataStream(config: DataStreamConfig = {}): DataStreamReturn {
  const {
    channelCount = 64,
    samplesPerChannel = 30000 * 10, // 10 seconds at 30kHz
    targetFps = 60,
    wsUrl = "/ws/neural-data",
    autoConnect = true,
    mode = "simulation",
    playbackPaused = false,
    playbackSampleRate = 30000,
  } = config;

  const isPlayback = mode === "playback";

  const ringBufferRef = useRef<ClientRingBuffer | null>(null);
  const spikeEventsRef = useRef<SpikeEventData[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [bufferFill, setBufferFill] = useState(0);
  const [dataRate, setDataRate] = useState(0);
  const [packetCount, setPacketCount] = useState(0);
  const [droppedPackets, setDroppedPackets] = useState(0);

  // Rate tracking
  const sampleCountRef = useRef(0);
  const lastRateUpdateRef = useRef(Date.now());
  const lastSequenceRef = useRef(-1);
  const hasReceivedDataRef = useRef(false);

  // Frame-skip: track how many frames we skipped due to high buffer fill
  const skipCountRef = useRef(0);
  const BUFFER_HIGH_WATERMARK = 0.85; // Skip pushes above 85% fill

  // Initialize ring buffer
  useEffect(() => {
    ringBufferRef.current = new ClientRingBuffer(channelCount, samplesPerChannel);
    return () => {
      ringBufferRef.current = null;
    };
  }, [channelCount, samplesPerChannel]);

  // Throttle state updates to target FPS
  const lastUpdateRef = useRef(0);
  const updateInterval = 1000 / targetFps;

  const handleMessage = useCallback(
    (rawData: unknown) => {
      const rb = ringBufferRef.current;
      if (!rb) return;

      // Handle binary data (ArrayBuffer) for waveform samples
      if (rawData instanceof ArrayBuffer) {
        hasReceivedDataRef.current = true;
        decodeBinaryData(rawData, rb);
        return;
      }

      // Handle JSON messages
      const data = rawData as Record<string, unknown>;

      if (data.type === "neural_samples" && data.channels) {
        hasReceivedDataRef.current = true;

        // Frame-skip: if ring buffer fill exceeds high watermark, drop this
        // batch to let rendering catch up and prevent data congestion.
        const fillLevel = rb.getFillLevel(0);
        if (fillLevel > BUFFER_HIGH_WATERMARK) {
          skipCountRef.current++;
          // Still track rate and packet for monitoring, but skip the push
          const samplesThisBatch = Object.values(data.channels as Record<string, number[]>)[0]?.length ?? 0;
          sampleCountRef.current += samplesThisBatch;
          setPacketCount((prev) => prev + 1);
          setDroppedPackets((prev) => prev + 1);
          return;
        }

        const channelsObj = data.channels as Record<string, number[]>;
        const channelArrays: Float32Array[] = [];

        for (let ch = 0; ch < channelCount; ch++) {
          const key = ch.toString();
          if (channelsObj[key]) {
            channelArrays.push(new Float32Array(channelsObj[key]));
          } else {
            channelArrays.push(new Float32Array(0));
          }
        }

        rb.push(channelArrays);

        // Track sample count for rate computation
        const samplesThisBatch = channelArrays[0]?.length ?? 0;
        sampleCountRef.current += samplesThisBatch;

        // Sequence tracking for drop detection
        if (typeof data.sequence === "number") {
          const seq = data.sequence as number;
          if (lastSequenceRef.current >= 0 && seq > lastSequenceRef.current + 1) {
            setDroppedPackets((prev) => prev + (seq - lastSequenceRef.current - 1));
          }
          lastSequenceRef.current = seq;
        }

        setPacketCount((prev) => prev + 1);
      }

      if (data.type === "spike_event") {
        const spike: SpikeEventData = {
          channelId: data.channelId as number,
          electrodeId: data.electrodeId as number,
          timestamp: data.timestamp as number,
          amplitude: data.amplitude as number,
        };
        spikeEventsRef.current.push(spike);
        // Keep only last 1000 spike events
        if (spikeEventsRef.current.length > 1000) {
          spikeEventsRef.current = spikeEventsRef.current.slice(-1000);
        }
      }

      // Throttled UI state updates
      const now = Date.now();
      if (now - lastUpdateRef.current > updateInterval) {
        lastUpdateRef.current = now;
        setBufferFill(rb.getFillLevel(0));

        // Compute data rate every second
        if (now - lastRateUpdateRef.current > 1000) {
          const elapsed = (now - lastRateUpdateRef.current) / 1000;
          setDataRate(Math.round(sampleCountRef.current / elapsed));
          sampleCountRef.current = 0;
          lastRateUpdateRef.current = now;
        }
      }
    },
    [channelCount, updateInterval]
  );

  // In playback mode, skip WebSocket entirely
  const { isConnected: wsConnected } = useWebSocket({
    url: wsUrl,
    onMessage: handleMessage,
    onOpen: () => setIsConnected(true),
    onClose: () => setIsConnected(false),
    autoConnect: isPlayback ? false : autoConnect,
    reconnect: !isPlayback,
    reconnectInterval: 2000,
    reconnectAttempts: 20,
  });

  useEffect(() => {
    if (!isPlayback) setIsConnected(wsConnected);
  }, [wsConnected, isPlayback]);

  // ---------- Mock / playback data generation ----------
  const mockBatchIndexRef = useRef(0);
  const mockTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mockStartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startMockData = useCallback(() => {
    if (mockTimerRef.current) return; // Already running

    setIsConnected(true); // Indicate data is flowing
    mockBatchIndexRef.current = 0;

    mockTimerRef.current = setInterval(() => {
      const rb = ringBufferRef.current;
      if (!rb) return;

      const batch = generateMockBatch(channelCount, mockBatchIndexRef.current);
      rb.push(batch);
      mockBatchIndexRef.current++;

      // Update rate/fill stats
      sampleCountRef.current += MOCK_BATCH_SIZE;
      setPacketCount((prev) => prev + 1);

      const now = Date.now();
      if (now - lastRateUpdateRef.current > 1000) {
        const elapsed = (now - lastRateUpdateRef.current) / 1000;
        setDataRate(Math.round(sampleCountRef.current / elapsed));
        sampleCountRef.current = 0;
        lastRateUpdateRef.current = now;
      }
      setBufferFill(rb.getFillLevel(0));
    }, 50); // 50ms interval = 20 batches/sec
  }, [channelCount]);

  const stopMockData = useCallback(() => {
    if (mockTimerRef.current) {
      clearInterval(mockTimerRef.current);
      mockTimerRef.current = null;
    }
    if (mockStartTimerRef.current) {
      clearTimeout(mockStartTimerRef.current);
      mockStartTimerRef.current = null;
    }
  }, []);

  // ── Playback mode: start data immediately, pause/resume with playback ──
  useEffect(() => {
    if (!isPlayback) return;

    if (playbackPaused) {
      stopMockData();
      return;
    }

    // Start generating data immediately for playback
    setIsConnected(true);
    setDataRate(playbackSampleRate);
    startMockData();

    return stopMockData;
  }, [isPlayback, playbackPaused, playbackSampleRate, startMockData, stopMockData]);

  // ── Simulation / live fallback (a): no connection after 3 seconds ──
  useEffect(() => {
    if (isPlayback) return; // Handled above

    if (wsConnected) {
      stopMockData();
      return;
    }

    mockStartTimerRef.current = setTimeout(() => {
      startMockData();
    }, 3000);

    return stopMockData;
  }, [isPlayback, wsConnected, startMockData, stopMockData]);

  // ── Simulation / live fallback (b): connected but no data after 5 seconds ──
  useEffect(() => {
    if (isPlayback) return;
    if (!wsConnected) return;

    hasReceivedDataRef.current = false;

    const noDataTimer = setTimeout(() => {
      if (!hasReceivedDataRef.current && !mockTimerRef.current) {
        startMockData();
      }
    }, 5000);

    return () => clearTimeout(noDataTimer);
  }, [isPlayback, wsConnected, startMockData]);

  const getLatestData = useCallback(
    (channelIndex: number, length: number): Float32Array => {
      const rb = ringBufferRef.current;
      if (!rb) return new Float32Array(length);
      return rb.getLatest(channelIndex, length);
    },
    []
  );

  return {
    getLatestData,
    spikeEvents: spikeEventsRef.current,
    isConnected,
    bufferFill,
    dataRate,
    ringBuffer: ringBufferRef.current,
    packetCount,
    droppedPackets,
  };
}

/**
 * Decode binary neural data packet.
 * Format: [uint32 channelCount][uint32 samplesPerChannel][float32[] data...]
 * Data is interleaved: ch0_s0, ch1_s0, ..., chN_s0, ch0_s1, ...
 */
function decodeBinaryData(buffer: ArrayBuffer, rb: ClientRingBuffer): void {
  const view = new DataView(buffer);
  if (buffer.byteLength < 8) return;

  const numChannels = view.getUint32(0, true);
  const samplesPerCh = view.getUint32(4, true);
  const headerSize = 8;
  const expectedSize = headerSize + numChannels * samplesPerCh * 4;

  if (buffer.byteLength < expectedSize) return;

  const channelData: Float32Array[] = [];
  const floatView = new Float32Array(buffer, headerSize);

  for (let ch = 0; ch < numChannels; ch++) {
    const chSamples = new Float32Array(samplesPerCh);
    for (let s = 0; s < samplesPerCh; s++) {
      chSamples[s] = floatView[s * numChannels + ch];
    }
    channelData.push(chSamples);
  }

  rb.push(channelData);
}

export default useDataStream;
