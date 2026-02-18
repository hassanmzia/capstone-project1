import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  HardDrive,
  Calendar,
  Clock,
  Activity,
  Cpu,
  FileText,
  Download,
  Trash2,
  FlaskConical,
  Zap,
  BarChart3,
  Layers,
} from "lucide-react";

interface RecordingDetail {
  id: string;
  name: string;
  experimentId: string;
  experimentName: string;
  date: string;
  duration: string;
  spikeCount: number;
  channels: number;
  fileSize: string;
  format: string;
  status: "completed" | "error" | "processing";
  sampleRate: string;
  bandpass: string;
  electrode: string;
  notes: string;
  meanFiringRate: string;
  peakAmplitude: string;
  snr: string;
  burstCount: number;
  sortedUnits: number;
}

const mockRecordingsDb: Record<string, RecordingDetail> = {
  "rec-042": {
    id: "rec-042",
    name: "session_042",
    experimentId: "exp-001",
    experimentName: "Hippocampal CA1 Place Cell Study",
    date: "2026-02-18 09:15",
    duration: "15:32",
    spikeCount: 48291,
    channels: 64,
    fileSize: "2.4 GB",
    format: "HDF5",
    status: "completed",
    sampleRate: "30,000 Hz",
    bandpass: "300 Hz – 6 kHz",
    electrode: "64ch Silicon Probe (NeuroNexus A1x64)",
    notes: "Subject ran 24 laps on virtual linear track. Stable place fields observed in 18 units. Theta oscillation prominent throughout. Minor motion artifact at 08:42 mark, cleaned in preprocessing.",
    meanFiringRate: "51.8 Hz",
    peakAmplitude: "285 uV",
    snr: "12.4 dB",
    burstCount: 342,
    sortedUnits: 18,
  },
  "rec-041": {
    id: "rec-041",
    name: "session_041",
    experimentId: "exp-001",
    experimentName: "Hippocampal CA1 Place Cell Study",
    date: "2026-02-17 14:22",
    duration: "30:10",
    spikeCount: 95100,
    channels: 64,
    fileSize: "4.8 GB",
    format: "HDF5",
    status: "completed",
    sampleRate: "30,000 Hz",
    bandpass: "300 Hz – 6 kHz",
    electrode: "64ch Silicon Probe (NeuroNexus A1x64)",
    notes: "Extended session with alternating run/rest blocks. Place cell remapping observed during rest periods. Excellent signal quality throughout. 22 sorted units with clear waveforms.",
    meanFiringRate: "52.6 Hz",
    peakAmplitude: "310 uV",
    snr: "13.1 dB",
    burstCount: 718,
    sortedUnits: 22,
  },
  "rec-040": {
    id: "rec-040",
    name: "session_040",
    experimentId: "exp-002",
    experimentName: "Cortical Spike Timing Analysis",
    date: "2026-02-16 11:05",
    duration: "10:00",
    spikeCount: 22430,
    channels: 32,
    fileSize: "1.1 GB",
    format: "NWB",
    status: "completed",
    sampleRate: "30,000 Hz",
    bandpass: "300 Hz – 8 kHz",
    electrode: "32ch Multi-shank (Cambridge NeuroTech)",
    notes: "Whisker deflection protocol C (2 Hz, single whisker). Clean responses in layers 4 and 5. Cross-correlation analysis shows precise timing relationships between L4 and L2/3.",
    meanFiringRate: "37.4 Hz",
    peakAmplitude: "220 uV",
    snr: "10.8 dB",
    burstCount: 156,
    sortedUnits: 14,
  },
  "rec-039": {
    id: "rec-039",
    name: "session_039",
    experimentId: "exp-002",
    experimentName: "Cortical Spike Timing Analysis",
    date: "2026-02-15 16:40",
    duration: "05:45",
    spikeCount: 0,
    channels: 32,
    fileSize: "540 MB",
    format: "NWB",
    status: "processing",
    sampleRate: "30,000 Hz",
    bandpass: "300 Hz – 8 kHz",
    electrode: "32ch Multi-shank (Cambridge NeuroTech)",
    notes: "Data acquired but spike sorting is still in progress. Raw traces look clean. Awaiting automated pipeline completion.",
    meanFiringRate: "—",
    peakAmplitude: "—",
    snr: "—",
    burstCount: 0,
    sortedUnits: 0,
  },
  "rec-038": {
    id: "rec-038",
    name: "session_038",
    experimentId: "exp-003",
    experimentName: "Retinal Ganglion Response Mapping",
    date: "2026-02-14 10:30",
    duration: "20:00",
    spikeCount: 67800,
    channels: 128,
    fileSize: "6.2 GB",
    format: "HDF5",
    status: "completed",
    sampleRate: "20,000 Hz",
    bandpass: "100 Hz – 3 kHz",
    electrode: "128ch MEA (Multi Channel Systems)",
    notes: "Full stimulus protocol: 10 min white noise + 10 min drifting gratings (8 directions x 3 SF). ON, OFF, and ON-OFF cells identified. Excellent coverage of retinal surface.",
    meanFiringRate: "56.5 Hz",
    peakAmplitude: "180 uV",
    snr: "9.2 dB",
    burstCount: 890,
    sortedUnits: 45,
  },
  "rec-037": {
    id: "rec-037",
    name: "session_037_failed",
    experimentId: "exp-003",
    experimentName: "Retinal Ganglion Response Mapping",
    date: "2026-02-14 09:00",
    duration: "02:15",
    spikeCount: 1200,
    channels: 128,
    fileSize: "320 MB",
    format: "RAW",
    status: "error",
    sampleRate: "20,000 Hz",
    bandpass: "100 Hz – 3 kHz",
    electrode: "128ch MEA (Multi Channel Systems)",
    notes: "Session aborted due to ground loop noise detected on channels 64-96. Perfusion system electrical interference identified as root cause. Fixed grounding before session_038.",
    meanFiringRate: "8.9 Hz",
    peakAmplitude: "95 uV",
    snr: "3.1 dB",
    burstCount: 12,
    sortedUnits: 3,
  },
};

