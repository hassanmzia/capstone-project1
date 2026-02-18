import { useState, useMemo, type ReactNode } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  FlaskConical,
  ArrowLeft,
  Calendar,
  User,
  Tag,
  HardDrive,
  Clock,
  CheckCircle2,
  FileText,
  Archive,
  Save,
  Trash2,
  Edit3,
  Plus,
  X,
  Circle,
  Eye,
  BarChart3,
  Activity,
  Zap,
} from "lucide-react";
import { useRecordingSession } from "@/contexts/RecordingSessionContext";
import type { AnalysisJob } from "@/components/analysis/AnalysisPage";

interface ExperimentData {
  id: string;
  name: string;
  description: string;
  status: "draft" | "active" | "completed" | "archived";
  owner: string;
  createdAt: string;
  recordingCount: number;
  tags: string[];
  notes: string;
  protocol: string;
}

const mockExperimentsDb: Record<string, ExperimentData> = {
  "exp-001": {
    id: "exp-001",
    name: "Hippocampal CA1 Place Cell Study",
    description: "Recording place cell activity during spatial navigation task in virtual environment",
    status: "active",
    owner: "Dr. Chen",
    createdAt: "2026-02-15",
    recordingCount: 12,
    tags: ["hippocampus", "place-cells", "navigation"],
    notes: "Subject navigates a virtual linear track while we record from CA1 pyramidal layer. Using 64-channel silicon probe. Sessions run 15-30 minutes with 5 min rest intervals.",
    protocol: "Bilateral CA1 recording during virtual navigation. Electrode: 64ch silicon probe (NeuroNexus A1x64). Sample rate: 30kHz. Bandpass: 300Hz-6kHz for spikes, 1-300Hz for LFP.",
  },
  "exp-002": {
    id: "exp-002",
    name: "Cortical Spike Timing Analysis",
    description: "High-density recording of cortical microcircuit dynamics during sensory stimulation",
    status: "active",
    owner: "Dr. Patel",
    createdAt: "2026-02-10",
    recordingCount: 8,
    tags: ["cortex", "spike-timing", "sensory"],
    notes: "Investigating spike timing-dependent plasticity in barrel cortex during whisker stimulation. Using multi-shank probes for simultaneous layer recordings.",
    protocol: "Barrel cortex recording during whisker deflection. Electrode: 32ch multi-shank (Cambridge NeuroTech). Sample rate: 30kHz. Stimulus: piezo-driven single whisker deflection at 2Hz.",
  },
  "exp-003": {
    id: "exp-003",
    name: "Retinal Ganglion Response Mapping",
    description: "Full-field mapping of retinal ganglion cell responses to patterned light stimuli",
    status: "completed",
    owner: "Dr. Kim",
    createdAt: "2026-01-28",
    recordingCount: 24,
    tags: ["retina", "ganglion", "light-response"],
    notes: "Complete receptive field mapping of ON, OFF, and ON-OFF retinal ganglion cells using white noise and moving grating stimuli on 128-channel MEA.",
    protocol: "Ex vivo retinal preparation on 128ch MEA. Stimuli: binary white noise (100um checkers, 60Hz refresh) and drifting gratings (8 directions, 3 spatial frequencies). Temperature: 34C.",
  },
  "exp-004": {
    id: "exp-004",
    name: "Drug Screening - Compound 47B",
    description: "Evaluating neural activity modulation by experimental compound 47B on organoid cultures",
    status: "draft",
    owner: "Dr. Martinez",
    createdAt: "2026-02-17",
    recordingCount: 0,
    tags: ["drug-screening", "organoid", "pharmacology"],
    notes: "Dose-response study of compound 47B on cortical organoid network activity. Concentrations: 0.1, 1, 10, 100 uM. Baseline recording 30 min before application.",
    protocol: "Cortical organoid on 64ch MEA. Baseline: 30 min spontaneous. Drug application via perfusion. Post-drug recording: 60 min per concentration. Washout: 30 min between doses.",
  },
  "exp-005": {
    id: "exp-005",
    name: "Network Burst Detection Validation",
    description: "Benchmarking burst detection algorithms against ground-truth synthetic data",
    status: "archived",
    owner: "Dr. Chen",
    createdAt: "2025-12-15",
    recordingCount: 36,
    tags: ["validation", "burst-detection", "algorithm"],
    notes: "Generated synthetic datasets with known burst times, then compared 5 detection algorithms (ISI-based, surprise-based, CMA, logISI, Poisson surprise). Results published in internal report.",
    protocol: "Synthetic data generated with 3 burst rate regimes (low, medium, high) x 4 noise levels. Each condition repeated 3 times. Real data from hippocampal cultures used for validation.",
  },
};

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
  status: string;
  sampleRate?: string;
}

