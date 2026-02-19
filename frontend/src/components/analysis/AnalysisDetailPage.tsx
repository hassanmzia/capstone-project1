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
  LayoutDashboard,
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

const ANALYSIS_JOBS_KEY = "cnea_analysis_jobs";

/** Generate plausible detail fields for a user-created analysis job from localStorage */
function buildDetailFromStoredJob(raw: {
  id: string;
  type: string;
  recording: string;
  recordingId?: string;
  status: string;
  progress: number;
  duration: string;
  result: string;
}): AnalysisDetail {
  const now = new Date();
  const completedAt = now.toISOString().slice(0, 16).replace("T", " ");
  const durMinutes = parseInt(raw.duration) || 2;
  const startedAt = new Date(now.getTime() - durMinutes * 60000).toISOString().slice(0, 16).replace("T", " ");

  const paramTemplates: Record<string, { label: string; value: string }[]> = {
    "Combined Analysis": [
      { label: "Mode", value: "Unified (all 6 analysis types)" },
      { label: "Spike Algorithm", value: "Kilosort 3" },
      { label: "Detection Threshold", value: "6.0 std" },
      { label: "Burst Algorithm", value: "LogISI" },
      { label: "Min Burst Spikes", value: "3" },
      { label: "PCA Components", value: "3" },
      { label: "CC Bin Size", value: "0.5 ms" },
      { label: "ISI Bin Size", value: "1 ms" },
      { label: "FFT Window", value: "Hanning" },
      { label: "Spectral Overlap", value: "50%" },
    ],
    "Spike Sorting": [
      { label: "Algorithm", value: "Kilosort 3" },
      { label: "Threshold", value: "6.0 std" },
      { label: "Min Cluster Size", value: "30 spikes" },
      { label: "Max Drift", value: "10 um" },
      { label: "Auto-merge", value: "Threshold 0.85" },
    ],
    "Burst Detection": [
      { label: "Algorithm", value: "LogISI" },
      { label: "Min Burst Spikes", value: "3" },
      { label: "Max ISI (intra-burst)", value: "10 ms" },
      { label: "Min Inter-burst Interval", value: "100 ms" },
    ],
    "PCA / Clustering": [
      { label: "Components", value: "3" },
      { label: "Feature Space", value: "Waveform peaks + PCA" },
      { label: "Normalization", value: "Z-score" },
    ],
    "Cross-Correlation": [
      { label: "Bin Size", value: "0.5 ms" },
      { label: "Window", value: "+/- 50 ms" },
      { label: "Significance", value: "p < 0.01 (jitter)" },
    ],
    "ISI Analysis": [
      { label: "Bin Size", value: "1 ms" },
      { label: "Max ISI", value: "500 ms" },
      { label: "Log Scale", value: "Yes" },
    ],
    "Spectral Analysis": [
      { label: "FFT Window", value: "Hanning" },
      { label: "Segment Length", value: "1.0 s" },
      { label: "Overlap", value: "50%" },
      { label: "Frequency Range", value: "1-500 Hz" },
    ],
  };

  const outputTemplates: Record<string, { label: string; value: string }[]> = {
    "Combined Analysis": [
      { label: "Analyses Run", value: "6 of 6" },
      { label: "Spike Units", value: raw.result.match(/[\d,]+ units/)?.[0]?.split(" ")[0] || "2,841" },
      { label: "Bursts Detected", value: raw.result.match(/(\d+) bursts/)?.[1] || "142" },
      { label: "PCA Variance", value: raw.result.match(/([\d.]+)% PCA/)?.[1] ? `${raw.result.match(/([\d.]+)% PCA/)?.[1]}%` : "85.2%" },
      { label: "Significant CC Pairs", value: "48" },
      { label: "Mean ISI", value: "18.3 ms" },
      { label: "Peak Frequency", value: "6.2 Hz (theta)" },
    ],
    "Spike Sorting": [
      { label: "Total Units", value: raw.result.split(" ")[0] || "—" },
      { label: "Isolation Score", value: "0.87 (median)" },
      { label: "ISI Violations < 2ms", value: "1.5%" },
    ],
    "Burst Detection": [
      { label: "Total Bursts", value: raw.result.split(" ")[0] || "—" },
      { label: "Mean Burst Duration", value: "42.1 ms" },
      { label: "Burst Rate", value: "4.2 /min" },
    ],
    "PCA / Clustering": [
      { label: "Total Explained Variance", value: raw.result.includes("%") ? raw.result.split(",").pop()?.trim() || "—" : "—" },
      { label: "Clusters Found", value: "3" },
      { label: "Silhouette Score", value: "0.76" },
    ],
    "Cross-Correlation": [
      { label: "Total Pairs Tested", value: "820" },
      { label: "Significant Pairs", value: raw.result.split(" ")[0] || "—" },
      { label: "Mean Peak Latency", value: "2.5 ms" },
    ],
    "ISI Analysis": [
      { label: "Mean ISI", value: raw.result.includes("ms") ? raw.result.split(":").pop()?.trim() || "—" : "—" },
      { label: "CV (ISI)", value: "1.12" },
      { label: "Burst Index", value: "0.34" },
    ],
    "Spectral Analysis": [
      { label: "Peak Frequency", value: raw.result.includes("Hz") ? raw.result.split(":").pop()?.trim() || "—" : "—" },
      { label: "Theta Power", value: "42.3%" },
      { label: "Gamma Power", value: "18.7%" },
    ],
  };

  return {
    id: raw.id,
    type: raw.type,
    recording: raw.recording,
    experimentName: "User Analysis",
    status: raw.status === "completed" ? "completed" : raw.status === "running" ? "running" : "queued",
    progress: raw.progress,
    duration: raw.duration,
    result: raw.result,
    startedAt,
    completedAt: raw.status === "completed" ? completedAt : "",
    parameters: paramTemplates[raw.type] || [{ label: "Type", value: raw.type }],
    outputs: raw.status === "completed" ? (outputTemplates[raw.type] || [{ label: "Result", value: raw.result }]) : [],
    notes: `Analysis completed on recording ${raw.recording}. ${raw.result}.`,
  };
}

