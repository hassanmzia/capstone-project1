/**
 * Shared spike events context.
 * Provides a single useSpikeEvents instance to all components that need
 * spike rate data (heatmap, raster displays, etc.).
 */

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useSpikeEvents } from "@/hooks/useSpikeEvents";

interface SpikeEvent {
  siteIndex: number;
  channelId: number;
  timestamp: number;
  amplitude: number;
  sortCode?: number;
}

interface SpikeEventsContextValue {
  spikeCounts: Float32Array;
  spikeRate: Float32Array;
  activeSites: number;
  latestSpikes: SpikeEvent[];
  totalSpikes: number;
  isConnected: boolean;
  reset: () => void;
}

const SpikeEventsContext = createContext<SpikeEventsContextValue | null>(null);

interface SpikeEventsProviderProps {
  children: ReactNode;
  totalSites?: number;
}

export function SpikeEventsProvider({
  children,
  totalSites = 4096,
}: SpikeEventsProviderProps) {
  const events = useSpikeEvents({ totalSites });

  const value = useMemo<SpikeEventsContextValue>(
    () => ({
      spikeCounts: events.spikeCounts,
      spikeRate: events.spikeRate,
      activeSites: events.activeSites,
      latestSpikes: events.latestSpikes,
      totalSpikes: events.totalSpikes,
      isConnected: events.isConnected,
      reset: events.reset,
    }),
    [
      events.spikeCounts,
      events.spikeRate,
      events.activeSites,
      events.latestSpikes,
      events.totalSpikes,
      events.isConnected,
      events.reset,
    ]
  );

  return (
    <SpikeEventsContext.Provider value={value}>
      {children}
    </SpikeEventsContext.Provider>
  );
}

export function useSharedSpikeEvents(): SpikeEventsContextValue {
  const ctx = useContext(SpikeEventsContext);
  if (!ctx) {
    throw new Error("useSharedSpikeEvents must be used within a SpikeEventsProvider");
  }
  return ctx;
}
