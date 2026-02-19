import { useSelector } from "react-redux";
import type { RootState } from "@/store";
import { Activity, Database, Cpu, HardDrive, Circle } from "lucide-react";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B/s`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB/s`;
  return `${(bytes / 1048576).toFixed(1)} MB/s`;
}

function statusColor(status: string): string {
  switch (status) {
    case "online":
      return "text-neural-accent-green";
    case "degraded":
      return "text-neural-accent-amber";
    case "offline":
      return "text-neural-text-muted";
    case "error":
      return "text-neural-accent-red";
    default:
      return "text-neural-text-muted";
  }
}

export default function StatusBar() {
  const { dataRate, bufferUsage, sampleRate, activeChannels } = useSelector(
    (state: RootState) => state.recording
  );
  const agents = useSelector((state: RootState) => state.agents.agents);

  const onlineCount = agents.filter((a) => a.status === "online").length;

  return (
    <footer className="hidden md:flex items-center justify-between h-8 px-4 bg-neural-surface border-t border-neural-border text-xs">
      {/* Left: Connection & throughput */}
      <div className="flex items-center gap-5">
        <div className="flex items-center gap-1.5 text-neural-text-muted">
          <Activity className="w-3 h-3" />
          <span>Throughput:</span>
          <span className="text-neural-accent-cyan font-mono">{formatBytes(dataRate)}</span>
        </div>

        <div className="flex items-center gap-1.5 text-neural-text-muted">
          <Database className="w-3 h-3" />
          <span>Buffer:</span>
          <span
            className={`font-mono ${
              bufferUsage > 80
                ? "text-neural-accent-red"
                : bufferUsage > 50
                ? "text-neural-accent-amber"
                : "text-neural-accent-green"
            }`}
          >
            {bufferUsage.toFixed(0)}%
          </span>
        </div>

        <div className="flex items-center gap-1.5 text-neural-text-muted">
          <Cpu className="w-3 h-3" />
          <span>{sampleRate / 1000}kHz</span>
          <span className="text-neural-border-bright">|</span>
          <span>{activeChannels} ch</span>
        </div>
      </div>

      {/* Center: Agent health summary */}
      <div className="flex items-center gap-3">
        {agents.map((agent) => (
          <div
            key={agent.name}
            className="flex items-center gap-1"
            title={`${agent.name}: ${agent.status}`}
          >
            <Circle
              className={`w-2 h-2 fill-current ${statusColor(agent.status)}`}
            />
            <span className="text-neural-text-muted hidden xl:inline">
              {agent.name.replace("-agent", "")}
            </span>
          </div>
        ))}
      </div>

      {/* Right: Summary */}
      <div className="flex items-center gap-3 text-neural-text-muted">
        <div className="flex items-center gap-1.5">
          <HardDrive className="w-3 h-3" />
          <span>
            Agents: <span className="text-neural-accent-green">{onlineCount}</span>/{agents.length}
          </span>
        </div>
        <span className="text-neural-border-bright">|</span>
        <span className="hidden lg:inline">CNEAv5 Neural Interface v1.0.0</span>
        <span className="lg:hidden">v1.0.0</span>
      </div>
    </footer>
  );
}