/** Load a specific analysis job by ID, checking both hardcoded data and localStorage */
function findAnalysisJob(id: string): AnalysisDetail | null {
  // Check hardcoded first
  if (mockAnalysisDb[id]) return mockAnalysisDb[id];
  // Check localStorage
  try {
    const raw = localStorage.getItem(ANALYSIS_JOBS_KEY);
    if (raw) {
      const jobs = JSON.parse(raw) as { id: string; type: string; recording: string; recordingId?: string; status: string; progress: number; duration: string; result: string }[];
      const stored = jobs.find((j) => j.id === id);
      if (stored) return buildDetailFromStoredJob(stored);
    }
  } catch { /* ignore */ }
  return null;
}

const mockAnalysisDb: Record<string, AnalysisDetail> = {
  "a-005": {
    id: "a-005",
    type: "Combined Analysis",
    recording: "session_042",
    experimentName: "Hippocampal CA1 Place Cell Study",
    status: "completed",
    progress: 100,
    duration: "18m 47s",
    result: "6 analyses completed — 3,847 units, 142 bursts, 85.2% PCA variance",
    startedAt: "2026-02-19 08:00",
    completedAt: "2026-02-19 08:19",
    parameters: [
      { label: "Mode", value: "Unified (all 6 analysis types)" },
      { label: "Spike Algorithm", value: "Kilosort 3" },
      { label: "Detection Threshold", value: "6.0 std" },
      { label: "Min Cluster Size", value: "30 spikes" },
      { label: "Burst Algorithm", value: "LogISI" },
      { label: "Min Burst Spikes", value: "3" },
      { label: "Max ISI (intra-burst)", value: "10 ms" },
      { label: "PCA Components", value: "3" },
      { label: "CC Bin Size", value: "0.5 ms" },
      { label: "CC Window", value: "+/- 50 ms" },
      { label: "ISI Bin Size", value: "1 ms" },
      { label: "FFT Window", value: "Hanning" },
      { label: "Spectral Overlap", value: "50%" },
    ],
    outputs: [
      { label: "Analyses Run", value: "6 of 6" },
      { label: "Total Units", value: "3,847" },
      { label: "Single Units", value: "412" },
      { label: "Bursts Detected", value: "142" },
      { label: "Mean Burst Duration", value: "45.2 ms" },
      { label: "PCA Variance", value: "85.2%" },
      { label: "Significant CC Pairs", value: "48" },
      { label: "Mean ISI", value: "18.3 ms" },
      { label: "Peak Frequency", value: "6.2 Hz (theta)" },
    ],
    notes: "Unified analysis covering all 6 analysis types in a single pipeline. Spike sorting yielded 3,847 units with 0.91 median isolation score. Burst detection found 142 network bursts consistent with sharp-wave ripples. PCA explained 85.2% variance across 3 components. Cross-correlation identified 48 significant functional pairs. ISI analysis shows mean 18.3ms interval with burst index 0.34. Spectral analysis reveals dominant theta peak at 6.2 Hz.",
  },
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
    status: "completed",
    progress: 100,
    duration: "3m 45s",
    result: "3 components, 85.2% variance",
    startedAt: "2026-02-18 10:05",
    completedAt: "2026-02-18 10:09",
    parameters: [
      { label: "Components", value: "3" },
      { label: "Feature Space", value: "Waveform peaks + PCA" },
      { label: "Normalization", value: "Z-score" },
      { label: "Channels", value: "All (64)" },
    ],
    outputs: [
      { label: "PC1 Variance", value: "52.3%" },
      { label: "PC2 Variance", value: "21.8%" },
      { label: "PC3 Variance", value: "11.1%" },
      { label: "Total Explained", value: "85.2%" },
      { label: "Clusters Found", value: "3" },
      { label: "Silhouette Score", value: "0.78" },
    ],
    notes: "PCA spike feature extraction completed successfully. First 3 components explain 85.2% of variance. K-means clustering identified 3 distinct unit groups with good separation (silhouette score 0.78).",
  },
  "a-004": {
    id: "a-004",
    type: "Cross-Correlation",
    recording: "session_040",
    experimentName: "Cortical Spike Timing Analysis",
    status: "completed",
    progress: 100,
    duration: "5m 12s",
    result: "48 significant pairs",
    startedAt: "2026-02-18 10:10",
    completedAt: "2026-02-18 10:15",
    parameters: [
      { label: "Bin Size", value: "0.5 ms" },
      { label: "Window", value: "+/- 50 ms" },
      { label: "Unit Pairs", value: "All pairwise" },
      { label: "Significance", value: "p < 0.01 (jitter)" },
    ],
    outputs: [
      { label: "Total Pairs Tested", value: "820" },
      { label: "Significant Pairs", value: "48" },
      { label: "Excitatory Connections", value: "31" },
      { label: "Inhibitory Connections", value: "17" },
      { label: "Mean Peak Latency", value: "2.3 ms" },
      { label: "Strongest Pair CC", value: "0.42" },
    ],
    notes: "Cross-correlation analysis completed. Found 48 significant pairwise connections out of 820 tested pairs. Network shows predominantly excitatory connections with short latencies consistent with monosynaptic transmission.",
  },
};

