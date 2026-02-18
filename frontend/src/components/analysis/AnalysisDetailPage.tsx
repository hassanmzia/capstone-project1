import { useRef, useEffect, type ReactNode } from "react";
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

/* ---------- Mini chart components for the visualization panel ---------- */

function SpikeSortingChart() {
  const data = [
    { label: "Single", value: 412, color: "#22d3ee" },
    { label: "Multi", value: 2104, color: "#a78bfa" },
    { label: "Noise", value: 1331, color: "#64748b" },
  ];
  const max = Math.max(...data.map((d) => d.value));
  return (
    <div className="space-y-2">
      <p className="text-xs text-neural-text-muted mb-3">Unit Classification Distribution</p>
      {data.map((d) => (
        <div key={d.label} className="flex items-center gap-2">
          <span className="text-xs text-neural-text-muted w-12 text-right">{d.label}</span>
          <div className="flex-1 h-5 bg-neural-border rounded overflow-hidden">
            <div
              className="h-full rounded"
              style={{ width: `${(d.value / max) * 100}%`, backgroundColor: d.color }}
            />
          </div>
          <span className="text-xs font-mono text-neural-text-primary w-12">{d.value.toLocaleString()}</span>
        </div>
      ))}
      <div className="flex items-center justify-between mt-3 pt-3 border-t border-neural-border">
        <span className="text-xs text-neural-text-muted">Isolation Score</span>
        <span className="text-xs font-mono text-neural-accent-green">0.91 (median)</span>
      </div>
    </div>
  );
}

function BurstDetectionChart() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    // Background grid
    ctx.strokeStyle = "rgba(100,116,139,0.2)";
    ctx.lineWidth = 1;
    for (let y = 0; y < h; y += 20) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // Simulated burst raster with mock data
    const bursts = [
      { start: 0.05, dur: 0.03 }, { start: 0.12, dur: 0.04 }, { start: 0.22, dur: 0.02 },
      { start: 0.31, dur: 0.05 }, { start: 0.38, dur: 0.03 }, { start: 0.47, dur: 0.04 },
      { start: 0.55, dur: 0.02 }, { start: 0.62, dur: 0.06 }, { start: 0.71, dur: 0.03 },
      { start: 0.78, dur: 0.04 }, { start: 0.85, dur: 0.03 }, { start: 0.93, dur: 0.02 },
    ];

    // Draw spike raster lines (background activity)
    ctx.strokeStyle = "rgba(100,116,139,0.3)";
    ctx.lineWidth = 1;
    for (let ch = 0; ch < 8; ch++) {
      const y = 10 + ch * 12;
      for (let i = 0; i < 60; i++) {
        const x = Math.random() * w;
        ctx.beginPath();
        ctx.moveTo(x, y - 3);
        ctx.lineTo(x, y + 3);
        ctx.stroke();
      }
    }

    // Draw bursts as highlighted regions
    bursts.forEach((b) => {
      const x = b.start * w;
      const bw = b.dur * w;
      ctx.fillStyle = "rgba(52, 211, 153, 0.15)";
      ctx.fillRect(x, 0, bw, h);
      ctx.strokeStyle = "rgba(52, 211, 153, 0.6)";
      ctx.lineWidth = 1;
      ctx.strokeRect(x, 0, bw, h);

      // Dense spikes within burst
      ctx.strokeStyle = "rgba(52, 211, 153, 0.8)";
      for (let ch = 0; ch < 8; ch++) {
        const y = 10 + ch * 12;
        const count = 4 + Math.floor(Math.random() * 6);
        for (let s = 0; s < count; s++) {
          const sx = x + Math.random() * bw;
          ctx.beginPath();
          ctx.moveTo(sx, y - 4);
          ctx.lineTo(sx, y + 4);
          ctx.stroke();
        }
      }
    });

    // X-axis labels
    ctx.fillStyle = "rgba(148,163,184,0.6)";
    ctx.font = "9px monospace";
    ctx.fillText("0s", 2, h - 2);
    ctx.fillText("30s", w - 20, h - 2);
  }, []);

  return (
    <div>
      <p className="text-xs text-neural-text-muted mb-2">Burst Raster (8 channels, 30s window)</p>
      <canvas ref={canvasRef} width={320} height={110} className="w-full rounded bg-neural-surface-alt border border-neural-border" />
      <div className="flex items-center gap-4 mt-2 text-xs text-neural-text-muted">
        <span className="flex items-center gap-1">
          <span className="w-3 h-2 rounded bg-emerald-400/30 border border-emerald-400/60 inline-block" />
          Burst events
        </span>
        <span>142 total bursts</span>
      </div>
    </div>
  );
}

