import { useState, useCallback, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  HardDrive,
  Search,
  Download,
  Trash2,
  Play,
  Calendar,
  Clock,
  FileText,
  Filter,
  SortDesc,
  SortAsc,
  Circle,
  X,
  Cpu,
  Activity,
  BarChart3,
  FlaskConical,
} from "lucide-react";
import LiveRecordingDashboard, { type RecordingStats, type EventMarker } from "./LiveRecordingDashboard";
import { useRecordingSession } from "@/contexts/RecordingSessionContext";

export interface MockRecording {
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
  markers?: EventMarker[];
}

const seedRecordings: MockRecording[] = [
  { id: "rec-042", name: "session_042", experimentName: "Hippocampal CA1 Place Cell Study", date: "2026-02-18 09:15", duration: "15:32", spikeCount: 48291, channels: 64, fileSize: "2.4 GB", format: "HDF5", status: "completed", sampleRate: "30000" },
  { id: "rec-041", name: "session_041", experimentName: "Hippocampal CA1 Place Cell Study", date: "2026-02-17 14:22", duration: "30:10", spikeCount: 95100, channels: 64, fileSize: "4.8 GB", format: "HDF5", status: "completed", sampleRate: "30000" },
  { id: "rec-040", name: "session_040", experimentName: "Cortical Spike Timing Analysis", date: "2026-02-16 11:05", duration: "10:00", spikeCount: 22430, channels: 32, fileSize: "1.1 GB", format: "NWB", status: "completed", sampleRate: "30000" },
  { id: "rec-039", name: "session_039", experimentName: "Cortical Spike Timing Analysis", date: "2026-02-15 16:40", duration: "05:45", spikeCount: 0, channels: 32, fileSize: "540 MB", format: "NWB", status: "processing", sampleRate: "30000" },
  { id: "rec-038", name: "session_038", experimentName: "Retinal Ganglion Response Mapping", date: "2026-02-14 10:30", duration: "20:00", spikeCount: 67800, channels: 128, fileSize: "6.2 GB", format: "HDF5", status: "completed", sampleRate: "20000" },
  { id: "rec-037", name: "session_037_failed", experimentName: "Retinal Ganglion Response Mapping", date: "2026-02-14 09:00", duration: "02:15", spikeCount: 1200, channels: 128, fileSize: "320 MB", format: "RAW", status: "error", sampleRate: "20000" },
];

const RECORDINGS_KEY = "cnea_recordings";
const ACTIVE_SESSION_KEY = "cnea_active_recording";

