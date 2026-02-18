import { useSelector, useDispatch } from "react-redux";
import type { RootState } from "@/store";
import { startRecording, stopRecording } from "@/store/slices/recordingSlice";
import {
  Activity,
  Circle,
  Play,
  Square,
  Upload,
  Zap,
  Cpu,
  HardDrive,
  Thermometer,
  Clock,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  FlaskConical,
} from "lucide-react";

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)} MB`;
  return `${(bytes / 1073741824).toFixed(2)} GB`;
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    online: "bg-neural-accent-green/20 text-neural-accent-green",
    degraded: "bg-neural-accent-amber/20 text-neural-accent-amber",
    offline: "bg-neural-text-muted/20 text-neural-text-muted",
    error: "bg-neural-accent-red/20 text-neural-accent-red",
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${colors[status] ?? colors.offline}`}>
      {status}
    </span>
  );
}

export default function DashboardPage() {
  const dispatch = useDispatch();
  const recording = useSelector((state: RootState) => state.recording);
  const agents = useSelector((state: RootState) => state.agents.agents);
  const config = useSelector((state: RootState) => state.config);

  const handleStartRecording = () => {
    dispatch(startRecording({ id: crypto.randomUUID(), sampleRate: 30000, channels: 64 }));
  };

  const handleStopRecording = () => {
    dispatch(stopRecording());
  };

  // Mock mini-heatmap data (8x8 preview)
  const heatmapData = Array.from({ length: 64 }, () => Math.random());

  return (
    <div className="grid grid-cols-12 gap-4 h-full">
      {/* ── System Health Panel ── */}
      <div className="col-span-12 lg:col-span-4 bg-neural-surface rounded-xl border border-neural-border p-4">
        <div className="flex items-center gap-2 mb-4">
          <Cpu className="w-5 h-5 text-neural-accent-cyan" />
          <h2 className="text-sm font-semibold text-neural-text-primary uppercase tracking-wider">
            System Health
          </h2>
        </div>

        <div className="space-y-3">
          {/* FPGA */}
          <div className="flex items-center justify-between p-3 rounded-lg bg-neural-surface-alt">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-neural-accent-amber" />
              <span className="text-sm text-neural-text-secondary">FPGA Status</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-neural-accent-green" />
              <span className="text-sm text-neural-accent-green">Ready</span>
            </div>
          </div>

          {/* Temperature */}
          <div className="flex items-center justify-between p-3 rounded-lg bg-neural-surface-alt">
            <div className="flex items-center gap-2">
              <Thermometer className="w-4 h-4 text-neural-accent-red" />
              <span className="text-sm text-neural-text-secondary">Temperature</span>
            </div>
            <span className="text-sm font-mono text-neural-text-primary">34.2 C</span>
          </div>

          {/* Sample Rate */}
          <div className="flex items-center justify-between p-3 rounded-lg bg-neural-surface-alt">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-neural-accent-cyan" />
              <span className="text-sm text-neural-text-secondary">Sample Rate</span>
            </div>
            <span className="text-sm font-mono text-neural-text-primary">
              {recording.sampleRate / 1000} kHz
            </span>
          </div>

          {/* Gain */}
          <div className="flex items-center justify-between p-3 rounded-lg bg-neural-surface-alt">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-neural-accent-purple" />
              <span className="text-sm text-neural-text-secondary">Gain Mode</span>
            </div>
            <span className="text-sm font-mono text-neural-text-primary uppercase">
              {config.gainMode}
            </span>
          </div>

          {/* Active Preset */}
          <div className="flex items-center justify-between p-3 rounded-lg bg-neural-surface-alt">
            <div className="flex items-center gap-2">
              <HardDrive className="w-4 h-4 text-neural-accent-blue" />
              <span className="text-sm text-neural-text-secondary">Preset</span>
            </div>
            <span className="text-sm text-neural-text-primary">
              {config.activePreset ?? "Default"}
            </span>
          </div>
        </div>
      </div>

      {/* ── Recording Status Panel ── */}
      <div className="col-span-12 lg:col-span-4 bg-neural-surface rounded-xl border border-neural-border p-4">
        <div className="flex items-center gap-2 mb-4">
          {recording.isRecording ? (
            <Circle className="w-4 h-4 text-neural-accent-red fill-neural-accent-red animate-neural-pulse" />
          ) : (
            <Circle className="w-4 h-4 text-neural-text-muted" />
          )}
          <h2 className="text-sm font-semibold text-neural-text-primary uppercase tracking-wider">
            Recording Status
          </h2>
        </div>

        <div className="space-y-4">
          {/* Duration */}
          <div className="text-center py-4">
            <div className="text-4xl font-mono font-bold text-neural-text-primary tracking-wider">
              {formatDuration(recording.duration)}
            </div>
            <div className="text-xs text-neural-text-muted mt-1 uppercase tracking-wider">
              {recording.isRecording ? recording.status : "Idle"}
            </div>
          </div>

          {/* Metrics grid */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-neural-surface-alt rounded-lg p-3 text-center">
              <div className="text-lg font-mono font-semibold text-neural-accent-cyan">
                {recording.spikeCount.toLocaleString()}
              </div>
              <div className="text-xs text-neural-text-muted mt-0.5">Spikes</div>
            </div>
            <div className="bg-neural-surface-alt rounded-lg p-3 text-center">
              <div className="text-lg font-mono font-semibold text-neural-accent-green">
                {formatBytes(recording.fileSize)}
              </div>
              <div className="text-xs text-neural-text-muted mt-0.5">File Size</div>
            </div>
            <div className="bg-neural-surface-alt rounded-lg p-3 text-center">
              <div className="text-lg font-mono font-semibold text-neural-accent-purple">
                {recording.activeChannels}
              </div>
              <div className="text-xs text-neural-text-muted mt-0.5">Channels</div>
            </div>
            <div className="bg-neural-surface-alt rounded-lg p-3 text-center">
              <div className={`text-lg font-mono font-semibold ${
                recording.bufferUsage > 80
                  ? "text-neural-accent-red"
                  : "text-neural-accent-amber"
              }`}>
                {recording.bufferUsage.toFixed(0)}%
              </div>
              <div className="text-xs text-neural-text-muted mt-0.5">Buffer</div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Quick Actions ── */}
      <div className="col-span-12 lg:col-span-4 bg-neural-surface rounded-xl border border-neural-border p-4">
        <div className="flex items-center gap-2 mb-4">
          <Zap className="w-5 h-5 text-neural-accent-amber" />
          <h2 className="text-sm font-semibold text-neural-text-primary uppercase tracking-wider">
            Quick Actions
          </h2>
        </div>

        <div className="space-y-2">
          {!recording.isRecording ? (
            <button
              onClick={handleStartRecording}
              className="flex items-center gap-3 w-full px-4 py-3 rounded-lg bg-neural-accent-green/10 text-neural-accent-green hover:bg-neural-accent-green/20 neural-transition border border-neural-accent-green/20"
            >
              <Play className="w-5 h-5" />
              <span className="font-medium">Start Recording</span>
            </button>
          ) : (
            <button
              onClick={handleStopRecording}
              className="flex items-center gap-3 w-full px-4 py-3 rounded-lg bg-neural-accent-red/10 text-neural-accent-red hover:bg-neural-accent-red/20 neural-transition border border-neural-accent-red/20"
            >
              <Square className="w-5 h-5" />
              <span className="font-medium">Stop Recording</span>
            </button>
          )}

          <button className="flex items-center gap-3 w-full px-4 py-3 rounded-lg bg-neural-surface-alt text-neural-text-secondary hover:text-neural-text-primary hover:bg-neural-border neural-transition border border-neural-border">
            <Upload className="w-5 h-5" />
            <span className="font-medium">Load Preset</span>
          </button>

          <button className="flex items-center gap-3 w-full px-4 py-3 rounded-lg bg-neural-surface-alt text-neural-text-secondary hover:text-neural-text-primary hover:bg-neural-border neural-transition border border-neural-border">
            <FlaskConical className="w-5 h-5" />
            <span className="font-medium">New Experiment</span>
          </button>
        </div>
      </div>

      {/* ── Mini Spike Heatmap ── */}
      <div className="col-span-12 lg:col-span-4 bg-neural-surface rounded-xl border border-neural-border p-4">
        <div className="flex items-center gap-2 mb-4">
          <Activity className="w-5 h-5 text-neural-accent-cyan" />
          <h2 className="text-sm font-semibold text-neural-text-primary uppercase tracking-wider">
            Spike Heatmap
          </h2>
        </div>

        <div className="grid grid-cols-8 gap-0.5 aspect-square">
          {heatmapData.map((value, i) => {
            const intensity = Math.floor(value * 255);
            return (
              <div
                key={i}
                className="rounded-sm"
                style={{
                  backgroundColor: `rgba(6, 182, 212, ${value * 0.8 + 0.05})`,
                  opacity: 0.3 + value * 0.7,
                }}
                title={`Electrode ${i}: ${intensity}`}
              />
            );
          })}
        </div>

        <div className="flex justify-between mt-2 text-xs text-neural-text-muted">
          <span>Low</span>
          <div className="flex-1 mx-2 h-2 rounded-full bg-gradient-to-r from-neural-heatmap-low via-neural-heatmap-mid to-neural-heatmap-high" />
          <span>High</span>
        </div>
      </div>

      {/* ── Agent Status ── */}
      <div className="col-span-12 lg:col-span-4 bg-neural-surface rounded-xl border border-neural-border p-4">
        <div className="flex items-center gap-2 mb-4">
          <Cpu className="w-5 h-5 text-neural-accent-purple" />
          <h2 className="text-sm font-semibold text-neural-text-primary uppercase tracking-wider">
            Agent Status
          </h2>
        </div>

        <div className="space-y-2">
          {agents.map((agent) => (
            <div
              key={agent.name}
              className="flex items-center justify-between p-2.5 rounded-lg bg-neural-surface-alt"
            >
              <div className="flex items-center gap-2">
                <Circle
                  className={`w-2.5 h-2.5 fill-current ${
                    agent.status === "online"
                      ? "text-neural-accent-green"
                      : agent.status === "degraded"
                      ? "text-neural-accent-amber"
                      : "text-neural-accent-red"
                  }`}
                />
                <span className="text-sm text-neural-text-secondary capitalize">
                  {agent.name.replace("-agent", "")}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs font-mono text-neural-text-muted">
                  CPU {agent.cpuUsage}%
                </span>
                <StatusBadge status={agent.status} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Recent Activity ── */}
      <div className="col-span-12 lg:col-span-4 bg-neural-surface rounded-xl border border-neural-border p-4">
        <div className="flex items-center gap-2 mb-4">
          <Clock className="w-5 h-5 text-neural-accent-blue" />
          <h2 className="text-sm font-semibold text-neural-text-primary uppercase tracking-wider">
            Recent Activity
          </h2>
        </div>

        <div className="space-y-2">
          {[
            { action: "Recording completed", detail: "session_042 - 15 min", time: "2 min ago", icon: CheckCircle2, color: "text-neural-accent-green" },
            { action: "Spike sorting finished", detail: "3,847 spikes classified", time: "18 min ago", icon: Activity, color: "text-neural-accent-cyan" },
            { action: "Preset loaded", detail: "high_density_v3", time: "1 hr ago", icon: Upload, color: "text-neural-accent-blue" },
            { action: "Agent restarted", detail: "analysis-agent", time: "2 hr ago", icon: AlertTriangle, color: "text-neural-accent-amber" },
            { action: "Experiment created", detail: "hippocampal_study_07", time: "3 hr ago", icon: FlaskConical, color: "text-neural-accent-purple" },
          ].map((item, i) => (
            <div key={i} className="flex items-start gap-3 p-2 rounded-lg hover:bg-neural-surface-alt neural-transition">
              <item.icon className={`w-4 h-4 mt-0.5 ${item.color} shrink-0`} />
              <div className="flex-1 min-w-0">
                <div className="text-sm text-neural-text-primary">{item.action}</div>
                <div className="text-xs text-neural-text-muted">{item.detail}</div>
              </div>
              <span className="text-xs text-neural-text-muted whitespace-nowrap">{item.time}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
