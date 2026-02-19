import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  BarChart3,
  Play,
  GitBranch,
  TrendingUp,
  Layers,
  Sigma,
  HardDrive,
  LayoutDashboard,
} from "lucide-react";

const analysisTypes = [
  { name: "Combined Analysis", description: "Run all 6 analysis types in a single unified job", icon: LayoutDashboard, color: "text-neural-accent-green", highlight: true },
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

/** Names of the 6 individual analysis sub-types inside Combined */
const INDIVIDUAL_TYPES = [
  "Spike Sorting",
  "Burst Detection",
  "PCA / Clustering",
  "Cross-Correlation",
  "ISI Analysis",
  "Spectral Analysis",
];

const parameterTemplates: Record<string, { label: string; defaultValue: string; group?: string }[]> = {
  "Combined Analysis": [
    // Spike Sorting params
    { label: "Algorithm", defaultValue: "Kilosort 3", group: "Spike Sorting" },
    { label: "Detection Threshold (std)", defaultValue: "6.0", group: "Spike Sorting" },
    { label: "Min Cluster Size", defaultValue: "30", group: "Spike Sorting" },
    // Burst Detection params
    { label: "Burst Algorithm", defaultValue: "LogISI", group: "Burst Detection" },
    { label: "Min Burst Spikes", defaultValue: "3", group: "Burst Detection" },
    { label: "Max ISI Intra-burst (ms)", defaultValue: "10", group: "Burst Detection" },
    // PCA params
    { label: "PCA Components", defaultValue: "3", group: "PCA / Clustering" },
    { label: "Feature Space", defaultValue: "Waveform peaks + PCA", group: "PCA / Clustering" },
    // Cross-Correlation params
    { label: "CC Bin Size (ms)", defaultValue: "0.5", group: "Cross-Correlation" },
    { label: "CC Window (ms)", defaultValue: "50", group: "Cross-Correlation" },
    // ISI params
    { label: "ISI Bin Size (ms)", defaultValue: "1", group: "ISI Analysis" },
    { label: "Max ISI (ms)", defaultValue: "500", group: "ISI Analysis" },
    // Spectral params
    { label: "FFT Window", defaultValue: "Hanning", group: "Spectral Analysis" },
    { label: "Segment Length (s)", defaultValue: "1.0", group: "Spectral Analysis" },
    { label: "Overlap (%)", defaultValue: "50", group: "Spectral Analysis" },
  ],
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
  const [searchParams] = useSearchParams();
  const preselectedRecording = searchParams.get("recording");
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [selectedRecording, setSelectedRecording] = useState<string | null>(preselectedRecording);
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
    if (!canStart || !selectedType || !selectedRecording) return;
    const rec = availableRecordings.find((r) => r.id === selectedRecording);
    const recName = rec?.name || selectedRecording;

    // Generate plausible analysis results based on type
    const unitCount = (1500 + Math.round(Math.random() * 3000)).toLocaleString();
    const burstCount = 50 + Math.round(Math.random() * 200);
    const pcaVariance = (75 + Math.random() * 20).toFixed(1);
    const ccPairs = 10 + Math.round(Math.random() * 60);
    const isiMean = (5 + Math.random() * 15).toFixed(1);
    const peakFreq = (4 + Math.random() * 8).toFixed(1);

    const resultMap: Record<string, string> = {
      "Combined Analysis": `6 analyses completed — ${unitCount} units, ${burstCount} bursts, ${pcaVariance}% PCA variance`,
      "Spike Sorting": `${unitCount} units classified`,
      "Burst Detection": `${burstCount} bursts detected`,
      "PCA / Clustering": `3 components, ${pcaVariance}% variance`,
      "Cross-Correlation": `${ccPairs} significant pairs`,
      "ISI Analysis": `Mean ISI: ${isiMean} ms`,
      "Spectral Analysis": `Peak: ${peakFreq} Hz (theta band)`,
    };

    const isCombined = selectedType === "Combined Analysis";
    const totalDurMin = isCombined ? 12 + Math.round(Math.random() * 10) : 1 + Math.round(Math.random() * 5);
    const totalDurSec = Math.round(Math.random() * 59);

    const newJob = {
      id: `a-user-${Date.now()}`,
      type: selectedType,
      recording: recName,
      recordingId: selectedRecording,
      status: "completed" as const,
      progress: 100,
      duration: `${totalDurMin}m ${totalDurSec}s`,
      result: resultMap[selectedType] || "Analysis complete",
    };

    // Persist to localStorage
    try {
      const raw = localStorage.getItem("cnea_analysis_jobs");
      const existing = raw ? JSON.parse(raw) : [];
      existing.unshift(newJob);
      localStorage.setItem("cnea_analysis_jobs", JSON.stringify(existing));
    } catch { /* ignore */ }

    navigate("/analysis");
  };

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Top bar */}
      <div className="flex items-center justify-between flex-wrap gap-2 bg-neural-surface rounded-xl border border-neural-border p-3">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => navigate("/analysis")}
            className="p-1.5 rounded-lg hover:bg-neural-surface-alt text-neural-text-muted hover:text-neural-text-primary neural-transition shrink-0"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <BarChart3 className="w-5 h-5 text-neural-accent-green shrink-0" />
          <h1 className="text-lg font-semibold text-neural-text-primary truncate">New Analysis</h1>
        </div>
        <button
          onClick={handleStart}
          disabled={!canStart}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm border neural-transition shrink-0 ${
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
      <div className="flex-1 overflow-y-auto overflow-x-hidden min-w-0">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Step 1: Select type */}
          <div className="space-y-4">
            <div className="bg-neural-surface rounded-xl border border-neural-border p-5">
              <h2 className="text-sm font-semibold text-neural-text-primary mb-1">1. Select Analysis Type</h2>
              <p className="text-xs text-neural-text-muted mb-4">Choose the type of analysis to run</p>
              <div className="space-y-2">
                {analysisTypes.map((at, idx) => (
                  <div key={at.name}>
                    <button
                      onClick={() => handleSelectType(at.name)}
                      className={`flex items-start gap-3 w-full p-3 rounded-lg neural-transition text-left border ${
                        selectedType === at.name
                          ? "bg-neural-accent-cyan/10 border-neural-accent-cyan/40"
                          : at.highlight
                          ? "bg-neural-accent-green/5 hover:bg-neural-accent-green/10 border-neural-accent-green/30 hover:border-neural-accent-green/50"
                          : "bg-neural-surface-alt hover:bg-neural-border border-neural-border hover:border-neural-border-bright"
                      }`}
                    >
                      <at.icon className={`w-5 h-5 mt-0.5 ${selectedType === at.name ? at.color : "text-neural-text-muted"} shrink-0`} />
                      <div>
                        <div className={`text-sm font-medium ${selectedType === at.name ? "text-neural-text-primary" : "text-neural-text-secondary"}`}>
                          {at.name}
                          {at.highlight && (
                            <span className="ml-2 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-neural-accent-green/20 text-neural-accent-green">
                              ALL-IN-ONE
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-neural-text-muted mt-0.5">{at.description}</div>
                      </div>
                    </button>
                    {idx === 0 && at.highlight && (
                      <div className="flex items-center gap-2 my-2 px-1">
                        <div className="flex-1 h-px bg-neural-border" />
                        <span className="text-[9px] text-neural-text-muted uppercase tracking-wider">Individual</span>
                        <div className="flex-1 h-px bg-neural-border" />
                      </div>
                    )}
                  </div>
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
                <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
                  {/* Group parameters by their group field (for Combined Analysis) */}
                  {selectedType === "Combined Analysis" ? (
                    (() => {
                      // Render grouped sections
                      let lastGroup = "";
                      return currentParams.map((p) => {
                        const showHeader = p.group && p.group !== lastGroup;
                        lastGroup = p.group || "";
                        return (
                          <div key={p.label}>
                            {showHeader && (
                              <div className="flex items-center gap-2 mt-3 mb-1.5 first:mt-0">
                                <div className="w-1.5 h-1.5 rounded-full bg-neural-accent-cyan" />
                                <span className="text-[10px] font-semibold text-neural-accent-cyan uppercase tracking-wider">{p.group}</span>
                                <div className="flex-1 h-px bg-neural-border" />
                              </div>
                            )}
                            <div>
                              <label className="text-xs text-neural-text-muted block mb-1">{p.label}</label>
                              <input
                                type="text"
                                value={params[p.label] || p.defaultValue}
                                onChange={(e) => setParams((prev) => ({ ...prev, [p.label]: e.target.value }))}
                                className="w-full bg-neural-surface-alt border border-neural-border rounded-lg px-3 py-2 text-sm font-mono text-neural-text-primary focus:outline-none focus:border-neural-accent-cyan/50"
                              />
                            </div>
                          </div>
                        );
                      });
                    })()
                  ) : (
                    currentParams.map((p) => (
                      <div key={p.label}>
                        <label className="text-xs text-neural-text-muted block mb-1">{p.label}</label>
                        <input
                          type="text"
                          value={params[p.label] || p.defaultValue}
                          onChange={(e) => setParams((prev) => ({ ...prev, [p.label]: e.target.value }))}
                          className="w-full bg-neural-surface-alt border border-neural-border rounded-lg px-3 py-2 text-sm font-mono text-neural-text-primary focus:outline-none focus:border-neural-accent-cyan/50"
                        />
                      </div>
                    ))
                  )}
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
                  {selectedType === "Combined Analysis" && (
                    <div className="flex justify-between">
                      <span className="text-neural-text-muted">Sub-analyses</span>
                      <span className="text-neural-accent-cyan">{INDIVIDUAL_TYPES.length} types</span>
                    </div>
                  )}
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
                {selectedType === "Combined Analysis" && (
                  <div className="mt-3 pt-3 border-t border-neural-border/50 space-y-1">
                    {INDIVIDUAL_TYPES.map((t) => (
                      <div key={t} className="flex items-center gap-1.5 text-[10px] text-neural-text-muted">
                        <div className="w-1 h-1 rounded-full bg-neural-accent-cyan" />
                        {t}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
