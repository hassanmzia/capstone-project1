/**
 * Shared recording session context.
 * Lives at the AppLayout level so both the Recording page and
 * Visualization page can access the active recording state.
 */

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

export interface ActiveRecordingSession {
  name: string;
  experimentName: string;
  channels: number;
  sampleRate: number;
  format: string;
  startedAt: number;
  isPaused: boolean;
}

export interface PlaybackSession {
  recordingId: string;
  name: string;
  experimentName: string;
  channels: number;
  sampleRate: number;
  duration: string;
  spikeCount: number;
}

export type DataSourceMode = "simulation" | "live" | "playback";

interface RecordingSessionContextValue {
  /** Current data source mode */
  mode: DataSourceMode;
  /** Active live recording session (null if not recording) */
  activeSession: ActiveRecordingSession | null;
  /** Playback session info (null if not replaying) */
  playbackSession: PlaybackSession | null;
  /** Called by the recording page when recording starts */
  startSession: (session: ActiveRecordingSession) => void;
  /** Called when recording pauses/resumes */
  updateSession: (updates: Partial<ActiveRecordingSession>) => void;
  /** Called when recording stops */
  endSession: () => void;
  /** Called when user opens a recording for playback in visualizer */
  startPlayback: (session: PlaybackSession) => void;
  /** Called when user exits playback */
  endPlayback: () => void;
}

const RecordingSessionContext = createContext<RecordingSessionContextValue | null>(null);

export function RecordingSessionProvider({ children }: { children: ReactNode }) {
  const [activeSession, setActiveSession] = useState<ActiveRecordingSession | null>(null);
  const [playbackSession, setPlaybackSession] = useState<PlaybackSession | null>(null);

  const mode: DataSourceMode = activeSession ? "live" : playbackSession ? "playback" : "simulation";

  const startSession = useCallback((session: ActiveRecordingSession) => {
    setActiveSession(session);
    setPlaybackSession(null); // stop any playback
  }, []);

  const updateSession = useCallback((updates: Partial<ActiveRecordingSession>) => {
    setActiveSession((prev) => (prev ? { ...prev, ...updates } : null));
  }, []);

  const endSession = useCallback(() => {
    setActiveSession(null);
  }, []);

  const startPlayback = useCallback((session: PlaybackSession) => {
    setPlaybackSession(session);
    setActiveSession(null); // can't play back while recording
  }, []);

  const endPlayback = useCallback(() => {
    setPlaybackSession(null);
  }, []);

  return (
    <RecordingSessionContext.Provider
      value={{ mode, activeSession, playbackSession, startSession, updateSession, endSession, startPlayback, endPlayback }}
    >
      {children}
    </RecordingSessionContext.Provider>
  );
}

export function useRecordingSession() {
  const ctx = useContext(RecordingSessionContext);
  if (!ctx) throw new Error("useRecordingSession must be used within RecordingSessionProvider");
  return ctx;
}
