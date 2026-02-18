/**
 * Shared neural data stream context.
 * Provides a single useDataStream instance to all visualization components
 * so they share one WebSocket connection, ring buffer, and mock data generator.
 */

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useDataStream } from "@/hooks/useDataStream";

interface NeuralDataContextValue {
  getLatestData: (channelIndex: number, length: number) => Float32Array;
  isConnected: boolean;
  bufferFill: number;
  dataRate: number;
  packetCount: number;
  droppedPackets: number;
}

const NeuralDataContext = createContext<NeuralDataContextValue | null>(null);

interface NeuralDataProviderProps {
  children: ReactNode;
  channelCount?: number;
  targetFps?: number;
}

export function NeuralDataProvider({
  children,
  channelCount = 64,
  targetFps = 60,
}: NeuralDataProviderProps) {
  const stream = useDataStream({ channelCount, targetFps });

  const value = useMemo<NeuralDataContextValue>(
    () => ({
      getLatestData: stream.getLatestData,
      isConnected: stream.isConnected,
      bufferFill: stream.bufferFill,
      dataRate: stream.dataRate,
      packetCount: stream.packetCount,
      droppedPackets: stream.droppedPackets,
    }),
    [
      stream.getLatestData,
      stream.isConnected,
      stream.bufferFill,
      stream.dataRate,
      stream.packetCount,
      stream.droppedPackets,
    ]
  );

  return (
    <NeuralDataContext.Provider value={value}>
      {children}
    </NeuralDataContext.Provider>
  );
}

export function useNeuralData(): NeuralDataContextValue {
  const ctx = useContext(NeuralDataContext);
  if (!ctx) {
    throw new Error("useNeuralData must be used within a NeuralDataProvider");
  }
  return ctx;
}
