/**
 * Spike event hook for tracking spike rates across all electrode sites.
 * Subscribes to spike events from WebSocket, maintains per-site counts,
 * and computes decaying spike rates over a configurable window.
 */

import { useEffect, useRef, useCallback, useState } from "react";
import { useWebSocket } from "./useWebSocket";

interface SpikeEvent {
  siteIndex: number;
  channelId: number;
  timestamp: number;
  amplitude: number;
  sortCode?: number;
}

interface UseSpikeEventsConfig {
  /** Total number of electrode sites (default: 4096 for 64x64) */
  totalSites?: number;
  /** Time window in ms for rate computation (default: 1000) */
  rateWindowMs?: number;
  /** Decay factor per update cycle (0-1, default: 0.95) */
  decayFactor?: number;
  /** Update interval in ms (default: 100) */
  updateIntervalMs?: number;
  /** WebSocket URL (default: /ws/spike-events) */
  wsUrl?: string;
  /** Auto connect on mount (default: true) */
  autoConnect?: boolean;
}

interface UseSpikeEventsReturn {
  /** Spike counts per site (cumulative since last reset) */
  spikeCounts: Float32Array;
  /** Spike rates per site (Hz, decaying window) */
  spikeRate: Float32Array;
  /** Number of currently active sites (rate > threshold) */
  activeSites: number;
  /** Most recent spike events (last 100) */
  latestSpikes: SpikeEvent[];
  /** Total number of spikes received */
  totalSpikes: number;
  /** Whether the WebSocket is connected */
  isConnected: boolean;
  /** Reset all counters */
  reset: () => void;
}

export function useSpikeEvents(config: UseSpikeEventsConfig = {}): UseSpikeEventsReturn {
  const {
    totalSites = 4096,
    rateWindowMs = 1000,
    decayFactor = 0.95,
    updateIntervalMs = 100,
    wsUrl = "/ws/spike-events",
    autoConnect = true,
  } = config;

  // Persistent data stores (not React state to avoid re-render on every spike)
  const spikeCountsRef = useRef(new Float32Array(totalSites));
  const spikeRateRef = useRef(new Float32Array(totalSites));
  const recentCountsRef = useRef(new Float32Array(totalSites)); // counts in current window
  const latestSpikesRef = useRef<SpikeEvent[]>([]);
  const totalSpikesRef = useRef(0);

  // React state for consumer re-renders (updated at throttled interval)
  const [spikeCounts, setSpikeCounts] = useState(() => new Float32Array(totalSites));
  const [spikeRate, setSpikeRate] = useState(() => new Float32Array(totalSites));
  const [activeSites, setActiveSites] = useState(0);
  const [latestSpikes, setLatestSpikes] = useState<SpikeEvent[]>([]);
  const [totalSpikes, setTotalSpikes] = useState(0);
  const [isConnected, setIsConnected] = useState(false);

  // Handle incoming spike events
  const handleMessage = useCallback(
    (rawData: unknown) => {
      const data = rawData as Record<string, unknown>;

      if (data.type === "spike" || data.type === "spike_event") {
        const siteIndex = (data.siteIndex ?? data.electrodeId ?? 0) as number;
        if (siteIndex >= 0 && siteIndex < totalSites) {
          spikeCountsRef.current[siteIndex] += 1;
          recentCountsRef.current[siteIndex] += 1;
          totalSpikesRef.current += 1;

          const spike: SpikeEvent = {
            siteIndex,
            channelId: (data.channelId ?? siteIndex) as number,
            timestamp: (data.timestamp ?? Date.now()) as number,
            amplitude: (data.amplitude ?? 0) as number,
            sortCode: data.sortCode as number | undefined,
          };

          latestSpikesRef.current.push(spike);
          if (latestSpikesRef.current.length > 100) {
            latestSpikesRef.current = latestSpikesRef.current.slice(-100);
          }
        }
      }

      // Batch spike events
      if (data.type === "spike_batch" && Array.isArray(data.events)) {
        const events = data.events as Array<Record<string, unknown>>;
        for (const evt of events) {
          const siteIndex = (evt.siteIndex ?? evt.electrodeId ?? 0) as number;
          if (siteIndex >= 0 && siteIndex < totalSites) {
            spikeCountsRef.current[siteIndex] += 1;
            recentCountsRef.current[siteIndex] += 1;
            totalSpikesRef.current += 1;
          }
        }
      }
    },
    [totalSites]
  );

  const { isConnected: wsConnected } = useWebSocket({
    url: wsUrl,
    onMessage: handleMessage,
    onOpen: () => setIsConnected(true),
    onClose: () => setIsConnected(false),
    autoConnect,
    reconnect: true,
    reconnectInterval: 2000,
  });

  useEffect(() => {
    setIsConnected(wsConnected);
  }, [wsConnected]);

  // Periodic update: decay rates and push state
  useEffect(() => {
    const interval = setInterval(() => {
      const rates = spikeRateRef.current;
      const recent = recentCountsRef.current;

      let active = 0;

      for (let i = 0; i < totalSites; i++) {
        // Exponential moving average of spike rate
        const instantRate = recent[i] / (updateIntervalMs / 1000);
        rates[i] = rates[i] * decayFactor + instantRate * (1 - decayFactor);
        recent[i] = 0; // Reset recent counts for next interval

        if (rates[i] > 0.5) active++; // threshold: 0.5 Hz
      }

      // Push to React state
      setSpikeCounts(new Float32Array(spikeCountsRef.current));
      setSpikeRate(new Float32Array(rates));
      setActiveSites(active);
      setLatestSpikes([...latestSpikesRef.current]);
      setTotalSpikes(totalSpikesRef.current);
    }, updateIntervalMs);

    return () => clearInterval(interval);
  }, [totalSites, rateWindowMs, decayFactor, updateIntervalMs]);

  const reset = useCallback(() => {
    spikeCountsRef.current.fill(0);
    spikeRateRef.current.fill(0);
    recentCountsRef.current.fill(0);
    latestSpikesRef.current = [];
    totalSpikesRef.current = 0;
    setSpikeCounts(new Float32Array(totalSites));
    setSpikeRate(new Float32Array(totalSites));
    setActiveSites(0);
    setLatestSpikes([]);
    setTotalSpikes(0);
  }, [totalSites]);

  return {
    spikeCounts,
    spikeRate,
    activeSites,
    latestSpikes,
    totalSpikes,
    isConnected,
    reset,
  };
}

export default useSpikeEvents;
