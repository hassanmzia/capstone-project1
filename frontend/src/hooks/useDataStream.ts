/**
 * Real-time neural data stream hook.
 * Connects to WebSocket /ws/neural-data, maintains a client-side RingBuffer,
 * and provides throttled access to the latest data for rendering.
 */

import { useEffect, useRef, useCallback, useState } from "react";
import { useWebSocket } from "./useWebSocket";
import { ClientRingBuffer } from "@/components/common/RingBuffer";

interface DataStreamConfig {
  channelCount?: number;
  samplesPerChannel?: number;
  targetFps?: number;
  wsUrl?: string;
  autoConnect?: boolean;
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
  } = config;

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
        decodeBinaryData(rawData, rb);
        return;
      }

      // Handle JSON messages
      const data = rawData as Record<string, unknown>;

      if (data.type === "neural_samples" && data.channels) {
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

  const { isConnected: wsConnected } = useWebSocket({
    url: wsUrl,
    onMessage: handleMessage,
    onOpen: () => setIsConnected(true),
    onClose: () => setIsConnected(false),
    autoConnect,
    reconnect: true,
    reconnectInterval: 2000,
    reconnectAttempts: 20,
  });

  useEffect(() => {
    setIsConnected(wsConnected);
  }, [wsConnected]);

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
