import { useMemo } from "react";
import { useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import type { RootState } from "@/store";
import { useRecordingSession } from "@/contexts/RecordingSessionContext";
import type { AnalysisJob } from "@/components/analysis/AnalysisPage";
import {
  Activity,
  Circle,
  Play,
  Zap,
  Cpu,
  HardDrive,
  Thermometer,
  Clock,
  TrendingUp,
  CheckCircle2,
  FlaskConical,
  BarChart3,
  Eye,
  ChevronRight,
  ArrowRight,
  FileText,
  AlertCircle,
  GitBranch,
  Layers,
  Sigma,
  Database,
} from "lucide-react";

/* ── localStorage keys ── */
const RECORDINGS_KEY = "cnea_recordings";
const ANALYSIS_JOBS_KEY = "cnea_analysis_jobs";

/* ── Shared types from other pages ── */
interface RecordingEntry {
  id: string;
  name: string;
  experimentName: string;
  date: string;
  duration: string;
  spikeCount: number;
  channels: number;
  fileSize: string;
  format: string;
  status: "completed" | "error" | "processing";
  sampleRate?: string;
}

interface ExperimentEntry {
  id: string;
  name: string;
  status: "draft" | "active" | "completed" | "archived";
  owner: string;
  createdAt: string;
  recordingCount: number;
  description: string;
}

/* ── Seed experiments (same as ExperimentListPage) ── */
const seedExperiments: ExperimentEntry[] = [
  { id: "exp-001", name: "Hippocampal CA1 Place Cell Study", description: "Recording place cell activity during spatial navigation task", status: "active", owner: "Dr. Chen", createdAt: "2026-02-15", recordingCount: 12 },
  { id: "exp-002", name: "Cortical Spike Timing Analysis", description: "High-density recording of cortical microcircuit dynamics", status: "active", owner: "Dr. Patel", createdAt: "2026-02-10", recordingCount: 8 },
  { id: "exp-003", name: "Retinal Ganglion Response Mapping", description: "Full-field mapping of retinal ganglion cell responses", status: "completed", owner: "Dr. Kim", createdAt: "2026-01-28", recordingCount: 24 },
  { id: "exp-004", name: "Drug Screening - Compound 47B", description: "Evaluating neural activity modulation by compound 47B", status: "draft", owner: "Dr. Martinez", createdAt: "2026-02-17", recordingCount: 0 },
  { id: "exp-005", name: "Network Burst Detection Validation", description: "Benchmarking burst detection algorithms", status: "archived", owner: "Dr. Chen", createdAt: "2025-12-15", recordingCount: 36 },
];

/* ── Seed recordings (fallback if localStorage is empty) ── */
const seedRecordings: RecordingEntry[] = [
  { id: "rec-042", name: "session_042", experimentName: "Hippocampal CA1 Place Cell Study", date: "2026-02-18 09:15", duration: "15:32", spikeCount: 48291, channels: 64, fileSize: "2.4 GB", format: "HDF5", status: "completed", sampleRate: "30000" },
  { id: "rec-041", name: "session_041", experimentName: "Hippocampal CA1 Place Cell Study", date: "2026-02-17 14:22", duration: "30:10", spikeCount: 95100, channels: 64, fileSize: "4.8 GB", format: "HDF5", status: "completed", sampleRate: "30000" },
  { id: "rec-040", name: "session_040", experimentName: "Cortical Spike Timing Analysis", date: "2026-02-16 11:05", duration: "10:00", spikeCount: 22430, channels: 32, fileSize: "1.1 GB", format: "NWB", status: "completed", sampleRate: "30000" },
  { id: "rec-039", name: "session_039", experimentName: "Cortical Spike Timing Analysis", date: "2026-02-15 16:40", duration: "05:45", spikeCount: 0, channels: 32, fileSize: "540 MB", format: "NWB", status: "processing", sampleRate: "30000" },
  { id: "rec-038", name: "session_038", experimentName: "Retinal Ganglion Response Mapping", date: "2026-02-14 10:30", duration: "20:00", spikeCount: 67800, channels: 128, fileSize: "6.2 GB", format: "HDF5", status: "completed", sampleRate: "20000" },
  { id: "rec-037", name: "session_037_failed", experimentName: "Retinal Ganglion Response Mapping", date: "2026-02-14 09:00", duration: "02:15", spikeCount: 1200, channels: 128, fileSize: "320 MB", format: "RAW", status: "error", sampleRate: "20000" },
];

/* ── Seed analysis jobs ── */
const seedAnalysisJobs: AnalysisJob[] = [
  { id: "a-001", type: "Spike Sorting", recording: "session_042", recordingId: "rec-042", status: "completed", progress: 100, duration: "4m 32s", result: "3,847 units classified" },
  { id: "a-002", type: "Burst Detection", recording: "session_041", recordingId: "rec-041", status: "completed", progress: 100, duration: "1m 18s", result: "142 bursts detected" },
  { id: "a-003", type: "PCA Analysis", recording: "session_042", recordingId: "rec-042", status: "completed", progress: 100, duration: "3m 45s", result: "3 components, 85.2% variance" },
  { id: "a-004", type: "Cross-Correlation", recording: "session_040", recordingId: "rec-040", status: "completed", progress: 100, duration: "5m 12s", result: "48 significant pairs" },
];

/* ── Data loaders ── */
function loadRecordings(): RecordingEntry[] {
  try {
    const raw = localStorage.getItem(RECORDINGS_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return seedRecordings;
}

function loadAnalysisJobs(): AnalysisJob[] {
  try {
    const raw = localStorage.getItem(ANALYSIS_JOBS_KEY);
    if (raw) {
      const userJobs: AnalysisJob[] = JSON.parse(raw);
      return [...userJobs, ...seedAnalysisJobs];
    }
  } catch { /* ignore */ }
  return seedAnalysisJobs;
}

function parseSizeToGB(s: string): number {
  const match = s.match(/([\d.]+)\s*(GB|MB|KB|B)/i);
  if (!match) return 0;
  const val = parseFloat(match[1]);
  const unit = match[2].toUpperCase();
  if (unit === "GB") return val;
  if (unit === "MB") return val / 1024;
  if (unit === "KB") return val / (1024 * 1024);
  return val / (1024 * 1024 * 1024);
}

function parseDurationToSeconds(d: string): number {
  const parts = d.split(":").map(Number);
  if (parts.length === 2) return (parts[0] || 0) * 60 + (parts[1] || 0);
  if (parts.length === 3) return (parts[0] || 0) * 3600 + (parts[1] || 0) * 60 + (parts[2] || 0);
  return 0;
}

function formatElapsed(startedAt: number): string {
  const secs = Math.floor((Date.now() - startedAt) / 1000);
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

function analysisTypeIcon(type: string) {
  if (type.toLowerCase().includes("spike")) return GitBranch;
  if (type.toLowerCase().includes("burst")) return TrendingUp;
  if (type.toLowerCase().includes("pca") || type.toLowerCase().includes("cluster")) return Layers;
  if (type.toLowerCase().includes("cross") || type.toLowerCase().includes("corr")) return Sigma;
  if (type.toLowerCase().includes("isi")) return BarChart3;
  if (type.toLowerCase().includes("spectral")) return TrendingUp;
  return BarChart3;
}

/* ── Status Badge ── */
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

/* ── Activity Feed Item Generator ── */
interface ActivityItem {
  action: string;
  detail: string;
  time: string;
  icon: typeof Activity;
  color: string;
}

function generateActivityFeed(recordings: RecordingEntry[], analyses: AnalysisJob[]): ActivityItem[] {
  const items: ActivityItem[] = [];

  // Add recording activities
  for (const rec of recordings.slice(0, 5)) {
    if (rec.status === "completed") {
      items.push({
        action: "Recording completed",
        detail: `${rec.name} - ${rec.duration}`,
        time: rec.date,
        icon: CheckCircle2,
        color: "text-neural-accent-green",
      });
    } else if (rec.status === "error") {
      items.push({
        action: "Recording failed",
        detail: rec.name,
        time: rec.date,
        icon: AlertCircle,
        color: "text-neural-accent-red",
      });
    } else if (rec.status === "processing") {
      items.push({
        action: "Recording processing",
        detail: rec.name,
        time: rec.date,
        icon: Clock,
        color: "text-neural-accent-amber",
      });
    }
  }

  // Add analysis activities
  for (const job of analyses.slice(0, 4)) {
    items.push({
      action: `${job.type} completed`,
      detail: job.result,
      time: `on ${job.recording}`,
      icon: BarChart3,
      color: "text-neural-accent-cyan",
    });
  }

  // Sort by recency (recordings have actual dates, analysis put at end)
  return items.slice(0, 8);
}

/* ── Main Dashboard ── */
export default function DashboardPage() {
  const navigate = useNavigate();
  const { mode, activeSession } = useRecordingSession();
  const agents = useSelector((state: RootState) => state.agents.agents);
  const config = useSelector((state: RootState) => state.config);

  const recordings = useMemo(() => loadRecordings(), []);
  const analysisJobs = useMemo(() => loadAnalysisJobs(), []);

  // Computed stats
  const stats = useMemo(() => {
    const completedRecs = recordings.filter((r) => r.status === "completed");
    const totalSpikes = completedRecs.reduce((sum, r) => sum + r.spikeCount, 0);
    const totalDataGB = recordings.reduce((sum, r) => sum + parseSizeToGB(r.fileSize), 0);
    const totalDurationSecs = completedRecs.reduce((sum, r) => sum + parseDurationToSeconds(r.duration), 0);
    const completedAnalyses = analysisJobs.filter((j) => j.status === "completed").length;
    const activeExperiments = seedExperiments.filter((e) => e.status === "active").length;
    const onlineAgents = agents.filter((a) => a.status === "online").length;

    return {
      totalRecordings: recordings.length,
      completedRecordings: completedRecs.length,
      totalSpikes,
      totalDataGB,
      totalDurationSecs,
      completedAnalyses,
      totalAnalyses: analysisJobs.length,
      activeExperiments,
      totalExperiments: seedExperiments.length,
      onlineAgents,
      totalAgents: agents.length,
    };
  }, [recordings, analysisJobs, agents]);

  const activityFeed = useMemo(
    () => generateActivityFeed(recordings, analysisJobs),
    [recordings, analysisJobs],
  );

  // Heatmap data (electrode activity preview)
  const heatmapData = useMemo(() => Array.from({ length: 64 }, () => Math.random()), []);

  return (
    <div className="flex flex-col gap-3 md:gap-4 h-full overflow-y-auto pr-1">
      {/* ── Live Session Banner ── */}
      {mode === "live" && activeSession && (
        <div className="bg-gradient-to-r from-neural-accent-red/10 via-neural-accent-red/5 to-transparent rounded-xl border border-neural-accent-red/30 p-3 md:p-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <div className="relative">
                <Circle className="w-3 h-3 text-neural-accent-red fill-neural-accent-red animate-neural-pulse" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-neural-accent-red uppercase tracking-wider">
                    Live Recording
                  </span>
                  <span className="text-sm font-mono text-neural-text-primary">{activeSession.name}</span>
                </div>
                <div className="flex items-center gap-4 mt-0.5 text-xs text-neural-text-muted">
                  <span>{activeSession.experimentName}</span>
                  <span>{activeSession.channels} ch</span>
                  <span>{(activeSession.sampleRate / 1000).toFixed(0)} kHz</span>
                  <span className="font-mono">{formatElapsed(activeSession.startedAt)}</span>
                  {activeSession.isPaused && (
                    <span className="px-1.5 py-0.5 rounded bg-neural-accent-amber/20 text-neural-accent-amber text-xs">
                      PAUSED
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => navigate("/recordings")}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-neural-accent-red/20 text-neural-accent-red border border-neural-accent-red/30 hover:bg-neural-accent-red/30 neural-transition"
              >
                <Eye className="w-3.5 h-3.5" />
                View Recording
              </button>
              <button
                onClick={() => navigate("/visualization")}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-neural-accent-cyan/20 text-neural-accent-cyan border border-neural-accent-cyan/30 hover:bg-neural-accent-cyan/30 neural-transition"
              >
                <Activity className="w-3.5 h-3.5" />
                Live Visualizer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Summary Stats Row ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Recordings */}
        <button
          onClick={() => navigate("/recordings")}
          className="bg-neural-surface rounded-xl border border-neural-border p-4 hover:border-neural-border-bright neural-transition text-left group"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="p-2 rounded-lg bg-neural-accent-cyan/10">
              <HardDrive className="w-5 h-5 text-neural-accent-cyan" />
            </div>
            <ChevronRight className="w-4 h-4 text-neural-text-muted opacity-0 group-hover:opacity-100 neural-transition" />
          </div>
          <div className="text-2xl font-mono font-bold text-neural-text-primary">
            {stats.totalRecordings}
          </div>
          <div className="text-xs text-neural-text-muted mt-0.5">
            Recordings <span className="text-neural-accent-green">({stats.completedRecordings} completed)</span>
          </div>
        </button>

        {/* Experiments */}
        <button
          onClick={() => navigate("/experiments")}
          className="bg-neural-surface rounded-xl border border-neural-border p-4 hover:border-neural-border-bright neural-transition text-left group"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="p-2 rounded-lg bg-neural-accent-purple/10">
              <FlaskConical className="w-5 h-5 text-neural-accent-purple" />
            </div>
            <ChevronRight className="w-4 h-4 text-neural-text-muted opacity-0 group-hover:opacity-100 neural-transition" />
          </div>
          <div className="text-2xl font-mono font-bold text-neural-text-primary">
            {stats.totalExperiments}
          </div>
          <div className="text-xs text-neural-text-muted mt-0.5">
            Experiments <span className="text-neural-accent-green">({stats.activeExperiments} active)</span>
          </div>
        </button>

        {/* Analyses */}
        <button
          onClick={() => navigate("/analysis")}
          className="bg-neural-surface rounded-xl border border-neural-border p-4 hover:border-neural-border-bright neural-transition text-left group"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="p-2 rounded-lg bg-neural-accent-green/10">
              <BarChart3 className="w-5 h-5 text-neural-accent-green" />
            </div>
            <ChevronRight className="w-4 h-4 text-neural-text-muted opacity-0 group-hover:opacity-100 neural-transition" />
          </div>
          <div className="text-2xl font-mono font-bold text-neural-text-primary">
            {stats.completedAnalyses}
          </div>
          <div className="text-xs text-neural-text-muted mt-0.5">
            Analyses <span className="text-neural-accent-cyan">({stats.totalAnalyses} total)</span>
          </div>
        </button>

        {/* Total Spikes */}
        <div className="bg-neural-surface rounded-xl border border-neural-border p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="p-2 rounded-lg bg-neural-accent-amber/10">
              <Zap className="w-5 h-5 text-neural-accent-amber" />
            </div>
          </div>
          <div className="text-2xl font-mono font-bold text-neural-text-primary">
            {stats.totalSpikes >= 1000 ? `${(stats.totalSpikes / 1000).toFixed(1)}K` : stats.totalSpikes}
          </div>
          <div className="text-xs text-neural-text-muted mt-0.5">
            Total Spikes <span className="text-neural-accent-blue">({stats.totalDataGB.toFixed(1)} GB data)</span>
          </div>
        </div>
      </div>

      {/* ── Main Content Grid ── */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3 md:gap-4 flex-1 min-h-0">
        {/* ── Recent Recordings ── */}
        <div className="md:col-span-12 lg:col-span-4 bg-neural-surface rounded-xl border border-neural-border p-3 md:p-4 flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <HardDrive className="w-4 h-4 text-neural-accent-cyan" />
              <h2 className="text-xs font-semibold text-neural-text-secondary uppercase tracking-wider">
                Recent Recordings
              </h2>
            </div>
            <button
              onClick={() => navigate("/recordings")}
              className="text-xs text-neural-accent-cyan hover:text-neural-accent-cyan/80 neural-transition flex items-center gap-1"
            >
              View all <ArrowRight className="w-3 h-3" />
            </button>
          </div>

          <div className="space-y-2 flex-1">
            {recordings.slice(0, 5).map((rec) => (
              <button
                key={rec.id}
                onClick={() => navigate(`/recordings/${rec.id}`)}
                className="flex items-center gap-3 w-full p-2.5 rounded-lg bg-neural-surface-alt hover:bg-neural-border neural-transition text-left border border-transparent hover:border-neural-border-bright"
              >
                <div className="shrink-0">
                  {rec.status === "completed" ? (
                    <CheckCircle2 className="w-4 h-4 text-neural-accent-green" />
                  ) : rec.status === "error" ? (
                    <AlertCircle className="w-4 h-4 text-neural-accent-red" />
                  ) : (
                    <Clock className="w-4 h-4 text-neural-accent-amber" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-mono font-medium text-neural-text-primary truncate">
                    {rec.name}
                  </div>
                  <div className="text-xs text-neural-text-muted truncate">
                    {rec.experimentName}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-xs font-mono text-neural-text-secondary">{rec.duration}</div>
                  <div className="text-xs text-neural-text-muted">{rec.fileSize}</div>
                </div>
              </button>
            ))}
          </div>

          {/* Quick start recording */}
          <button
            onClick={() => navigate("/recordings")}
            className="flex items-center justify-center gap-2 w-full mt-3 px-3 py-2 rounded-lg text-xs bg-neural-accent-cyan/10 text-neural-accent-cyan border border-neural-accent-cyan/20 hover:bg-neural-accent-cyan/20 neural-transition"
          >
            <Play className="w-3.5 h-3.5" />
            Start New Recording
          </button>
        </div>

        {/* ── Recent Analysis ── */}
        <div className="md:col-span-12 lg:col-span-4 bg-neural-surface rounded-xl border border-neural-border p-3 md:p-4 flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-neural-accent-green" />
              <h2 className="text-xs font-semibold text-neural-text-secondary uppercase tracking-wider">
                Recent Analysis
              </h2>
            </div>
            <button
              onClick={() => navigate("/analysis")}
              className="text-xs text-neural-accent-green hover:text-neural-accent-green/80 neural-transition flex items-center gap-1"
            >
              View all <ArrowRight className="w-3 h-3" />
            </button>
          </div>

          <div className="space-y-2 flex-1">
            {analysisJobs.slice(0, 5).map((job) => {
              const Icon = analysisTypeIcon(job.type);
              return (
                <button
                  key={job.id}
                  onClick={() => navigate(`/analysis/${job.id}`)}
                  className="flex items-center gap-3 w-full p-2.5 rounded-lg bg-neural-surface-alt hover:bg-neural-border neural-transition text-left border border-transparent hover:border-neural-border-bright"
                >
                  <div className="shrink-0">
                    <Icon className="w-4 h-4 text-neural-accent-green" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-neural-text-primary truncate">
                      {job.type}
                    </div>
                    <div className="text-xs text-neural-text-muted truncate">
                      {job.result}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xs font-mono text-neural-text-secondary">{job.recording}</div>
                    <div className="text-xs text-neural-text-muted">{job.duration}</div>
                  </div>
                </button>
              );
            })}
          </div>

          <button
            onClick={() => navigate("/analysis/new")}
            className="flex items-center justify-center gap-2 w-full mt-3 px-3 py-2 rounded-lg text-xs bg-neural-accent-green/10 text-neural-accent-green border border-neural-accent-green/20 hover:bg-neural-accent-green/20 neural-transition"
          >
            <Play className="w-3.5 h-3.5" />
            New Analysis
          </button>
        </div>

        {/* ── Right Column: System + Quick Actions ── */}
        <div className="md:col-span-12 lg:col-span-4 flex flex-col gap-3 md:gap-4">
          {/* System Health */}
          <div className="bg-neural-surface rounded-xl border border-neural-border p-4">
            <div className="flex items-center gap-2 mb-3">
              <Cpu className="w-4 h-4 text-neural-accent-cyan" />
              <h2 className="text-xs font-semibold text-neural-text-secondary uppercase tracking-wider">
                System Health
              </h2>
              <div className="flex-1" />
              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-neural-accent-green/20 text-neural-accent-green">
                {stats.onlineAgents}/{stats.totalAgents} online
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="flex items-center gap-2 p-2 rounded-lg bg-neural-surface-alt">
                <Zap className="w-3.5 h-3.5 text-neural-accent-amber shrink-0" />
                <div>
                  <div className="text-xs text-neural-text-muted">FPGA</div>
                  <div className="text-xs font-medium text-neural-accent-green">Ready</div>
                </div>
              </div>
              <div className="flex items-center gap-2 p-2 rounded-lg bg-neural-surface-alt">
                <Thermometer className="w-3.5 h-3.5 text-neural-accent-red shrink-0" />
                <div>
                  <div className="text-xs text-neural-text-muted">Temp</div>
                  <div className="text-xs font-mono font-medium text-neural-text-primary">34.2°C</div>
                </div>
              </div>
              <div className="flex items-center gap-2 p-2 rounded-lg bg-neural-surface-alt">
                <Activity className="w-3.5 h-3.5 text-neural-accent-cyan shrink-0" />
                <div>
                  <div className="text-xs text-neural-text-muted">Sample Rate</div>
                  <div className="text-xs font-mono font-medium text-neural-text-primary">30 kHz</div>
                </div>
              </div>
              <div className="flex items-center gap-2 p-2 rounded-lg bg-neural-surface-alt">
                <TrendingUp className="w-3.5 h-3.5 text-neural-accent-purple shrink-0" />
                <div>
                  <div className="text-xs text-neural-text-muted">Gain</div>
                  <div className="text-xs font-mono font-medium text-neural-text-primary uppercase">{config.gainMode}</div>
                </div>
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="bg-neural-surface rounded-xl border border-neural-border p-4">
            <div className="flex items-center gap-2 mb-3">
              <Zap className="w-4 h-4 text-neural-accent-amber" />
              <h2 className="text-xs font-semibold text-neural-text-secondary uppercase tracking-wider">
                Quick Actions
              </h2>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => navigate("/recordings")}
                className="flex items-center gap-2 p-2.5 rounded-lg bg-neural-accent-green/10 text-neural-accent-green hover:bg-neural-accent-green/20 neural-transition border border-neural-accent-green/20 text-xs font-medium"
              >
                <Play className="w-4 h-4 shrink-0" />
                Record
              </button>
              <button
                onClick={() => navigate("/analysis/new")}
                className="flex items-center gap-2 p-2.5 rounded-lg bg-neural-accent-cyan/10 text-neural-accent-cyan hover:bg-neural-accent-cyan/20 neural-transition border border-neural-accent-cyan/20 text-xs font-medium"
              >
                <BarChart3 className="w-4 h-4 shrink-0" />
                Analyze
              </button>
              <button
                onClick={() => navigate("/visualization")}
                className="flex items-center gap-2 p-2.5 rounded-lg bg-neural-accent-purple/10 text-neural-accent-purple hover:bg-neural-accent-purple/20 neural-transition border border-neural-accent-purple/20 text-xs font-medium"
              >
                <Eye className="w-4 h-4 shrink-0" />
                Visualize
              </button>
              <button
                onClick={() => navigate("/experiments/new")}
                className="flex items-center gap-2 p-2.5 rounded-lg bg-neural-accent-amber/10 text-neural-accent-amber hover:bg-neural-accent-amber/20 neural-transition border border-neural-accent-amber/20 text-xs font-medium"
              >
                <FlaskConical className="w-4 h-4 shrink-0" />
                Experiment
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Bottom Row ── */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3 md:gap-4">
        {/* Spike Heatmap */}
        <div className="md:col-span-6 lg:col-span-3 bg-neural-surface rounded-xl border border-neural-border p-3 md:p-4">
          <div className="flex items-center gap-2 mb-3">
            <Activity className="w-4 h-4 text-neural-accent-cyan" />
            <h2 className="text-xs font-semibold text-neural-text-secondary uppercase tracking-wider">
              Electrode Array
            </h2>
          </div>

          <div className="grid grid-cols-8 gap-0.5 aspect-square">
            {heatmapData.map((value, i) => (
              <div
                key={i}
                className="rounded-sm"
                style={{
                  backgroundColor: `rgba(6, 182, 212, ${value * 0.8 + 0.05})`,
                  opacity: 0.3 + value * 0.7,
                }}
                title={`Electrode ${i + 1}: ${(value * 100).toFixed(0)}%`}
              />
            ))}
          </div>
          <div className="flex justify-between mt-2 text-xs text-neural-text-muted">
            <span>Low</span>
            <div className="flex-1 mx-2 h-1.5 rounded-full bg-gradient-to-r from-neural-heatmap-low via-neural-heatmap-mid to-neural-heatmap-high" />
            <span>High</span>
          </div>
        </div>

        {/* Agent Status */}
        <div className="md:col-span-6 lg:col-span-4 bg-neural-surface rounded-xl border border-neural-border p-3 md:p-4">
          <div className="flex items-center gap-2 mb-3">
            <Cpu className="w-4 h-4 text-neural-accent-purple" />
            <h2 className="text-xs font-semibold text-neural-text-secondary uppercase tracking-wider">
              Agent Status
            </h2>
          </div>

          <div className="space-y-1.5">
            {agents.map((agent) => (
              <div
                key={agent.name}
                className="flex items-center justify-between p-2 rounded-lg bg-neural-surface-alt"
              >
                <div className="flex items-center gap-2">
                  <Circle
                    className={`w-2 h-2 fill-current ${
                      agent.status === "online"
                        ? "text-neural-accent-green"
                        : agent.status === "degraded"
                        ? "text-neural-accent-amber"
                        : "text-neural-accent-red"
                    }`}
                  />
                  <span className="text-xs text-neural-text-secondary capitalize">
                    {agent.name.replace("-agent", "")}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-neural-text-muted">
                    {agent.cpuUsage}%
                  </span>
                  <StatusBadge status={agent.status} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Activity Feed */}
        <div className="md:col-span-12 lg:col-span-5 bg-neural-surface rounded-xl border border-neural-border p-3 md:p-4">
          <div className="flex items-center gap-2 mb-3">
            <Clock className="w-4 h-4 text-neural-accent-blue" />
            <h2 className="text-xs font-semibold text-neural-text-secondary uppercase tracking-wider">
              Recent Activity
            </h2>
          </div>

          <div className="space-y-1.5">
            {activityFeed.map((item, i) => (
              <div key={i} className="flex items-start gap-2.5 p-2 rounded-lg hover:bg-neural-surface-alt neural-transition">
                <item.icon className={`w-3.5 h-3.5 mt-0.5 ${item.color} shrink-0`} />
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-neural-text-primary">{item.action}</div>
                  <div className="text-xs text-neural-text-muted truncate">{item.detail}</div>
                </div>
                <span className="text-xs text-neural-text-muted whitespace-nowrap shrink-0">{item.time}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Experiments Overview ── */}
      <div className="bg-neural-surface rounded-xl border border-neural-border p-3 md:p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <FlaskConical className="w-4 h-4 text-neural-accent-purple" />
            <h2 className="text-xs font-semibold text-neural-text-secondary uppercase tracking-wider">
              Active Experiments
            </h2>
          </div>
          <button
            onClick={() => navigate("/experiments")}
            className="text-xs text-neural-accent-purple hover:text-neural-accent-purple/80 neural-transition flex items-center gap-1"
          >
            View all <ArrowRight className="w-3 h-3" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
          {seedExperiments
            .filter((e) => e.status === "active" || e.status === "draft")
            .map((exp) => (
              <button
                key={exp.id}
                onClick={() => navigate(`/experiments/${exp.id}`)}
                className="flex items-start gap-3 p-3 rounded-lg bg-neural-surface-alt hover:bg-neural-border neural-transition text-left border border-transparent hover:border-neural-border-bright"
              >
                <div className="shrink-0 mt-0.5">
                  {exp.status === "active" ? (
                    <CheckCircle2 className="w-4 h-4 text-neural-accent-green" />
                  ) : (
                    <FileText className="w-4 h-4 text-neural-accent-amber" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-neural-text-primary truncate">
                    {exp.name}
                  </div>
                  <div className="text-xs text-neural-text-muted mt-0.5 truncate">{exp.description}</div>
                  <div className="flex items-center gap-3 mt-1.5 text-xs text-neural-text-muted">
                    <span>{exp.owner}</span>
                    <span className="flex items-center gap-1">
                      <Database className="w-3 h-3" />
                      {exp.recordingCount} recordings
                    </span>
                    <span
                      className={`px-1.5 py-0.5 rounded-full text-xs font-medium capitalize ${
                        exp.status === "active"
                          ? "bg-neural-accent-green/20 text-neural-accent-green"
                          : "bg-neural-accent-amber/20 text-neural-accent-amber"
                      }`}
                    >
                      {exp.status}
                    </span>
                  </div>
                </div>
              </button>
            ))}
        </div>
      </div>
    </div>
  );
}