function loadRecordings(): MockRecording[] {
  try {
    const raw = localStorage.getItem(RECORDINGS_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  localStorage.setItem(RECORDINGS_KEY, JSON.stringify(seedRecordings));
  return seedRecordings;
}

function saveRecordings(recs: MockRecording[]) {
  localStorage.setItem(RECORDINGS_KEY, JSON.stringify(recs));
}

/** Active recording session persisted across navigation */
interface ActiveSession {
  phase: "setup" | "recording" | "paused";
  name: string;
  experiment: string;
  channels: string;
  format: string;
  sampleRate: string;
  startedAt: number;
  pausedElapsed: number; // accumulated seconds before current pause
}

function loadActiveSession(): ActiveSession | null {
  try {
    const raw = localStorage.getItem(ACTIVE_SESSION_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return null;
}

function saveActiveSession(session: ActiveSession | null) {
  if (session) {
    localStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify(session));
  } else {
    localStorage.removeItem(ACTIVE_SESSION_KEY);
  }
}

const availableExperiments = [
  { id: "exp-001", name: "Hippocampal CA1 Place Cell Study" },
  { id: "exp-002", name: "Cortical Spike Timing Analysis" },
  { id: "exp-003", name: "Retinal Ganglion Response Mapping" },
  { id: "exp-004", name: "Drug Screening - Compound 47B" },
];

type RecordingPhase = "idle" | "setup" | "recording" | "paused";

export default function RecordingBrowserPage() {
  const navigate = useNavigate();
  const { startSession, updateSession, endSession, startPlayback } = useRecordingSession();
  const [search, setSearch] = useState("");
  const [recordings, setRecordings] = useState<MockRecording[]>(loadRecordings);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [sortAsc, setSortAsc] = useState(false);

  // Restore active session from localStorage (survives navigation)
  const restored = useRef(loadActiveSession());
  const [phase, setPhase] = useState<RecordingPhase>(restored.current?.phase ?? "idle");

  // Setup form state — restored from active session if one exists
  const [setupName, setSetupName] = useState(restored.current?.name ?? "");
  const [setupExperiment, setSetupExperiment] = useState(restored.current?.experiment ?? availableExperiments[0].id);
  const [setupChannels, setSetupChannels] = useState(restored.current?.channels ?? "64");
  const [setupFormat, setSetupFormat] = useState(restored.current?.format ?? "HDF5");
  const [setupSampleRate, setSetupSampleRate] = useState(restored.current?.sampleRate ?? "30000");

  // Recording timer — uses startedAt timestamp so elapsed time is always correct
  const startTimeRef = useRef<number>(restored.current?.startedAt ?? 0);
  const pausedElapsedRef = useRef<number>(restored.current?.pausedElapsed ?? 0);
  const [elapsedSec, setElapsedSec] = useState(() => {
    const s = restored.current;
    if (!s) return 0;
    if (s.phase === "paused") return s.pausedElapsed;
    if (s.phase === "recording" && s.startedAt > 0) {
      return s.pausedElapsed + Math.floor((Date.now() - s.startedAt) / 1000);
    }
    return 0;
  });
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);

  // Track mounted state to prevent stale updates
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Restore shared context if there's a persisted active session on mount
  useEffect(() => {
    const s = restored.current;
    if (s && (s.phase === "recording" || s.phase === "paused")) {
      const exp = availableExperiments.find((e) => e.id === s.experiment);
      startSession({
        name: s.name,
        experimentName: exp?.name || "Unknown Experiment",
        channels: parseInt(s.channels) || 64,
        sampleRate: parseInt(s.sampleRate) || 30000,
        format: s.format,
        startedAt: s.startedAt,
        isPaused: s.phase === "paused",
      });
    }
    // Only run on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist recordings whenever they change (debounced)
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      saveRecordings(recordings);
    }, 100);
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [recordings]);

  // Process "processing" → "completed" once on mount
  const hasProcessedRef = useRef(false);
  useEffect(() => {
    if (hasProcessedRef.current) return;
    const hasNewProcessing = recordings.some(
      (r) => r.status === "processing" && !r.id.startsWith("rec-0"),
    );
    if (!hasNewProcessing) return;
    hasProcessedRef.current = true;
    const timeout = setTimeout(() => {
      if (!mountedRef.current) return;
      setRecordings((prev) =>
        prev.map((r) => {
          if (r.status !== "processing" || r.id.startsWith("rec-0")) return r;
          const durationParts = r.duration.split(":");
          const totalSec = parseInt(durationParts[0]) * 60 + parseInt(durationParts[1]);
          const estimatedSpikes = Math.round(totalSec * r.channels * (30 + Math.random() * 20));
          return { ...r, status: "completed" as const, spikeCount: estimatedSpikes };
        }),
      );
    }, 5000);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Timer lifecycle — starts/stops based on phase
  useEffect(() => {
    if (phase === "recording" && startTimeRef.current > 0 && !timerRef.current) {
      timerRef.current = setInterval(() => {
        if (!mountedRef.current) return;
        const running = Math.floor((Date.now() - startTimeRef.current) / 1000);
        setElapsedSec(pausedElapsedRef.current + running);
      }, 1000);
    }

    if (phase !== "recording" && timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [phase]);

  const nextSessionNum = 43 + recordings.filter((r) => !seedRecordings.some((s) => s.id === r.id)).length;
  const defaultName = `session_${String(nextSessionNum).padStart(3, "0")}`;

  /* ── Phase transitions ── */

  const handleStartSetup = () => {
    const name = defaultName;
    setSetupName(name);
    setSetupExperiment(availableExperiments[0].id);
    setSetupChannels("64");
    setSetupFormat("HDF5");
    setSetupSampleRate("30000");
    setPhase("setup");
    saveActiveSession({
      phase: "setup",
      name,
      experiment: availableExperiments[0].id,
      channels: "64",
      format: "HDF5",
      sampleRate: "30000",
      startedAt: 0,
      pausedElapsed: 0,
    });
  };

  const handleBeginRecording = () => {
    const now = Date.now();
    const exp = availableExperiments.find((e) => e.id === setupExperiment);
    setElapsedSec(0);
    startTimeRef.current = now;
    pausedElapsedRef.current = 0;
    setPhase("recording");
    saveActiveSession({
      phase: "recording",
      name: setupName,
      experiment: setupExperiment,
      channels: setupChannels,
      format: setupFormat,
      sampleRate: setupSampleRate,
      startedAt: now,
      pausedElapsed: 0,
    });
    // Publish to shared context so VisualizationPage can consume live data
    startSession({
      name: setupName || defaultName,
      experimentName: exp?.name || "Unknown Experiment",
      channels: parseInt(setupChannels) || 64,
      sampleRate: parseInt(setupSampleRate) || 30000,
      format: setupFormat,
      startedAt: now,
      isPaused: false,
    });
  };

  const handlePause = useCallback(() => {
    // Accumulate elapsed time and stop the wall-clock timer
    const running = Math.floor((Date.now() - startTimeRef.current) / 1000);
    const total = pausedElapsedRef.current + running;
    pausedElapsedRef.current = total;
    setElapsedSec(total);
    setPhase("paused");
    saveActiveSession({
      phase: "paused",
      name: setupName,
      experiment: setupExperiment,
      channels: setupChannels,
      format: setupFormat,
      sampleRate: setupSampleRate,
      startedAt: 0,
      pausedElapsed: total,
    });
    updateSession({ isPaused: true });
  }, [setupName, setupExperiment, setupChannels, setupFormat, setupSampleRate, updateSession]);

  const handleResume = useCallback(() => {
    const now = Date.now();
    startTimeRef.current = now;
    setPhase("recording");
    saveActiveSession({
      phase: "recording",
      name: setupName,
      experiment: setupExperiment,
      channels: setupChannels,
      format: setupFormat,
      sampleRate: setupSampleRate,
      startedAt: now,
      pausedElapsed: pausedElapsedRef.current,
    });
    updateSession({ isPaused: false });
  }, [setupName, setupExperiment, setupChannels, setupFormat, setupSampleRate, updateSession]);

  const handleStopRecording = useCallback((stats: RecordingStats, markers: EventMarker[]) => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    const exp = availableExperiments.find((e) => e.id === setupExperiment);
    const total = elapsedSec;
    const mins = Math.floor(total / 60);
    const secs = total % 60;
    const duration = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
    const channels = parseInt(setupChannels) || 64;

    // Use real data size from stats
    const sizeMB = Math.round(stats.dataMB);

    const id = `rec-new-${Date.now()}`;
    hasProcessedRef.current = false;
    setRecordings((prev) => [
      {
        id,
        name: setupName || defaultName,
        experimentName: exp?.name || "Unknown Experiment",
        date: new Date().toISOString().slice(0, 16).replace("T", " "),
        duration,
        spikeCount: stats.spikeCount,
        channels,
        fileSize: sizeMB >= 1024 ? `${(sizeMB / 1024).toFixed(1)} GB` : `${sizeMB} MB`,
        format: setupFormat,
        status: "processing" as const,
        sampleRate: setupSampleRate,
        markers: markers.length > 0 ? markers : undefined,
      },
      ...prev,
    ]);
    setPhase("idle");
    pausedElapsedRef.current = 0;
    saveActiveSession(null);
    endSession();
  }, [setupExperiment, setupChannels, setupFormat, setupSampleRate, setupName, defaultName, elapsedSec, endSession]);

  const handleCancelSetup = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setPhase("idle");
    pausedElapsedRef.current = 0;
    saveActiveSession(null);
    endSession();
  };

  const handleAnalyzeInVisualizer = useCallback((rec: MockRecording) => {
    const sr = rec.sampleRate ? parseInt(rec.sampleRate) : 30000;
    startPlayback({
      recordingId: rec.id,
      name: rec.name,
      experimentName: rec.experimentName,
      channels: rec.channels,
      sampleRate: sr,
      duration: rec.duration,
      spikeCount: rec.spikeCount,
    });
    navigate("/visualization");
  }, [startPlayback, navigate]);

  const handleDelete = useCallback((id: string) => {
    setRecordings((prev) => prev.filter((r) => r.id !== id));
  }, []);

  const handleSort = useCallback(() => {
    setSortAsc((prev) => !prev);
    setRecordings((prev) => [...prev].sort((a, b) =>
      sortAsc ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date)
    ));
  }, [sortAsc]);

  const filtered = recordings.filter(
    (r) =>
      (search === "" ||
        r.name.toLowerCase().includes(search.toLowerCase()) ||
        r.experimentName.toLowerCase().includes(search.toLowerCase())) &&
      (statusFilter === "all" || r.status === statusFilter)
  );

  const isRecording = phase === "recording" || phase === "paused";

  /* ═══════ RECORDING DASHBOARD (full-screen takeover) ═══════ */
  if (isRecording) {
    const exp = availableExperiments.find((e) => e.id === setupExperiment);
    return (
      <LiveRecordingDashboard
        sessionName={setupName || defaultName}
        experimentName={exp?.name || "Unknown Experiment"}
        channels={parseInt(setupChannels) || 64}
        sampleRate={parseInt(setupSampleRate) || 30000}
        format={setupFormat}
        elapsedSec={elapsedSec}
        paused={phase === "paused"}
        onPause={handlePause}
        onResume={handleResume}
        onStop={handleStopRecording}
      />
    );
  }

  /* ═══════ RECORDING BROWSER (idle / setup) ═══════ */
  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between bg-neural-surface rounded-xl border border-neural-border p-3">
        <div className="flex items-center gap-2">
          <HardDrive className="w-5 h-5 text-neural-accent-blue" />
          <h1 className="text-lg font-semibold text-neural-text-primary">Recordings</h1>
          <span className="text-sm text-neural-text-muted ml-2">({filtered.length})</span>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neural-text-muted" />
            <input
              type="text"
              placeholder="Search recordings..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 pr-4 py-1.5 bg-neural-surface-alt border border-neural-border rounded-lg text-sm text-neural-text-primary placeholder:text-neural-text-muted focus:outline-none focus:border-neural-accent-cyan/50 w-64"
            />
          </div>
          <div className="relative">
            <button
              onClick={() => setShowFilterMenu(!showFilterMenu)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm border neural-transition ${
                statusFilter !== "all"
                  ? "bg-neural-accent-cyan/10 text-neural-accent-cyan border-neural-accent-cyan/30"
                  : "bg-neural-surface-alt text-neural-text-secondary hover:text-neural-text-primary border-neural-border"
              }`}
            >
              <Filter className="w-4 h-4" />
              {statusFilter === "all" ? "Filter" : statusFilter}
            </button>
            {showFilterMenu && (
              <div className="absolute top-full right-0 mt-1 w-40 bg-neural-surface border border-neural-border rounded-lg shadow-xl z-50 py-1">
                {["all", "completed", "processing", "error"].map((s) => (
                  <button
                    key={s}
                    onClick={() => { setStatusFilter(s); setShowFilterMenu(false); }}
                    className={`w-full text-left px-3 py-2 text-sm capitalize neural-transition ${
                      statusFilter === s ? "text-neural-accent-cyan bg-neural-accent-cyan/10" : "text-neural-text-secondary hover:bg-neural-surface-alt"
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            onClick={handleSort}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm bg-neural-surface-alt text-neural-text-secondary hover:text-neural-text-primary border border-neural-border neural-transition"
          >
            {sortAsc ? <SortAsc className="w-4 h-4" /> : <SortDesc className="w-4 h-4" />}
            Sort
          </button>
          <button
            onClick={handleStartSetup}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm border neural-transition bg-neural-accent-green/20 text-neural-accent-green border-neural-accent-green/30 hover:bg-neural-accent-green/30"
          >
            <Circle className="w-3 h-3" />
            Start Recording
          </button>
        </div>
      </div>

      {/* Recording Setup Panel */}
      {phase === "setup" && (
        <div className="bg-neural-surface rounded-xl border border-neural-accent-green/30 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-neural-accent-green flex items-center gap-2">
              <Activity className="w-4 h-4" />
              New Recording Setup
            </h2>
            <button
              onClick={handleCancelSetup}
              className="p-1 rounded-lg hover:bg-neural-surface-alt text-neural-text-muted hover:text-neural-text-primary neural-transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
            <div>
              <label className="text-xs text-neural-text-muted block mb-1">Session Name</label>
              <input
                type="text"
                value={setupName}
                onChange={(e) => setSetupName(e.target.value)}
                className="w-full bg-neural-surface-alt border border-neural-border rounded-lg px-3 py-2 text-sm font-mono text-neural-text-primary focus:outline-none focus:border-neural-accent-cyan/50"
              />
            </div>

            <div>
              <label className="text-xs text-neural-text-muted block mb-1">Linked Experiment</label>
              <select
                value={setupExperiment}
                onChange={(e) => setSetupExperiment(e.target.value)}
                className="w-full bg-neural-surface-alt border border-neural-border rounded-lg px-3 py-2 text-sm text-neural-text-primary focus:outline-none focus:border-neural-accent-cyan/50"
              >
                {availableExperiments.map((exp) => (
                  <option key={exp.id} value={exp.id}>{exp.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs text-neural-text-muted block mb-1">Channel Count</label>
              <select
                value={setupChannels}
                onChange={(e) => setSetupChannels(e.target.value)}
                className="w-full bg-neural-surface-alt border border-neural-border rounded-lg px-3 py-2 text-sm font-mono text-neural-text-primary focus:outline-none focus:border-neural-accent-cyan/50"
              >
                <option value="16">16 channels</option>
                <option value="32">32 channels</option>
                <option value="64">64 channels</option>
                <option value="128">128 channels</option>
              </select>
            </div>

            <div>
              <label className="text-xs text-neural-text-muted block mb-1">Sample Rate</label>
              <select
                value={setupSampleRate}
                onChange={(e) => setSetupSampleRate(e.target.value)}
                className="w-full bg-neural-surface-alt border border-neural-border rounded-lg px-3 py-2 text-sm font-mono text-neural-text-primary focus:outline-none focus:border-neural-accent-cyan/50"
              >
                <option value="20000">20,000 Hz</option>
                <option value="30000">30,000 Hz</option>
                <option value="40000">40,000 Hz</option>
              </select>
            </div>

            <div>
              <label className="text-xs text-neural-text-muted block mb-1">Output Format</label>
              <select
                value={setupFormat}
                onChange={(e) => setSetupFormat(e.target.value)}
                className="w-full bg-neural-surface-alt border border-neural-border rounded-lg px-3 py-2 text-sm text-neural-text-primary focus:outline-none focus:border-neural-accent-cyan/50"
              >
                <option value="HDF5">HDF5</option>
                <option value="NWB">NWB</option>
                <option value="RAW">RAW Binary</option>
              </select>
            </div>
          </div>

          <div className="flex items-center justify-between pt-3 border-t border-neural-border">
            <p className="text-xs text-neural-text-muted">
              <Cpu className="w-3 h-3 inline mr-1" />
              {setupChannels} ch &middot; {parseInt(setupSampleRate).toLocaleString()} Hz &middot; {setupFormat}
            </p>
            <button
              onClick={handleBeginRecording}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm bg-neural-accent-green/20 text-neural-accent-green border border-neural-accent-green/30 hover:bg-neural-accent-green/30 neural-transition"
            >
              <Circle className="w-3 h-3" />
              Begin Recording
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="flex-1 bg-neural-surface rounded-xl border border-neural-border overflow-hidden">
        <div className="overflow-x-auto overflow-y-auto h-full">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neural-border text-xs text-neural-text-muted uppercase tracking-wider">
                <th className="text-left px-4 py-3 font-medium">Name</th>
                <th className="text-left px-4 py-3 font-medium">Experiment</th>
                <th className="text-left px-4 py-3 font-medium">Date</th>
                <th className="text-left px-4 py-3 font-medium">Duration</th>
                <th className="text-right px-4 py-3 font-medium">Spikes</th>
                <th className="text-center px-4 py-3 font-medium">Ch</th>
                <th className="text-right px-4 py-3 font-medium">Size</th>
                <th className="text-center px-4 py-3 font-medium">Format</th>
                <th className="text-center px-4 py-3 font-medium">Status</th>
                <th className="text-center px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((rec) => (
                <tr
                  key={rec.id}
                  onClick={() => navigate(`/recordings/${rec.id}`)}
                  className="border-b border-neural-border/50 hover:bg-neural-surface-alt neural-transition cursor-pointer"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-neural-text-muted shrink-0" />
                      <span className="font-mono text-neural-text-primary">{rec.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-neural-text-secondary max-w-48 truncate">
                    {rec.experimentName}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5 text-neural-text-muted">
                      <Calendar className="w-3 h-3" />
                      {rec.date}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5 text-neural-text-secondary">
                      <Clock className="w-3 h-3" />
                      <span className="font-mono">{rec.duration}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="font-mono text-neural-accent-cyan">
                      {rec.spikeCount.toLocaleString()}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center font-mono text-neural-text-secondary">
                    {rec.channels}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-neural-text-secondary">
                    {rec.fileSize}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="px-2 py-0.5 rounded bg-neural-surface-alt text-xs text-neural-text-muted">
                      {rec.format}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        rec.status === "completed"
                          ? "bg-neural-accent-green/20 text-neural-accent-green"
                          : rec.status === "processing"
                          ? "bg-neural-accent-amber/20 text-neural-accent-amber"
                          : "bg-neural-accent-red/20 text-neural-accent-red"
                      }`}
                    >
                      {rec.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-1">
                      {rec.status === "completed" && (
                        <>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleAnalyzeInVisualizer(rec); }}
                            className="p-1 rounded hover:bg-neural-border text-neural-text-muted hover:text-neural-accent-cyan neural-transition"
                            title="Analyze in Visualizer"
                          >
                            <BarChart3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); navigate(`/analysis/new?recording=${rec.id}`); }}
                            className="p-1 rounded hover:bg-neural-border text-neural-text-muted hover:text-neural-accent-green neural-transition"
                            title="Run Analysis"
                          >
                            <FlaskConical className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                      <button
                        onClick={(e) => { e.stopPropagation(); navigate(`/recordings/${rec.id}`); }}
                        className="p-1 rounded hover:bg-neural-border text-neural-text-muted hover:text-neural-accent-green neural-transition"
                        title="Open"
                      >
                        <Play className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); alert(`Downloading ${rec.name} (${rec.fileSize})...`); }}
                        className="p-1 rounded hover:bg-neural-border text-neural-text-muted hover:text-neural-accent-blue neural-transition"
                        title="Download"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDelete(rec.id); }}
                        className="p-1 rounded hover:bg-neural-border text-neural-text-muted hover:text-neural-accent-red neural-transition"
                        title="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