/** Seed recordings mapped to their experiments */
const seedRecordings: RecordingEntry[] = [
  { id: "rec-042", name: "session_042", experimentName: "Hippocampal CA1 Place Cell Study", date: "2026-02-18 09:15", duration: "15:32", spikeCount: 48291, channels: 64, fileSize: "2.4 GB", format: "HDF5", status: "completed", sampleRate: "30000" },
  { id: "rec-041", name: "session_041", experimentName: "Hippocampal CA1 Place Cell Study", date: "2026-02-17 14:22", duration: "30:10", spikeCount: 95100, channels: 64, fileSize: "4.8 GB", format: "HDF5", status: "completed", sampleRate: "30000" },
  { id: "rec-040", name: "session_040", experimentName: "Cortical Spike Timing Analysis", date: "2026-02-16 11:05", duration: "10:00", spikeCount: 22430, channels: 32, fileSize: "1.1 GB", format: "NWB", status: "completed", sampleRate: "30000" },
  { id: "rec-039", name: "session_039", experimentName: "Cortical Spike Timing Analysis", date: "2026-02-15 16:40", duration: "05:45", spikeCount: 0, channels: 32, fileSize: "540 MB", format: "NWB", status: "processing", sampleRate: "30000" },
  { id: "rec-038", name: "session_038", experimentName: "Retinal Ganglion Response Mapping", date: "2026-02-14 10:30", duration: "20:00", spikeCount: 67800, channels: 128, fileSize: "6.2 GB", format: "HDF5", status: "completed", sampleRate: "20000" },
  { id: "rec-037", name: "session_037_failed", experimentName: "Retinal Ganglion Response Mapping", date: "2026-02-14 09:00", duration: "02:15", spikeCount: 1200, channels: 128, fileSize: "320 MB", format: "RAW", status: "error", sampleRate: "20000" },
];

/** Load all recordings (seed + localStorage) for a given experiment name */
function loadRecordingsForExperiment(experimentName: string): RecordingEntry[] {
  const seedIds = new Set(seedRecordings.map((r) => r.id));
  let allRecordings = [...seedRecordings];

  try {
    const raw = localStorage.getItem("cnea_recordings");
    if (raw) {
      const stored: RecordingEntry[] = JSON.parse(raw);
      const userRecs = stored.filter((r) => !seedIds.has(r.id));
      allRecordings = [...userRecs, ...allRecordings];
    }
  } catch { /* ignore */ }

  return allRecordings.filter((r) => r.experimentName === experimentName);
}

/** Load analysis jobs for a given experiment's recordings */
function loadAnalysisForExperiment(recordings: RecordingEntry[]): AnalysisJob[] {
  const recNames = new Set(recordings.map((r) => r.name));
  const recIds = new Set(recordings.map((r) => r.id));

  const seedJobs: AnalysisJob[] = [
    { id: "a-001", type: "Spike Sorting", recording: "session_042", recordingId: "rec-042", status: "completed", progress: 100, duration: "4m 32s", result: "3,847 units classified" },
    { id: "a-002", type: "Burst Detection", recording: "session_041", recordingId: "rec-041", status: "completed", progress: 100, duration: "1m 18s", result: "142 bursts detected" },
    { id: "a-003", type: "PCA Analysis", recording: "session_042", recordingId: "rec-042", status: "completed", progress: 100, duration: "3m 45s", result: "3 components, 85.2% variance" },
    { id: "a-004", type: "Cross-Correlation", recording: "session_040", recordingId: "rec-040", status: "completed", progress: 100, duration: "5m 12s", result: "48 significant pairs" },
  ];

  let allJobs = seedJobs;
  try {
    const raw = localStorage.getItem("cnea_analysis_jobs");
    if (raw) {
      const userJobs: AnalysisJob[] = JSON.parse(raw);
      allJobs = [...userJobs, ...seedJobs];
    }
  } catch { /* ignore */ }

  return allJobs.filter((j) => recNames.has(j.recording) || (j.recordingId && recIds.has(j.recordingId)));
}