const typeIcons: Record<string, typeof GitBranch> = {
  "Combined Analysis": LayoutDashboard,
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
      <p className="text-xs text-neural-text-muted mb-2">PCA Cluster Projection (3 components, 85.2% variance)</p>
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

function SpectralAnalysisChart() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const padL = 36;
    const padR = 10;
    const padT = 10;
    const padB = 28;
    const plotW = w - padL - padR;
    const plotH = h - padT - padB;

    // Background grid
    ctx.strokeStyle = "rgba(100,116,139,0.15)";
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = padT + (plotH / 4) * i;
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(w - padR, y);
      ctx.stroke();
    }

    // Frequency bands (shaded regions)
    const bands = [
      { name: "Delta", fMin: 1, fMax: 4, color: "rgba(139,92,246,0.08)" },
      { name: "Theta", fMin: 4, fMax: 8, color: "rgba(6,182,212,0.12)" },
      { name: "Alpha", fMin: 8, fMax: 13, color: "rgba(52,211,153,0.10)" },
      { name: "Beta", fMin: 13, fMax: 30, color: "rgba(251,191,36,0.10)" },
      { name: "Gamma", fMin: 30, fMax: 100, color: "rgba(244,63,94,0.08)" },
    ];

    const maxFreq = 200;
    const freqToX = (f: number) => padL + (Math.log10(Math.max(f, 1)) / Math.log10(maxFreq)) * plotW;

    bands.forEach((band) => {
      const x1 = freqToX(band.fMin);
      const x2 = freqToX(band.fMax);
      ctx.fillStyle = band.color;
      ctx.fillRect(x1, padT, x2 - x1, plotH);
    });

    // Generate PSD curve (1/f shape with band peaks)
    const points: { x: number; y: number }[] = [];
    for (let f = 1; f <= maxFreq; f += 0.5) {
      // Base 1/f slope
      let power = 60 / (f * 0.3 + 1);
      // Theta peak at ~6 Hz
      power += 18 * Math.exp(-((f - 6) ** 2) / 4);
      // Alpha peak at ~10 Hz
      power += 10 * Math.exp(-((f - 10) ** 2) / 3);
      // Beta bump at ~20 Hz
      power += 5 * Math.exp(-((f - 20) ** 2) / 20);
      // Small gamma bump at ~40 Hz
      power += 3 * Math.exp(-((f - 40) ** 2) / 40);
      // Noise
      power += (Math.random() - 0.5) * 1.5;

      const x = freqToX(f);
      const y = padT + plotH - (power / 80) * plotH;
      points.push({ x, y: Math.max(padT, Math.min(padT + plotH, y)) });
    }

    // Fill area under curve
    ctx.beginPath();
    ctx.moveTo(points[0].x, padT + plotH);
    points.forEach((p) => ctx.lineTo(p.x, p.y));
    ctx.lineTo(points[points.length - 1].x, padT + plotH);
    ctx.closePath();
    ctx.fillStyle = "rgba(6,182,212,0.1)";
    ctx.fill();

    // Draw PSD line
    ctx.beginPath();
    points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.strokeStyle = "#06b6d4";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Axes
    ctx.strokeStyle = "rgba(100,116,139,0.4)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padL, padT + plotH);
    ctx.lineTo(w - padR, padT + plotH);
    ctx.moveTo(padL, padT);
    ctx.lineTo(padL, padT + plotH);
    ctx.stroke();

    // Frequency labels
    ctx.fillStyle = "rgba(148,163,184,0.6)";
    ctx.font = "9px monospace";
    [1, 4, 10, 30, 100].forEach((f) => {
      const x = freqToX(f);
      ctx.fillText(`${f}`, x - 4, padT + plotH + 12);
    });
    ctx.fillText("Hz", w - padR - 10, padT + plotH + 12);

    // Y-axis label
    ctx.save();
    ctx.translate(8, padT + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText("Power (dB)", -20, 0);
    ctx.restore();

    // Band labels at top
    ctx.font = "8px sans-serif";
    const bandLabels = [
      { name: "δ", f: 2.5, color: "rgba(139,92,246,0.7)" },
      { name: "θ", f: 6, color: "rgba(6,182,212,0.9)" },
      { name: "α", f: 10, color: "rgba(52,211,153,0.8)" },
      { name: "β", f: 20, color: "rgba(251,191,36,0.8)" },
      { name: "γ", f: 55, color: "rgba(244,63,94,0.7)" },
    ];
    bandLabels.forEach((bl) => {
      ctx.fillStyle = bl.color;
      ctx.fillText(bl.name, freqToX(bl.f) - 3, padT + 10);
    });
  }, []);

  return (
    <div>
      <p className="text-xs text-neural-text-muted mb-2">Power Spectral Density (log frequency scale)</p>
      <canvas ref={canvasRef} width={320} height={180} className="w-full rounded bg-neural-surface-alt border border-neural-border" />
      <div className="flex items-center gap-2 mt-2 flex-wrap">
        {[
          { label: "Theta", pct: "42.3%", color: "bg-cyan-400" },
          { label: "Alpha", pct: "21.5%", color: "bg-emerald-400" },
          { label: "Beta", pct: "17.5%", color: "bg-amber-400" },
          { label: "Gamma", pct: "18.7%", color: "bg-rose-400" },
        ].map((b) => (
          <span key={b.label} className="flex items-center gap-1 text-[10px] text-neural-text-muted">
            <span className={`w-1.5 h-1.5 rounded-full ${b.color} inline-block`} />
            {b.label} {b.pct}
          </span>
        ))}
      </div>
    </div>
  );
}

