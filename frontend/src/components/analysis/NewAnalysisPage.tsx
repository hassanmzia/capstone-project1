import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  BarChart3,
  Play,
  GitBranch,
  TrendingUp,
  Layers,
  Sigma,
  HardDrive,
} from "lucide-react";

const analysisTypes = [
  { name: "Spike Sorting", description: "Automated spike detection and unit classification using Kilosort 3", icon: GitBranch, color: "text-neural-accent-cyan" },
  { name: "Burst Detection", description: "Network burst identification and characterization using LogISI", icon: TrendingUp, color: "text-neural-accent-green" },
  { name: "PCA / Clustering", description: "Principal component analysis for spike clustering", icon: Layers, color: "text-neural-accent-purple" },
  { name: "Cross-Correlation", description: "Pairwise cross-correlogram computation between sorted units", icon: Sigma, color: "text-neural-accent-blue" },
  { name: "ISI Analysis", description: "Inter-spike interval distribution analysis", icon: BarChart3, color: "text-neural-accent-amber" },
  { name: "Spectral Analysis", description: "Power spectral density and coherence analysis", icon: TrendingUp, color: "text-neural-accent-rose" },
];

interface AnalysisRecording {
  id: string;
  name: string;
  experiment: string;
  channels: number;
  status: string;
}

const seedRecordings: AnalysisRecording[] = [
  { id: "rec-042", name: "session_042", experiment: "Hippocampal CA1 Place Cell Study", channels: 64, status: "completed" },
  { id: "rec-041", name: "session_041", experiment: "Hippocampal CA1 Place Cell Study", channels: 64, status: "completed" },
  { id: "rec-040", name: "session_040", experiment: "Cortical Spike Timing Analysis", channels: 32, status: "completed" },
  { id: "rec-038", name: "session_038", experiment: "Retinal Ganglion Response Mapping", channels: 128, status: "completed" },
];

/** Load completed recordings from localStorage and merge with seeds */
function loadAvailableRecordings(): AnalysisRecording[] {
  const seedIds = new Set(seedRecordings.map((r) => r.id));
  try {
    const raw = localStorage.getItem("cnea_recordings");
    if (raw) {
      const all = JSON.parse(raw) as { id: string; name: string; experimentName: string; channels: number; status: string }[];
      const userRecs = all
        .filter((r) => r.status === "completed" && !seedIds.has(r.id))
        .map((r) => ({
          id: r.id,
          name: r.name,
          experiment: r.experimentName,
          channels: r.channels,
          status: r.status,
        }));
      return [...userRecs, ...seedRecordings];
    }
  } catch { /* ignore */ }
  return seedRecordings;
}

const parameterTemplates: Record<string, { label: string; defaultValue: string }[]> = {
  "Spike Sorting": [
    { label: "Algorithm", defaultValue: "Kilosort 3" },
    { label: "Detection Threshold (std)", defaultValue: "6.0" },
    { label: "Min Cluster Size", defaultValue: "30" },
    { label: "Max Drift (um)", defaultValue: "10" },
    { label: "Auto-merge Threshold", defaultValue: "0.85" },
  ],
  "Burst Detection": [
    { label: "Algorithm", defaultValue: "LogISI" },
    { label: "Min Burst Spikes", defaultValue: "3" },
    { label: "Max ISI Intra-burst (ms)", defaultValue: "10" },
    { label: "Min Inter-burst Interval (ms)", defaultValue: "100" },
  ],
  "PCA / Clustering": [
    { label: "Components", defaultValue: "3" },
    { label: "Feature Space", defaultValue: "Waveform peaks + PCA" },
    { label: "Normalization", defaultValue: "Z-score" },
  ],
  "Cross-Correlation": [
    { label: "Bin Size (ms)", defaultValue: "0.5" },
    { label: "Window (ms)", defaultValue: "50" },
    { label: "Significance Level", defaultValue: "0.01" },
  ],
  "ISI Analysis": [
    { label: "Bin Size (ms)", defaultValue: "1" },
    { label: "Max ISI (ms)", defaultValue: "500" },
    { label: "Log Scale", defaultValue: "Yes" },
  ],
  "Spectral Analysis": [
    { label: "FFT Window", defaultValue: "Hanning" },
    { label: "Segment Length (s)", defaultValue: "1.0" },
    { label: "Overlap (%)", defaultValue: "50" },
    { label: "Frequency Range (Hz)", defaultValue: "1-500" },
  ],
};