function statusBadge(status: string) {
  const map: Record<string, string> = {
    completed: "bg-neural-accent-green/20 text-neural-accent-green",
    processing: "bg-neural-accent-amber/20 text-neural-accent-amber",
    error: "bg-neural-accent-red/20 text-neural-accent-red",
  };
  return (
    <span className={`px-2.5 py-1 rounded-full text-xs font-medium capitalize ${map[status] || map.error}`}>
      {status}
    </span>
  );
}

export default function RecordingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const rec = id ? mockRecordingsDb[id] : null;

  if (!rec) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <HardDrive className="w-12 h-12 text-neural-text-muted" />
        <p className="text-neural-text-muted">Recording not found</p>
        <button
          onClick={() => navigate("/recordings")}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm bg-neural-accent-cyan/20 text-neural-accent-cyan hover:bg-neural-accent-cyan/30 border border-neural-accent-cyan/30 neural-transition"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Recordings
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Top bar */}
      <div className="flex items-center justify-between bg-neural-surface rounded-xl border border-neural-border p-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate("/recordings")}
            className="p-1.5 rounded-lg hover:bg-neural-surface-alt text-neural-text-muted hover:text-neural-text-primary neural-transition"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <HardDrive className="w-5 h-5 text-neural-accent-blue" />
          <h1 className="text-lg font-semibold text-neural-text-primary font-mono">{rec.name}</h1>
          {statusBadge(rec.status)}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => alert(`Downloading ${rec.name} (${rec.fileSize})...`)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm bg-neural-surface-alt text-neural-text-secondary hover:text-neural-text-primary border border-neural-border neural-transition"
          >
            <Download className="w-4 h-4" />
            Download
          </button>
          <button
            onClick={() => { navigate("/recordings"); }}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-neural-text-muted hover:text-neural-accent-red hover:bg-neural-accent-red/10 border border-neural-border neural-transition"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Main info */}
          <div className="lg:col-span-2 space-y-4">
            {/* Recording details */}
            <div className="bg-neural-surface rounded-xl border border-neural-border p-5">
              <h2 className="text-sm font-semibold text-neural-text-primary mb-4">Recording Details</h2>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <span className="text-xs text-neural-text-muted flex items-center gap-1"><Calendar className="w-3 h-3" /> Date</span>
                  <p className="text-sm text-neural-text-primary mt-1">{rec.date}</p>
                </div>
                <div>
                  <span className="text-xs text-neural-text-muted flex items-center gap-1"><Clock className="w-3 h-3" /> Duration</span>
                  <p className="text-sm font-mono text-neural-text-primary mt-1">{rec.duration}</p>
                </div>
                <div>
                  <span className="text-xs text-neural-text-muted flex items-center gap-1"><Cpu className="w-3 h-3" /> Channels</span>
                  <p className="text-sm font-mono text-neural-text-primary mt-1">{rec.channels}</p>
                </div>
                <div>
                  <span className="text-xs text-neural-text-muted flex items-center gap-1"><FileText className="w-3 h-3" /> Format / Size</span>
                  <p className="text-sm text-neural-text-primary mt-1">{rec.format} &middot; {rec.fileSize}</p>
                </div>
              </div>
            </div>

            {/* Hardware config */}
            <div className="bg-neural-surface rounded-xl border border-neural-border p-5">
              <h2 className="text-sm font-semibold text-neural-text-primary mb-4">Acquisition Configuration</h2>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div>
                  <span className="text-xs text-neural-text-muted">Sample Rate</span>
                  <p className="text-sm font-mono text-neural-text-primary mt-1">{rec.sampleRate}</p>
                </div>
                <div>
                  <span className="text-xs text-neural-text-muted">Bandpass Filter</span>
                  <p className="text-sm font-mono text-neural-text-primary mt-1">{rec.bandpass}</p>
                </div>
                <div>
                  <span className="text-xs text-neural-text-muted">Electrode</span>
                  <p className="text-sm text-neural-text-primary mt-1">{rec.electrode}</p>
                </div>
              </div>
            </div>

            {/* Notes */}
            <div className="bg-neural-surface rounded-xl border border-neural-border p-5">
              <h2 className="text-sm font-semibold text-neural-text-primary mb-3">Session Notes</h2>
              <p className="text-sm text-neural-text-secondary leading-relaxed">{rec.notes}</p>
            </div>

            {/* Linked experiment */}
            <div
              onClick={() => navigate(`/experiments/${rec.experimentId}`)}
              className="bg-neural-surface rounded-xl border border-neural-border p-4 hover:border-neural-border-bright neural-transition cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <FlaskConical className="w-5 h-5 text-neural-accent-purple" />
                <div>
                  <span className="text-xs text-neural-text-muted">Parent Experiment</span>
                  <p className="text-sm font-semibold text-neural-text-primary">{rec.experimentName}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Sidebar: Stats */}
          <div className="space-y-4">
            {/* Spike stats */}
            <div className="bg-neural-surface rounded-xl border border-neural-border p-5">
              <h2 className="text-sm font-semibold text-neural-text-primary mb-4">Spike Statistics</h2>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-neural-text-muted flex items-center gap-1.5"><Zap className="w-3 h-3" /> Total Spikes</span>
                  <span className="text-sm font-mono text-neural-accent-cyan">{rec.spikeCount.toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-neural-text-muted flex items-center gap-1.5"><Activity className="w-3 h-3" /> Mean Firing Rate</span>
                  <span className="text-sm font-mono text-neural-text-primary">{rec.meanFiringRate}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-neural-text-muted flex items-center gap-1.5"><BarChart3 className="w-3 h-3" /> Peak Amplitude</span>
                  <span className="text-sm font-mono text-neural-text-primary">{rec.peakAmplitude}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-neural-text-muted flex items-center gap-1.5"><Layers className="w-3 h-3" /> SNR</span>
                  <span className="text-sm font-mono text-neural-text-primary">{rec.snr}</span>
                </div>
              </div>
            </div>

            {/* Analysis summary */}
            <div className="bg-neural-surface rounded-xl border border-neural-border p-5">
              <h2 className="text-sm font-semibold text-neural-text-primary mb-4">Analysis Summary</h2>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-neural-text-muted">Sorted Units</span>
                  <span className="text-sm font-mono text-neural-text-primary">{rec.sortedUnits}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-neural-text-muted">Burst Events</span>
                  <span className="text-sm font-mono text-neural-text-primary">{rec.burstCount.toLocaleString()}</span>
                </div>
              </div>

              {rec.status === "processing" && (
                <div className="mt-4 p-3 rounded-lg bg-neural-accent-amber/10 border border-neural-accent-amber/20">
                  <p className="text-xs text-neural-accent-amber">Spike sorting is still in progress. Statistics will update when complete.</p>
                </div>
              )}
              {rec.status === "error" && (
                <div className="mt-4 p-3 rounded-lg bg-neural-accent-red/10 border border-neural-accent-red/20">
                  <p className="text-xs text-neural-accent-red">This recording has errors. Check session notes for details.</p>
                </div>
              )}
            </div>

            {/* Channel map placeholder */}
            <div className="bg-neural-surface rounded-xl border border-neural-border p-5">
              <h2 className="text-sm font-semibold text-neural-text-primary mb-3">Channel Map</h2>
              <div className="aspect-square rounded-lg bg-neural-surface-alt border border-neural-border flex items-center justify-center">
                <div className="text-center">
                  <Cpu className="w-8 h-8 text-neural-text-muted mx-auto mb-2" />
                  <p className="text-xs text-neural-text-muted">{rec.channels}-channel array</p>
                  <p className="text-xs text-neural-text-muted mt-0.5">Visualization available in the Visualization tab</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