function ISIAnalysisChart() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const padL = 36;
    const padR = 10;
    const padT = 10;
    const padB = 28;
    const plotW = w - padL - padR;
    const plotH = h - padT - padB;

    // Background grid
    ctx.strokeStyle = "rgba(100,116,139,0.15)";
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = padT + (plotH / 4) * i;
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(w - padR, y);
      ctx.stroke();
    }

    // Generate ISI histogram (log-normal distribution typical for neural data)
    const bins = 50;
    const binW = plotW / bins;
    const maxISI = 500; // ms
    const values: number[] = [];

    for (let i = 0; i < bins; i++) {
      const isiCenter = (i + 0.5) * (maxISI / bins);
      // Log-normal distribution with peak around 15-20ms
      const logISI = Math.log(Math.max(isiCenter, 0.1));
      const mu = 2.8; // peak ~16ms
      const sigma = 0.8;
      let val = Math.exp(-((logISI - mu) ** 2) / (2 * sigma * sigma));
      // Second smaller peak (bursting) around 3-5ms
      val += 0.4 * Math.exp(-((isiCenter - 4) ** 2) / 5);
      // Noise
      val += Math.random() * 0.03;
      values.push(val);
    }

    const maxVal = Math.max(...values);

    // Refractory period zone (0-2ms)
    const refractoryX = padL + (2 / maxISI) * plotW;
    ctx.fillStyle = "rgba(239,68,68,0.08)";
    ctx.fillRect(padL, padT, refractoryX - padL, plotH);
    ctx.strokeStyle = "rgba(239,68,68,0.3)";
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(refractoryX, padT);
    ctx.lineTo(refractoryX, padT + plotH);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "rgba(239,68,68,0.5)";
    ctx.font = "8px sans-serif";
    ctx.fillText("2ms", refractoryX + 1, padT + 10);

    // Draw histogram bars
    values.forEach((val, i) => {
      const barH = (val / maxVal) * plotH;
      const x = padL + i * binW;
      const isi = (i + 0.5) * (maxISI / bins);

      // Color: short ISIs in cyan, medium in green, long in amber
      if (isi < 10) {
        ctx.fillStyle = "rgba(6,182,212,0.6)";
      } else if (isi < 50) {
        ctx.fillStyle = "rgba(52,211,153,0.5)";
      } else {
        ctx.fillStyle = "rgba(251,191,36,0.4)";
      }

      ctx.fillRect(x, padT + plotH - barH, binW - 0.5, barH);
    });

    // Axes
    ctx.strokeStyle = "rgba(100,116,139,0.4)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padL, padT + plotH);
    ctx.lineTo(w - padR, padT + plotH);
    ctx.moveTo(padL, padT);
    ctx.lineTo(padL, padT + plotH);
    ctx.stroke();

    // X-axis labels
    ctx.fillStyle = "rgba(148,163,184,0.6)";
    ctx.font = "9px monospace";
    [0, 50, 100, 200, 500].forEach((ms) => {
      const x = padL + (ms / maxISI) * plotW;
      ctx.fillText(`${ms}`, x - 6, padT + plotH + 12);
    });
    ctx.fillText("ms", w - padR - 12, padT + plotH + 12);

    // Y-axis label
    ctx.save();
    ctx.translate(8, padT + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText("Count", -12, 0);
    ctx.restore();
  }, []);

  return (
    <div>
      <p className="text-xs text-neural-text-muted mb-2">Inter-Spike Interval Distribution (0-500 ms)</p>
      <canvas ref={canvasRef} width={320} height={160} className="w-full rounded bg-neural-surface-alt border border-neural-border" />
      <div className="flex items-center justify-between mt-2 text-[10px] text-neural-text-muted">
        <span className="flex items-center gap-1">
          <span className="w-3 h-2 rounded bg-red-400/20 border border-red-400/40 inline-block" />
          Refractory (&lt;2ms)
        </span>
        <span>Mean ISI: 18.3 ms</span>
        <span>CV: 1.12</span>
      </div>
    </div>
  );
}