export default function NewAnalysisPage() {
  const navigate = useNavigate();
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [selectedRecording, setSelectedRecording] = useState<string | null>(null);
  const [params, setParams] = useState<Record<string, string>>({});
  const [availableRecordings] = useState<AnalysisRecording[]>(loadAvailableRecordings);

  const currentParams = selectedType ? parameterTemplates[selectedType] || [] : [];

  const handleSelectType = (name: string) => {
    setSelectedType(name);
    const defaults: Record<string, string> = {};
    (parameterTemplates[name] || []).forEach((p) => {
      defaults[p.label] = p.defaultValue;
    });
    setParams(defaults);
  };

  const canStart = selectedType && selectedRecording;

  const handleStart = () => {
    if (canStart) {
      navigate("/analysis");
    }
  };

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
          <BarChart3 className="w-5 h-5 text-neural-accent-green" />
          <h1 className="text-lg font-semibold text-neural-text-primary">New Analysis</h1>
        </div>
        <button
          onClick={handleStart}
          disabled={!canStart}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm border neural-transition ${
            canStart
              ? "bg-neural-accent-green/20 text-neural-accent-green border-neural-accent-green/30 hover:bg-neural-accent-green/30"
              : "bg-neural-surface-alt text-neural-text-muted border-neural-border cursor-not-allowed"
          }`}
        >
          <Play className="w-4 h-4" />
          Start Analysis
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Step 1: Select type */}
          <div className="space-y-4">
            <div className="bg-neural-surface rounded-xl border border-neural-border p-5">
              <h2 className="text-sm font-semibold text-neural-text-primary mb-1">1. Select Analysis Type</h2>
              <p className="text-xs text-neural-text-muted mb-4">Choose the type of analysis to run</p>
              <div className="space-y-2">
                {analysisTypes.map((at) => (
                  <button
                    key={at.name}
                    onClick={() => handleSelectType(at.name)}
                    className={`flex items-start gap-3 w-full p-3 rounded-lg neural-transition text-left border ${
                      selectedType === at.name
                        ? "bg-neural-accent-cyan/10 border-neural-accent-cyan/40"
                        : "bg-neural-surface-alt hover:bg-neural-border border-neural-border hover:border-neural-border-bright"
                    }`}
                  >
                    <at.icon className={`w-5 h-5 mt-0.5 ${selectedType === at.name ? at.color : "text-neural-text-muted"} shrink-0`} />
                    <div>
                      <div className={`text-sm font-medium ${selectedType === at.name ? "text-neural-text-primary" : "text-neural-text-secondary"}`}>
                        {at.name}
                      </div>
                      <div className="text-xs text-neural-text-muted mt-0.5">{at.description}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Step 2: Select recording */}
          <div className="space-y-4">
            <div className="bg-neural-surface rounded-xl border border-neural-border p-5">
              <h2 className="text-sm font-semibold text-neural-text-primary mb-1">2. Select Recording</h2>
              <p className="text-xs text-neural-text-muted mb-4">Choose a recording to analyze</p>
              <div className="space-y-2">
                {availableRecordings.map((rec) => (
                  <button
                    key={rec.id}
                    onClick={() => setSelectedRecording(rec.id)}
                    className={`flex items-start gap-3 w-full p-3 rounded-lg neural-transition text-left border ${
                      selectedRecording === rec.id
                        ? "bg-neural-accent-blue/10 border-neural-accent-blue/40"
                        : "bg-neural-surface-alt hover:bg-neural-border border-neural-border hover:border-neural-border-bright"
                    }`}
                  >
                    <HardDrive className={`w-4 h-4 mt-0.5 shrink-0 ${selectedRecording === rec.id ? "text-neural-accent-blue" : "text-neural-text-muted"}`} />
                    <div>
                      <div className={`text-sm font-mono font-medium ${selectedRecording === rec.id ? "text-neural-text-primary" : "text-neural-text-secondary"}`}>
                        {rec.name}
                      </div>
                      <div className="text-xs text-neural-text-muted mt-0.5">{rec.experiment}</div>
                      <div className="text-xs text-neural-text-muted">{rec.channels} channels</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Step 3: Configure parameters */}
          <div className="space-y-4">
            <div className="bg-neural-surface rounded-xl border border-neural-border p-5">
              <h2 className="text-sm font-semibold text-neural-text-primary mb-1">3. Configure Parameters</h2>
              <p className="text-xs text-neural-text-muted mb-4">
                {selectedType ? `Parameters for ${selectedType}` : "Select an analysis type first"}
              </p>

              {currentParams.length > 0 ? (
                <div className="space-y-3">
                  {currentParams.map((p) => (
                    <div key={p.label}>
                      <label className="text-xs text-neural-text-muted block mb-1">{p.label}</label>
                      <input
                        type="text"
                        value={params[p.label] || p.defaultValue}
                        onChange={(e) => setParams((prev) => ({ ...prev, [p.label]: e.target.value }))}
                        className="w-full bg-neural-surface-alt border border-neural-border rounded-lg px-3 py-2 text-sm font-mono text-neural-text-primary focus:outline-none focus:border-neural-accent-cyan/50"
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <BarChart3 className="w-8 h-8 text-neural-text-muted mx-auto mb-2" />
                  <p className="text-xs text-neural-text-muted">Select an analysis type to configure parameters</p>
                </div>
              )}
            </div>

            {/* Summary */}
            {canStart && (
              <div className="bg-neural-surface rounded-xl border border-neural-accent-green/30 p-5">
                <h2 className="text-sm font-semibold text-neural-accent-green mb-3">Ready to Start</h2>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-neural-text-muted">Type</span>
                    <span className="text-neural-text-primary">{selectedType}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-neural-text-muted">Recording</span>
                    <span className="text-neural-text-primary font-mono">
                      {availableRecordings.find((r) => r.id === selectedRecording)?.name}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-neural-text-muted">Parameters</span>
                    <span className="text-neural-text-primary">{currentParams.length} configured</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