function PCAScatterChart() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    // Axes
    ctx.strokeStyle = "rgba(100,116,139,0.3)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(30, h - 20);
    ctx.lineTo(w - 10, h - 20);
    ctx.moveTo(30, h - 20);
    ctx.lineTo(30, 10);
    ctx.stroke();

    ctx.fillStyle = "rgba(148,163,184,0.5)";
    ctx.font = "9px monospace";
    ctx.fillText("PC1", w / 2, h - 4);
    ctx.save();
    ctx.translate(10, h / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText("PC2", 0, 0);
    ctx.restore();

    // Generate 3 mock clusters
    const clusters = [
      { cx: 0.3, cy: 0.7, color: "rgba(34,211,238,0.6)", count: 50 },
      { cx: 0.6, cy: 0.35, color: "rgba(167,139,250,0.6)", count: 45 },
      { cx: 0.75, cy: 0.7, color: "rgba(251,191,36,0.6)", count: 35 },
    ];

    const plotW = w - 40;
    const plotH = h - 30;
    clusters.forEach((cl) => {
      ctx.fillStyle = cl.color;
      for (let i = 0; i < cl.count; i++) {
        const x = 30 + (cl.cx + (Math.random() - 0.5) * 0.2) * plotW;
        const y = 10 + (cl.cy + (Math.random() - 0.5) * 0.2) * plotH;
        ctx.beginPath();
        ctx.arc(x, y, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    });
  }, []);

  return (
    <div>
      <p className="text-xs text-neural-text-muted mb-2">PCA Cluster Projection (partial — 67%)</p>
      <canvas ref={canvasRef} width={320} height={180} className="w-full rounded bg-neural-surface-alt border border-neural-border" />
      <div className="flex items-center gap-3 mt-2 text-xs text-neural-text-muted">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-cyan-400 inline-block" /> Cluster 1</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-violet-400 inline-block" /> Cluster 2</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400 inline-block" /> Cluster 3</span>
      </div>
    </div>
  );
}

function CrossCorrelationChart() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    // Axes
    ctx.strokeStyle = "rgba(100,116,139,0.3)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(30, h - 20);
    ctx.lineTo(w - 10, h - 20);
    ctx.moveTo(w / 2, h - 20);
    ctx.lineTo(w / 2, 5);
    ctx.stroke();

    ctx.fillStyle = "rgba(148,163,184,0.5)";
    ctx.font = "9px monospace";
    ctx.fillText("-50ms", 30, h - 5);
    ctx.fillText("0", w / 2 - 3, h - 5);
    ctx.fillText("+50ms", w - 45, h - 5);

    // Gaussian-like correlogram
    const plotW = w - 40;
    const plotH = h - 30;
    const bins = 100;
    const binW = plotW / bins;
    const center = bins / 2;

    ctx.fillStyle = "rgba(96,165,250,0.5)";
    for (let i = 0; i < bins; i++) {
      const dist = (i - center) / (bins * 0.1);
      const val = Math.exp(-dist * dist / 2) * 0.8 + Math.random() * 0.15;
      const barH = val * plotH;
      ctx.fillRect(30 + i * binW, 5 + plotH - barH, binW - 0.5, barH);
    }

    // Significance line
    ctx.strokeStyle = "rgba(251,113,133,0.6)";
    ctx.setLineDash([4, 3]);
    const sigY = 5 + plotH * 0.7;
    ctx.beginPath();
    ctx.moveTo(30, sigY);
    ctx.lineTo(w - 10, sigY);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = "rgba(251,113,133,0.6)";
    ctx.fillText("p < 0.01", w - 52, sigY - 3);
  }, []);

  return (
    <div>
      <p className="text-xs text-neural-text-muted mb-2">Cross-Correlogram Preview</p>
      <canvas ref={canvasRef} width={320} height={140} className="w-full rounded bg-neural-surface-alt border border-neural-border" />
    </div>
  );
}

function AnalysisVisualization({ job }: { job: AnalysisDetail }) {
  if (job.status === "queued") {
    return (
      <div className="text-center py-6">
        <Clock className="w-8 h-8 text-neural-text-muted mx-auto mb-2" />
        <p className="text-xs text-neural-text-muted">Visualization available after completion</p>
      </div>
    );
  }

  switch (job.type) {
    case "Spike Sorting":
      return <SpikeSortingChart />;
    case "Burst Detection":
      return <BurstDetectionChart />;
    case "PCA Analysis":
    case "PCA / Clustering":
      return <PCAScatterChart />;
    case "Cross-Correlation":
      return job.status === "completed" ? <CrossCorrelationChart /> : (
        <div className="text-center py-6">
          <Settings className="w-8 h-8 text-neural-text-muted mx-auto mb-2 animate-spin" />
          <p className="text-xs text-neural-text-muted">Generating visualization...</p>
        </div>
      );
    default:
      return (
        <div className="text-center py-6">
          <BarChart3 className="w-8 h-8 text-neural-text-muted mx-auto mb-2" />
          <p className="text-xs text-neural-text-muted">No visualization available for this analysis type</p>
        </div>
      );
  }
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

            {/* Visualization */}
            <div className="bg-neural-surface rounded-xl border border-neural-border p-5">
              <h2 className="text-sm font-semibold text-neural-text-primary mb-3 flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-neural-accent-cyan" />
                Visualization
              </h2>
              <AnalysisVisualization job={job} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