/** Parse file size string to MB */
function parseSizeMB(s: string): number {
  if (s.includes("GB")) return parseFloat(s) * 1024;
  if (s.includes("MB")) return parseFloat(s);
  return 0;
}

function statusBadge(status: string) {
  const classes: Record<string, string> = {
    active: "bg-neural-accent-green/20 text-neural-accent-green",
    completed: "bg-neural-accent-blue/20 text-neural-accent-blue",
    draft: "bg-neural-accent-amber/20 text-neural-accent-amber",
    archived: "bg-neural-text-muted/20 text-neural-text-muted",
  };
  const icons: Record<string, ReactNode> = {
    active: <CheckCircle2 className="w-3.5 h-3.5" />,
    completed: <Archive className="w-3.5 h-3.5" />,
    draft: <FileText className="w-3.5 h-3.5" />,
    archived: <Archive className="w-3.5 h-3.5" />,
  };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium capitalize ${classes[status] || classes.archived}`}>
      {icons[status] || icons.archived}
      {status}
    </span>
  );
}

export default function ExperimentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { startPlayback } = useRecordingSession();
  const isNew = id === "new";

  const existing = id && !isNew ? mockExperimentsDb[id] : null;

  const [editing, setEditing] = useState(isNew);
  const [form, setForm] = useState<ExperimentData>(
    existing || {
      id: "",
      name: "",
      description: "",
      status: "draft",
      owner: "Researcher",
      createdAt: new Date().toISOString().slice(0, 10),
      recordingCount: 0,
      tags: [],
      notes: "",
      protocol: "",
    }
  );
  const [tagInput, setTagInput] = useState("");
  const [saved, setSaved] = useState(false);

  // Load real recordings and analysis for this experiment
  const experimentRecordings = useMemo(() => {
    const name = existing?.name || form.name;
    return name ? loadRecordingsForExperiment(name) : [];
  }, [existing?.name, form.name]);

  const experimentAnalysis = useMemo(() => {
    return experimentRecordings.length > 0 ? loadAnalysisForExperiment(experimentRecordings) : [];
  }, [experimentRecordings]);

  // Compute real statistics
  const stats = useMemo(() => {
    const completed = experimentRecordings.filter((r) => r.status === "completed");
    const totalSpikes = completed.reduce((sum, r) => sum + r.spikeCount, 0);
    const totalSec = completed.reduce((sum, r) => {
      const parts = r.duration.split(":");
      return sum + parseInt(parts[0]) * 60 + parseInt(parts[1]);
    }, 0);
    const totalMins = Math.floor(totalSec / 60);
    const totalRemSec = totalSec % 60;
    const totalSizeMB = experimentRecordings.reduce((sum, r) => sum + parseSizeMB(r.fileSize), 0);
    const avgFiringRate = totalSec > 0 && completed.length > 0
      ? (totalSpikes / totalSec / completed[0].channels).toFixed(1)
      : "0";

    return {
      totalSpikes,
      totalDuration: `${String(totalMins).padStart(2, "0")}:${String(totalRemSec).padStart(2, "0")}`,
      avgFiringRate: `${avgFiringRate} Hz`,
      dataSize: totalSizeMB >= 1024 ? `${(totalSizeMB / 1024).toFixed(1)} GB` : `${Math.round(totalSizeMB)} MB`,
      completedCount: completed.length,
      totalCount: experimentRecordings.length,
    };
  }, [experimentRecordings]);

  if (!existing && !isNew) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <FlaskConical className="w-12 h-12 text-neural-text-muted" />
        <p className="text-neural-text-muted">Experiment not found</p>
        <button
          onClick={() => navigate("/experiments")}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm bg-neural-accent-cyan/20 text-neural-accent-cyan hover:bg-neural-accent-cyan/30 border border-neural-accent-cyan/30 neural-transition"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Experiments
        </button>
      </div>
    );
  }

  const data = editing ? form : (existing || form);

  const handleSave = () => {
    setEditing(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    if (isNew) {
      navigate("/experiments");
    }
  };

  const handleAddTag = () => {
    const trimmed = tagInput.trim();
    if (trimmed && !form.tags.includes(trimmed)) {
      setForm((prev) => ({ ...prev, tags: [...prev.tags, trimmed] }));
      setTagInput("");
    }
  };

  const handleRemoveTag = (tag: string) => {
    setForm((prev) => ({ ...prev, tags: prev.tags.filter((t) => t !== tag) }));
  };

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Top bar */}
      <div className="flex items-center justify-between bg-neural-surface rounded-xl border border-neural-border p-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate("/experiments")}
            className="p-1.5 rounded-lg hover:bg-neural-surface-alt text-neural-text-muted hover:text-neural-text-primary neural-transition"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <FlaskConical className="w-5 h-5 text-neural-accent-purple" />
          <h1 className="text-lg font-semibold text-neural-text-primary">
            {isNew ? "New Experiment" : data.name}
          </h1>
          {!isNew && statusBadge(data.status)}
        </div>

        <div className="flex items-center gap-2">
          {saved && (
            <span className="text-xs text-neural-accent-green flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" /> Saved
            </span>
          )}
          {!editing && !isNew && (
            <button
              onClick={() => {
                setForm(existing!);
                setEditing(true);
              }}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm bg-neural-surface-alt text-neural-text-secondary hover:text-neural-text-primary border border-neural-border neural-transition"
            >
              <Edit3 className="w-4 h-4" />
              Edit
            </button>
          )}
          {editing && (
            <>
              {!isNew && (
                <button
                  onClick={() => setEditing(false)}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm bg-neural-surface-alt text-neural-text-secondary hover:text-neural-text-primary border border-neural-border neural-transition"
                >
                  Cancel
                </button>
              )}
              <button
                onClick={handleSave}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm bg-neural-accent-cyan/20 text-neural-accent-cyan hover:bg-neural-accent-cyan/30 border border-neural-accent-cyan/30 neural-transition"
              >
                <Save className="w-4 h-4" />
                {isNew ? "Create Experiment" : "Save Changes"}
              </button>
            </>
          )}
          {!isNew && (
            <button
              onClick={() => {
                navigate("/experiments");
              }}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-neural-text-muted hover:text-neural-accent-red hover:bg-neural-accent-red/10 border border-neural-border neural-transition"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Main info */}
          <div className="lg:col-span-2 space-y-4">
            {/* Details card */}
            <div className="bg-neural-surface rounded-xl border border-neural-border p-5">
              <h2 className="text-sm font-semibold text-neural-text-primary mb-4">Experiment Details</h2>

              {editing ? (
                <div className="space-y-4">
                  <div>
                    <label className="text-xs text-neural-text-muted block mb-1.5">Name</label>
                    <input
                      type="text"
                      value={form.name}
                      onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                      placeholder="Enter experiment name..."
                      className="w-full bg-neural-surface-alt border border-neural-border rounded-lg px-3 py-2 text-sm text-neural-text-primary placeholder:text-neural-text-muted focus:outline-none focus:border-neural-accent-cyan/50"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-neural-text-muted block mb-1.5">Description</label>
                    <textarea
                      rows={2}
                      value={form.description}
                      onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                      placeholder="Brief description of this experiment..."
                      className="w-full bg-neural-surface-alt border border-neural-border rounded-lg px-3 py-2 text-sm text-neural-text-primary placeholder:text-neural-text-muted focus:outline-none focus:border-neural-accent-cyan/50 resize-none"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs text-neural-text-muted block mb-1.5">Owner</label>
                      <input
                        type="text"
                        value={form.owner}
                        onChange={(e) => setForm((p) => ({ ...p, owner: e.target.value }))}
                        className="w-full bg-neural-surface-alt border border-neural-border rounded-lg px-3 py-2 text-sm text-neural-text-primary focus:outline-none focus:border-neural-accent-cyan/50"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-neural-text-muted block mb-1.5">Status</label>
                      <select
                        value={form.status}
                        onChange={(e) => setForm((p) => ({ ...p, status: e.target.value as ExperimentData["status"] }))}
                        className="w-full bg-neural-surface-alt border border-neural-border rounded-lg px-3 py-2 text-sm text-neural-text-primary focus:outline-none focus:border-neural-accent-cyan/50"
                      >
                        <option value="draft">Draft</option>
                        <option value="active">Active</option>
                        <option value="completed">Completed</option>
                        <option value="archived">Archived</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-neural-text-muted block mb-1.5">Tags</label>
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {form.tags.map((tag) => (
                        <span
                          key={tag}
                          className="flex items-center gap-1 px-2 py-0.5 rounded bg-neural-surface-alt text-xs text-neural-text-secondary"
                        >
                          <Tag className="w-2.5 h-2.5" />
                          {tag}
                          <button onClick={() => handleRemoveTag(tag)} className="ml-0.5 hover:text-neural-accent-red">
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={tagInput}
                        onChange={(e) => setTagInput(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAddTag())}
                        placeholder="Add a tag..."
                        className="flex-1 bg-neural-surface-alt border border-neural-border rounded-lg px-3 py-1.5 text-sm text-neural-text-primary placeholder:text-neural-text-muted focus:outline-none focus:border-neural-accent-cyan/50"
                      />
                      <button
                        onClick={handleAddTag}
                        className="px-3 py-1.5 rounded-lg text-sm bg-neural-surface-alt text-neural-text-secondary hover:text-neural-text-primary border border-neural-border neural-transition"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <span className="text-xs text-neural-text-muted">Description</span>
                    <p className="text-sm text-neural-text-secondary mt-1">{data.description}</p>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <span className="text-xs text-neural-text-muted flex items-center gap-1"><User className="w-3 h-3" /> Owner</span>
                      <p className="text-sm text-neural-text-primary mt-1">{data.owner}</p>
                    </div>
                    <div>
                      <span className="text-xs text-neural-text-muted flex items-center gap-1"><Calendar className="w-3 h-3" /> Created</span>
                      <p className="text-sm text-neural-text-primary mt-1">{data.createdAt}</p>
                    </div>
                    <div>
                      <span className="text-xs text-neural-text-muted flex items-center gap-1"><HardDrive className="w-3 h-3" /> Recordings</span>
                      <p className="text-sm text-neural-text-primary mt-1">{data.recordingCount}</p>
                    </div>
                  </div>
                  {data.tags.length > 0 && (
                    <div>
                      <span className="text-xs text-neural-text-muted">Tags</span>
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        {data.tags.map((tag) => (
                          <span
                            key={tag}
                            className="flex items-center gap-1 px-2 py-0.5 rounded bg-neural-surface-alt text-xs text-neural-text-secondary"
                          >
                            <Tag className="w-2.5 h-2.5" />
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Protocol card */}
            <div className="bg-neural-surface rounded-xl border border-neural-border p-5">
              <h2 className="text-sm font-semibold text-neural-text-primary mb-3">Protocol</h2>
              {editing ? (
                <textarea
                  rows={4}
                  value={form.protocol}
                  onChange={(e) => setForm((p) => ({ ...p, protocol: e.target.value }))}
                  placeholder="Describe the experimental protocol, electrode configuration, sample rates..."
                  className="w-full bg-neural-surface-alt border border-neural-border rounded-lg px-3 py-2 text-sm text-neural-text-primary placeholder:text-neural-text-muted focus:outline-none focus:border-neural-accent-cyan/50 resize-none"
                />
              ) : (
                <p className="text-sm text-neural-text-secondary leading-relaxed">
                  {data.protocol || "No protocol defined yet."}
                </p>
              )}
            </div>

            {/* Notes card */}
            <div className="bg-neural-surface rounded-xl border border-neural-border p-5">
              <h2 className="text-sm font-semibold text-neural-text-primary mb-3">Notes</h2>
              {editing ? (
                <textarea
                  rows={4}
                  value={form.notes}
                  onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                  placeholder="Add experimental notes, observations, conditions..."
                  className="w-full bg-neural-surface-alt border border-neural-border rounded-lg px-3 py-2 text-sm text-neural-text-primary placeholder:text-neural-text-muted focus:outline-none focus:border-neural-accent-cyan/50 resize-none"
                />
              ) : (
                <p className="text-sm text-neural-text-secondary leading-relaxed">
                  {data.notes || "No notes yet."}
                </p>
              )}
            </div>
          </div>

          {/* Sidebar: Recordings + Actions + Stats + Analysis */}
          <div className="space-y-4">
            {/* Quick actions */}
            {!isNew && (
              <div className="bg-neural-surface rounded-xl border border-neural-border p-4">
                <h2 className="text-xs font-semibold text-neural-text-secondary uppercase tracking-wider mb-3">Actions</h2>
                <div className="space-y-2">
                  <button
                    onClick={() => navigate("/recordings")}
                    className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm bg-neural-accent-green/10 text-neural-accent-green border border-neural-accent-green/20 hover:bg-neural-accent-green/20 neural-transition"
                  >
                    <Circle className="w-3.5 h-3.5" />
                    Start Recording
                  </button>
                  {stats.completedCount > 0 && (
                    <>
                      <button
                        onClick={() => {
                          const completed = experimentRecordings.find((r) => r.status === "completed");
                          if (completed) navigate(`/analysis/new?recording=${completed.id}`);
                        }}
                        className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm bg-neural-accent-purple/10 text-neural-accent-purple border border-neural-accent-purple/20 hover:bg-neural-accent-purple/20 neural-transition"
                      >
                        <BarChart3 className="w-3.5 h-3.5" />
                        Run Analysis
                      </button>
                      <button
                        onClick={() => {
                          const completed = experimentRecordings.find((r) => r.status === "completed");
                          if (completed) {
                            const sr = completed.sampleRate ? parseInt(completed.sampleRate) : 30000;
                            startPlayback({
                              recordingId: completed.id,
                              name: completed.name,
                              experimentName: completed.experimentName,
                              channels: completed.channels,
                              sampleRate: sr,
                              duration: completed.duration,
                              spikeCount: completed.spikeCount,
                            });
                            navigate("/visualization");
                          }
                        }}
                        className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm bg-neural-accent-cyan/10 text-neural-accent-cyan border border-neural-accent-cyan/20 hover:bg-neural-accent-cyan/20 neural-transition"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        Open in Visualizer
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Recordings */}
            <div className="bg-neural-surface rounded-xl border border-neural-border p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-neural-text-primary">Recordings</h2>
                <span className="text-xs text-neural-text-muted">{experimentRecordings.length} total</span>
              </div>

              {experimentRecordings.length === 0 ? (
                <div className="text-center py-8">
                  <HardDrive className="w-8 h-8 text-neural-text-muted mx-auto mb-2" />
                  <p className="text-xs text-neural-text-muted">No recordings yet</p>
                  <p className="text-xs text-neural-text-muted mt-1">Start a recording session to see data here</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {experimentRecordings.slice(0, 5).map((rec) => (
                    <div
                      key={rec.id}
                      onClick={() => navigate(`/recordings/${rec.id}`)}
                      className="p-3 rounded-lg bg-neural-surface-alt border border-neural-border hover:border-neural-border-bright neural-transition cursor-pointer"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-mono text-neural-text-primary">{rec.name}</span>
                        <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${
                          rec.status === "completed" ? "bg-neural-accent-green/20 text-neural-accent-green"
                          : rec.status === "processing" ? "bg-neural-accent-amber/20 text-neural-accent-amber"
                          : "bg-neural-accent-red/20 text-neural-accent-red"
                        }`}>
                          {rec.status}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-[11px] text-neural-text-muted">
                        <span className="flex items-center gap-1"><Calendar className="w-2.5 h-2.5" />{rec.date}</span>
                        <span className="flex items-center gap-1"><Clock className="w-2.5 h-2.5" />{rec.duration}</span>
                      </div>
                      <div className="flex items-center justify-between mt-1">
                        <span className="text-[11px] text-neural-accent-cyan font-mono">
                          {rec.spikeCount.toLocaleString()} spikes
                        </span>
                        <span className="text-[10px] text-neural-text-muted">{rec.channels}ch &middot; {rec.fileSize}</span>
                      </div>
                    </div>
                  ))}
                  {experimentRecordings.length > 5 && (
                    <button
                      onClick={() => navigate("/recordings")}
                      className="w-full text-center text-xs text-neural-accent-cyan hover:text-neural-accent-cyan/80 py-2 neural-transition"
                    >
                      View all {experimentRecordings.length} recordings →
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Statistics (computed from real data) */}
            {experimentRecordings.length > 0 && (
              <div className="bg-neural-surface rounded-xl border border-neural-border p-5">
                <h2 className="text-sm font-semibold text-neural-text-primary mb-4 flex items-center gap-2">
                  <Activity className="w-4 h-4 text-neural-text-muted" />
                  Statistics
                </h2>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-neural-text-muted flex items-center gap-1"><Zap className="w-3 h-3" /> Total Spikes</span>
                    <span className="text-sm font-mono text-neural-accent-cyan">{stats.totalSpikes.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-neural-text-muted flex items-center gap-1"><Clock className="w-3 h-3" /> Total Duration</span>
                    <span className="text-sm font-mono text-neural-text-primary">{stats.totalDuration}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-neural-text-muted">Avg Firing Rate</span>
                    <span className="text-sm font-mono text-neural-text-primary">{stats.avgFiringRate}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-neural-text-muted flex items-center gap-1"><HardDrive className="w-3 h-3" /> Data Size</span>
                    <span className="text-sm font-mono text-neural-text-primary">{stats.dataSize}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-neural-text-muted">Recordings</span>
                    <span className="text-sm font-mono text-neural-text-primary">{stats.completedCount} completed / {stats.totalCount} total</span>
                  </div>
                </div>
              </div>
            )}

            {/* Analysis Jobs */}
            {experimentAnalysis.length > 0 && (
              <div className="bg-neural-surface rounded-xl border border-neural-border p-5">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-semibold text-neural-text-primary flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-neural-text-muted" />
                    Analysis Results
                  </h2>
                  <span className="text-xs text-neural-text-muted">{experimentAnalysis.length} jobs</span>
                </div>
                <div className="space-y-2">
                  {experimentAnalysis.map((job) => (
                    <div
                      key={job.id}
                      onClick={() => job.id.startsWith("a-0") ? navigate(`/analysis/${job.id}`) : undefined}
                      className={`p-3 rounded-lg bg-neural-surface-alt border border-neural-border ${job.id.startsWith("a-0") ? "hover:border-neural-border-bright cursor-pointer" : ""} neural-transition`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium text-neural-text-primary">{job.type}</span>
                        <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${
                          job.status === "completed" ? "bg-neural-accent-green/20 text-neural-accent-green"
                          : "bg-neural-accent-cyan/20 text-neural-accent-cyan"
                        }`}>
                          {job.status}
                        </span>
                      </div>
                      <div className="text-[11px] text-neural-text-muted">
                        {job.recording} &middot; {job.duration}
                      </div>
                      {job.result && (
                        <div className="text-[11px] text-neural-accent-green mt-1">{job.result}</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