/** Combined analysis shows all 6 chart types in a 2×3 grid */
function CombinedAnalysisVisualization() {
  const sections = [
    { title: "Spike Sorting", icon: GitBranch, color: "text-neural-accent-cyan", chart: <SpikeSortingChart /> },
    { title: "Burst Detection", icon: TrendingUp, color: "text-neural-accent-green", chart: <BurstDetectionChart /> },
    { title: "PCA / Clustering", icon: Layers, color: "text-neural-accent-purple", chart: <PCAScatterChart /> },
    { title: "Cross-Correlation", icon: Sigma, color: "text-neural-accent-blue", chart: <CrossCorrelationChart /> },
    { title: "Spectral Analysis", icon: TrendingUp, color: "text-neural-accent-rose", chart: <SpectralAnalysisChart /> },
    { title: "ISI Analysis", icon: BarChart3, color: "text-neural-accent-amber", chart: <ISIAnalysisChart /> },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {sections.map((s) => {
        const Icon = s.icon;
        return (
          <div
            key={s.title}
            className="bg-neural-surface rounded-xl border border-neural-border p-4"
          >
            <div className="flex items-center gap-2 mb-3">
              <Icon className={`w-4 h-4 ${s.color}`} />
              <h3 className="text-xs font-semibold text-neural-text-secondary uppercase tracking-wider">{s.title}</h3>
            </div>
            {s.chart}
          </div>
        );
      })}
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
    case "Combined Analysis":
      return <CombinedAnalysisVisualization />;
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
    case "Spectral Analysis":
      return <SpectralAnalysisChart />;
    case "ISI Analysis":
      return <ISIAnalysisChart />;
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

  const job = id ? findAnalysisJob(id) : null;

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
        {/* Full-width visualization panel for Combined Analysis */}
        {job.type === "Combined Analysis" && job.status === "completed" && (
          <div className="mb-4">
            <div className="bg-neural-surface rounded-xl border border-neural-border p-5">
              <h2 className="text-sm font-semibold text-neural-text-primary mb-4 flex items-center gap-2">
                <LayoutDashboard className="w-4 h-4 text-neural-accent-green" />
                Combined Visualization — All 6 Analyses
              </h2>
              <CombinedAnalysisVisualization />
            </div>
          </div>
        )}

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
