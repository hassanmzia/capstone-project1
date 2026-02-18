import type { ReactNode } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  BarChart3,
  CheckCircle2,
  Clock,
  Settings,
  GitBranch,
  TrendingUp,
  Layers,
  Sigma,
  HardDrive,
  Cpu,
  Activity,
  Zap,
} from "lucide-react";

interface AnalysisDetail {
  id: string;
  type: string;
  recording: string;
  experimentName: string;
  status: "completed" | "running" | "queued" | "failed";
  progress: number;
  duration: string;
  result: string;
  startedAt: string;
  completedAt: string;
  parameters: { label: string; value: string }[];
  outputs: { label: string; value: string }[];
  notes: string;
}

const mockAnalysisDb: Record<string, AnalysisDetail> = {
  "a-001": {
    id: "a-001",
    type: "Spike Sorting",
    recording: "session_042",
    experimentName: "Hippocampal CA1 Place Cell Study",
    status: "completed",
    progress: 100,
    duration: "4m 32s",
    result: "3,847 units classified",
    startedAt: "2026-02-18 09:48",
    completedAt: "2026-02-18 09:52",
    parameters: [
      { label: "Algorithm", value: "Kilosort 3" },
      { label: "Threshold", value: "6.0 std" },
      { label: "Min Cluster Size", value: "30 spikes" },
      { label: "Max Drift", value: "10 um" },
      { label: "Template Matching", value: "Enabled" },
      { label: "Auto-merge", value: "Threshold 0.85" },
    ],
    outputs: [
      { label: "Total Units", value: "3,847" },
      { label: "Single Units", value: "412" },
      { label: "Multi Units", value: "2,104" },
      { label: "Noise Clusters", value: "1,331" },
      { label: "Isolation Score (median)", value: "0.91" },
      { label: "ISI Violations < 2ms", value: "1.2%" },
    ],
    notes: "High-quality sorting with good isolation metrics. Place cell units show stable waveforms. Drift correction successfully handled probe movement during long recording.",
  },
  "a-002": {
    id: "a-002",
    type: "Burst Detection",
    recording: "session_041",
    experimentName: "Hippocampal CA1 Place Cell Study",
    status: "completed",
    progress: 100,
    duration: "1m 18s",
    result: "142 bursts detected",
    startedAt: "2026-02-17 15:00",
    completedAt: "2026-02-17 15:01",
    parameters: [
      { label: "Algorithm", value: "LogISI" },
      { label: "Min Burst Spikes", value: "3" },
      { label: "Max ISI (intra-burst)", value: "10 ms" },
      { label: "Min Inter-burst Interval", value: "100 ms" },
      { label: "Channels", value: "All (64)" },
    ],
    outputs: [
      { label: "Total Bursts", value: "142" },
      { label: "Mean Burst Duration", value: "45.2 ms" },
      { label: "Mean Spikes/Burst", value: "8.3" },
      { label: "Burst Rate", value: "4.7 /min" },
      { label: "Peak Burst Freq", value: "210 Hz" },
    ],
    notes: "Network bursts consistent with sharp-wave ripple events during rest periods. Burst rate higher during post-run rest than pre-run baseline, consistent with memory consolidation.",
  },
  "a-003": {
    id: "a-003",
    type: "PCA Analysis",
    recording: "session_042",
    experimentName: "Hippocampal CA1 Place Cell Study",
    status: "running",
    progress: 67,
    duration: "2m 10s",
    startedAt: "2026-02-18 10:05",
    completedAt: "",
    result: "",
    parameters: [
      { label: "Components", value: "3" },
      { label: "Feature Space", value: "Waveform peaks + PCA" },
      { label: "Normalization", value: "Z-score" },
      { label: "Channels", value: "All (64)" },
    ],
    outputs: [],
    notes: "Running PCA for spike feature extraction. First 3 components explain ~85% of variance. Pending completion.",
  },
  "a-004": {
    id: "a-004",
    type: "Cross-Correlation",
    recording: "session_040",
    experimentName: "Cortical Spike Timing Analysis",
    status: "queued",
    progress: 0,
    duration: "--",
    startedAt: "",
    completedAt: "",
    result: "",
    parameters: [
      { label: "Bin Size", value: "0.5 ms" },
      { label: "Window", value: "+/- 50 ms" },
      { label: "Unit Pairs", value: "All pairwise" },
      { label: "Significance", value: "p < 0.01 (jitter)" },
    ],
    outputs: [],
    notes: "Queued for execution. Will compute all pairwise cross-correlograms between sorted units from session_040.",
  },
};

