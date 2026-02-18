import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  BarChart3,
  Play,
  Clock,
  CheckCircle2,
  AlertCircle,
  Settings,
  TrendingUp,
  GitBranch,
  Layers,
  Sigma,
} from "lucide-react";

export interface AnalysisJob {
  id: string;
  type: string;
  recording: string;
  recordingId?: string;
  status: "completed" | "running" | "queued";
  progress: number;
  duration: string;
  result: string;
}

const seedJobs: AnalysisJob[] = [
  { id: "a-001", type: "Spike Sorting", recording: "session_042", recordingId: "rec-042", status: "completed", progress: 100, duration: "4m 32s", result: "3,847 units classified" },
  { id: "a-002", type: "Burst Detection", recording: "session_041", recordingId: "rec-041", status: "completed", progress: 100, duration: "1m 18s", result: "142 bursts detected" },
  { id: "a-003", type: "PCA Analysis", recording: "session_042", recordingId: "rec-042", status: "completed", progress: 100, duration: "3m 45s", result: "3 components, 85.2% variance" },
  { id: "a-004", type: "Cross-Correlation", recording: "session_040", recordingId: "rec-040", status: "completed", progress: 100, duration: "5m 12s", result: "48 significant pairs" },
];

const ANALYSIS_JOBS_KEY = "cnea_analysis_jobs";

function loadAnalysisJobs(): AnalysisJob[] {
  try {
    const raw = localStorage.getItem(ANALYSIS_JOBS_KEY);
    if (raw) {
      const userJobs: AnalysisJob[] = JSON.parse(raw);
      return [...userJobs, ...seedJobs];
    }
  } catch { /* ignore */ }
  return seedJobs;
}

const analysisTypes = [
  { name: "Spike Sorting", description: "Automated spike detection and unit classification", icon: GitBranch, color: "text-neural-accent-cyan" },
  { name: "Burst Detection", description: "Network burst identification and characterization", icon: TrendingUp, color: "text-neural-accent-green" },
  { name: "PCA / Clustering", description: "Principal component analysis for spike clustering", icon: Layers, color: "text-neural-accent-purple" },
  { name: "Cross-Correlation", description: "Pairwise cross-correlogram computation", icon: Sigma, color: "text-neural-accent-blue" },
  { name: "ISI Analysis", description: "Inter-spike interval distribution analysis", icon: BarChart3, color: "text-neural-accent-amber" },
  { name: "Spectral Analysis", description: "Power spectral density and coherence analysis", icon: TrendingUp, color: "text-neural-accent-rose" },
];

export default function AnalysisPage() {
  const navigate = useNavigate();
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [analysisJobs] = useState<AnalysisJob[]>(loadAnalysisJobs);

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Header */}
      <div className="flex items-center justify-between bg-neural-surface rounded-xl border border-neural-border p-3">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-neural-accent-green" />
          <h1 className="text-lg font-semibold text-neural-text-primary">Analysis</h1>
        </div>
        <button
          onClick={() => navigate("/analysis/new")}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm bg-neural-accent-green/20 text-neural-accent-green hover:bg-neural-accent-green/30 border border-neural-accent-green/30 neural-transition"
        >
          <Play className="w-4 h-4" />
          New Analysis
        </button>
      </div>

      <div className="flex gap-4 flex-1 min-h-0">
        {/* Analysis types */}
        <div className="w-80 bg-neural-surface rounded-xl border border-neural-border p-4 overflow-y-auto">
          <h2 className="text-xs font-semibold text-neural-text-secondary uppercase tracking-wider mb-3">
            Analysis Types
          </h2>
          <div className="space-y-2">
            {analysisTypes.map((at) => (
              <button
                key={at.name}
                onClick={() => setSelectedType(at.name)}
                className={`flex items-start gap-3 w-full p-3 rounded-lg neural-transition text-left border ${
                  selectedType === at.name
                    ? "bg-neural-accent-cyan/10 border-neural-accent-cyan/40"
                    : "bg-neural-surface-alt hover:bg-neural-border border-neural-border hover:border-neural-border-bright"
                }`}
              >
                <at.icon className={`w-5 h-5 mt-0.5 ${at.color} shrink-0`} />
                <div>
                  <div className="text-sm font-medium text-neural-text-primary">{at.name}</div>
                  <div className="text-xs text-neural-text-muted mt-0.5">{at.description}</div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Analysis jobs */}
        <div className="flex-1 bg-neural-surface rounded-xl border border-neural-border p-4 overflow-y-auto">
          <h2 className="text-xs font-semibold text-neural-text-secondary uppercase tracking-wider mb-3">
            Analysis Jobs
          </h2>
          <div className="space-y-3">
            {analysisJobs.map((job) => (
              <div
                key={job.id}
                onClick={() => navigate(`/analysis/${job.id}`)}
                className="p-4 rounded-lg bg-neural-surface-alt border border-neural-border hover:border-neural-border-bright neural-transition cursor-pointer"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    {job.status === "completed" ? (
                      <CheckCircle2 className="w-4 h-4 text-neural-accent-green" />
                    ) : job.status === "running" ? (
                      <Settings className="w-4 h-4 text-neural-accent-cyan animate-spin" />
                    ) : (
                      <Clock className="w-4 h-4 text-neural-text-muted" />
                    )}
                    <span className="text-sm font-medium text-neural-text-primary">{job.type}</span>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      job.status === "completed"
                        ? "bg-neural-accent-green/20 text-neural-accent-green"
                        : job.status === "running"
                        ? "bg-neural-accent-cyan/20 text-neural-accent-cyan"
                        : "bg-neural-text-muted/20 text-neural-text-muted"
                    }`}
                  >
                    {job.status}
                  </span>
                </div>

                <div className="flex items-center gap-4 text-xs text-neural-text-muted mb-2">
                  <span>Recording: {job.recording}</span>
                  <span>Duration: {job.duration}</span>
                </div>

                {/* Progress bar */}
                <div className="w-full h-1.5 bg-neural-border rounded-full overflow-hidden">
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

                {job.result && (
                  <div className="flex items-center gap-1.5 mt-2 text-xs text-neural-accent-green">
                    <AlertCircle className="w-3 h-3" />
                    {job.result}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
