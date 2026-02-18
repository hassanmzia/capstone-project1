import { useSelector, useDispatch } from "react-redux";
import type { RootState } from "@/store";
import { togglePanel } from "@/store/slices/chatSlice";
import {
  Circle,
  Wifi,
  WifiOff,
  MessageSquare,
  User,
  Clock,
  Zap,
} from "lucide-react";

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export default function Header() {
  const dispatch = useDispatch();
  const { isRecording, status, duration, spikeCount } = useSelector(
    (state: RootState) => state.recording
  );
  const { isPanelOpen } = useSelector((state: RootState) => state.chat);
  const agents = useSelector((state: RootState) => state.agents.agents);
  const allOnline = agents.every((a) => a.status === "online");

  return (
    <header className="flex items-center justify-between h-14 px-4 bg-neural-surface border-b border-neural-border">
      {/* Left: System Info */}
      <div className="flex items-center gap-6">
        {/* Connection status */}
        <div className="flex items-center gap-2 text-sm">
          {allOnline ? (
            <Wifi className="w-4 h-4 text-neural-accent-green" />
          ) : (
            <WifiOff className="w-4 h-4 text-neural-accent-red" />
          )}
          <span className={allOnline ? "text-neural-accent-green" : "text-neural-accent-red"}>
            {allOnline ? "Connected" : "Degraded"}
          </span>
        </div>

        {/* FPGA status */}
        <div className="flex items-center gap-2 text-sm text-neural-text-secondary">
          <Zap className="w-4 h-4 text-neural-accent-amber" />
          <span>FPGA Ready</span>
        </div>
      </div>

      {/* Center: Recording Status */}
      <div className="flex items-center gap-4">
        {isRecording && (
          <>
            <div className="flex items-center gap-2">
              <Circle
                className="w-3 h-3 text-neural-accent-red fill-neural-accent-red animate-neural-pulse"
              />
              <span className="text-sm font-semibold text-neural-accent-red uppercase tracking-wider">
                {status === "paused" ? "Paused" : "Recording"}
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-sm text-neural-text-secondary">
              <Clock className="w-3.5 h-3.5" />
              <span className="font-mono">{formatDuration(duration)}</span>
            </div>
            <div className="text-sm text-neural-text-secondary">
              <span className="font-mono text-neural-accent-cyan">{spikeCount.toLocaleString()}</span>
              <span className="ml-1">spikes</span>
            </div>
          </>
        )}
        {!isRecording && (
          <span className="text-sm text-neural-text-muted">No active recording</span>
        )}
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => dispatch(togglePanel())}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm neural-transition ${
            isPanelOpen
              ? "bg-neural-accent-purple/20 text-neural-accent-purple"
              : "text-neural-text-secondary hover:text-neural-text-primary hover:bg-neural-surface-alt"
          }`}
        >
          <MessageSquare className="w-4 h-4" />
          <span className="hidden lg:inline">Assistant</span>
        </button>

        <div className="w-px h-6 bg-neural-border" />

        <button className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-neural-text-secondary hover:text-neural-text-primary hover:bg-neural-surface-alt neural-transition">
          <User className="w-4 h-4" />
          <span className="hidden lg:inline">Researcher</span>
        </button>
      </div>
    </header>
  );
}