const typeIcons: Record<string, typeof GitBranch> = {
  "Spike Sorting": GitBranch,
  "Burst Detection": TrendingUp,
  "PCA Analysis": Layers,
  "PCA / Clustering": Layers,
  "Cross-Correlation": Sigma,
  "ISI Analysis": BarChart3,
  "Spectral Analysis": TrendingUp,
};

function statusBadge(status: string) {
  const map: Record<string, string> = {
    completed: "bg-neural-accent-green/20 text-neural-accent-green",
    running: "bg-neural-accent-cyan/20 text-neural-accent-cyan",
    queued: "bg-neural-text-muted/20 text-neural-text-muted",
    failed: "bg-neural-accent-red/20 text-neural-accent-red",
  };
  const icons: Record<string, ReactNode> = {
    completed: <CheckCircle2 className="w-3.5 h-3.5" />,
    running: <Settings className="w-3.5 h-3.5 animate-spin" />,
    queued: <Clock className="w-3.5 h-3.5" />,
    failed: <Clock className="w-3.5 h-3.5" />,
  };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium capitalize ${map[status] || map.queued}`}>
      {icons[status] || icons.queued}
      {status}
    </span>
  );
}

export default function AnalysisDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const job = id ? mockAnalysisDb[id] : null;

  if (!job) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <BarChart3 className="w-12 h-12 text-neural-text-muted" />
        <p className="text-neural-text-muted">Analysis job not found</p>
        <button
          onClick={() => navigate("/analysis")}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm bg-neural-accent-cyan/20 text-neural-accent-cyan hover:bg-neural-accent-cyan/30 border border-neural-accent-cyan/30 neural-transition"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Analysis
        </button>
      </div>
    );
  }

  const TypeIcon = typeIcons[job.type] || BarChart3;

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Top bar */}
      <div className="flex items-center justify-between bg-neural-surface rounded-xl border border-neural-border p-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate("/analysis")}
            className="p-1.5 rounded-lg hover:bg-neural-surface-alt text-neural-text-muted hover:text-neural-text-primary neural-transition"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <TypeIcon className="w-5 h-5 text-neural-accent-green" />
          <h1 className="text-lg font-semibold text-neural-text-primary">{job.type}</h1>
          {statusBadge(job.status)}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Main content */}
          <div className="lg:col-span-2 space-y-4">
            {/* Overview */}
            <div className="bg-neural-surface rounded-xl border border-neural-border p-5">
              <h2 className="text-sm font-semibold text-neural-text-primary mb-4">Job Overview</h2>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                <div>
                  <span className="text-xs text-neural-text-muted flex items-center gap-1"><HardDrive className="w-3 h-3" /> Recording</span>
                  <p className="text-sm font-mono text-neural-text-primary mt-1">{job.recording}</p>
                </div>
                <div>
                  <span className="text-xs text-neural-text-muted flex items-center gap-1"><Clock className="w-3 h-3" /> Duration</span>
                  <p className="text-sm font-mono text-neural-text-primary mt-1">{job.duration}</p>
                </div>
                <div>
                  <span className="text-xs text-neural-text-muted flex items-center gap-1"><Clock className="w-3 h-3" /> Started</span>
                  <p className="text-sm text-neural-text-primary mt-1">{job.startedAt || "—"}</p>
                </div>
                <div>
                  <span className="text-xs text-neural-text-muted flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Completed</span>
                  <p className="text-sm text-neural-text-primary mt-1">{job.completedAt || "—"}</p>
                </div>
              </div>

              {/* Progress */}
              <div className="mb-2">
                <div className="flex items-center justify-between text-xs text-neural-text-muted mb-1">
                  <span>Progress</span>
                  <span>{job.progress}%</span>
                </div>
                <div className="w-full h-2 bg-neural-border rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full neural-transition ${
                      job.status === "completed"
                        ? "bg-neural-accent-green"
                        : job.status === "running"
                        ? "bg-neural-accent-cyan"
                        : "bg-neural-border-bright"
                    }`}
                    style={{ width: `${job.progress}%` }}
                  />
                </div>
              </div>

              {job.result && (
                <div className="mt-3 p-3 rounded-lg bg-neural-accent-green/10 border border-neural-accent-green/20">
                  <div className="flex items-center gap-2 text-sm text-neural-accent-green">
                    <Zap className="w-4 h-4" />
                    <span className="font-medium">Result: {job.result}</span>
                  </div>
                </div>
              )}

              {/* Linked experiment */}
              <div className="mt-4 text-xs text-neural-text-muted">
                Experiment: <span className="text-neural-text-secondary">{job.experimentName}</span>
              </div>
            </div>

            {/* Parameters */}
            <div className="bg-neural-surface rounded-xl border border-neural-border p-5">
              <h2 className="text-sm font-semibold text-neural-text-primary mb-4 flex items-center gap-2">
                <Cpu className="w-4 h-4 text-neural-text-muted" />
                Parameters
              </h2>
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                {job.parameters.map((p) => (
                  <div key={p.label} className="p-3 rounded-lg bg-neural-surface-alt border border-neural-border">
                    <span className="text-xs text-neural-text-muted">{p.label}</span>
                    <p className="text-sm font-mono text-neural-text-primary mt-0.5">{p.value}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Notes */}
            <div className="bg-neural-surface rounded-xl border border-neural-border p-5">
              <h2 className="text-sm font-semibold text-neural-text-primary mb-3">Notes</h2>
              <p className="text-sm text-neural-text-secondary leading-relaxed">{job.notes}</p>
            </div>
          </div>

          {/* Sidebar: Results */}
          <div className="space-y-4">
            {job.outputs.length > 0 && (
              <div className="bg-neural-surface rounded-xl border border-neural-border p-5">
                <h2 className="text-sm font-semibold text-neural-text-primary mb-4 flex items-center gap-2">
                  <Activity className="w-4 h-4 text-neural-accent-green" />
                  Output Metrics
                </h2>
                <div className="space-y-3">
                  {job.outputs.map((o) => (
                    <div key={o.label} className="flex items-center justify-between">
                      <span className="text-xs text-neural-text-muted">{o.label}</span>
                      <span className="text-sm font-mono text-neural-text-primary">{o.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {job.status === "running" && (
              <div className="bg-neural-surface rounded-xl border border-neural-border p-5">
                <h2 className="text-sm font-semibold text-neural-text-primary mb-3">Status</h2>
                <div className="flex items-center gap-2 text-sm text-neural-accent-cyan">
                  <Settings className="w-4 h-4 animate-spin" />
                  <span>Analysis in progress...</span>
                </div>
                <p className="text-xs text-neural-text-muted mt-2">Results will appear here when the job completes.</p>
              </div>
            )}

            {job.status === "queued" && (
              <div className="bg-neural-surface rounded-xl border border-neural-border p-5">
                <h2 className="text-sm font-semibold text-neural-text-primary mb-3">Status</h2>
                <div className="flex items-center gap-2 text-sm text-neural-text-muted">
                  <Clock className="w-4 h-4" />
                  <span>Waiting in queue...</span>
                </div>
                <p className="text-xs text-neural-text-muted mt-2">This job will start when preceding jobs complete.</p>
              </div>
            )}

            {/* Placeholder for visualization */}
            <div className="bg-neural-surface rounded-xl border border-neural-border p-5">
              <h2 className="text-sm font-semibold text-neural-text-primary mb-3">Visualization</h2>
              <div className="aspect-video rounded-lg bg-neural-surface-alt border border-neural-border flex items-center justify-center">
                <div className="text-center">
                  <BarChart3 className="w-8 h-8 text-neural-text-muted mx-auto mb-2" />
                  <p className="text-xs text-neural-text-muted">
                    {job.status === "completed" ? "View in Visualization tab" : "Available after completion"}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
