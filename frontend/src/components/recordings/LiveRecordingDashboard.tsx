import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  Circle,
  Pause,
  Play,
  Square,
  Zap,
  Activity,
  Cpu,
  HardDrive,
  Clock,
  Bookmark,
  Send,
  ChevronDown,
  ChevronUp,
  Signal,
  Database,
  Gauge,
  AlertTriangle,
} from "lucide-react";

/* ═══════════════ Types ═══════════════ */

export interface EventMarker {
  id: string;
  time: number; // seconds since recording start
  label: string;
  type: "note" | "stimulus" | "artifact" | "event";
}

export interface RecordingStats {
  spikeCount: number;
  firingRate: number; // Hz (spikes / sec, rolling window)
  dataMB: number;
  dataRateMBs: number;
  bufferPct: number;
  snr: number;
}

interface Props {
  sessionName: string;
  experimentName: string;
  channels: number;
  sampleRate: number;
  format: string;
  elapsedSec: number;
  paused: boolean;
  onPause: () => void;
  onResume: () => void;
  onStop: (stats: RecordingStats, markers: EventMarker[]) => void;
}

/* ═══════════════ Simulated neural data engine ═══════════════ */

/** Generate a single sample of neural noise + spikes for one channel */
function neuralSample(t: number, chSeed: number, spikeProb: number): { value: number; spike: boolean } {
  // Band-limited neural noise (sum of sines at different frequencies)
  const noise =
    Math.sin(t * 0.7 + chSeed * 1.3) * 15 +
    Math.sin(t * 2.3 + chSeed * 0.7) * 10 +
    Math.sin(t * 5.1 + chSeed * 2.1) * 8 +
    Math.sin(t * 11.7 + chSeed * 3.4) * 5 +
    (Math.random() - 0.5) * 20; // gaussian-ish noise

  // Spike: sharp negative deflection followed by positive overshoot
  const spike = Math.random() < spikeProb;
  if (spike) {
    const spikeAmp = -(120 + Math.random() * 160); // -120 to -280 uV
    return { value: noise + spikeAmp, spike: true };
  }
  return { value: noise, spike: false };
}

/* ═══════════════ Canvas Waveform Renderer ═══════════════ */

function LiveWaveformCanvas({
  paused,
  previewChannels,
  onSpike,
}: {
  channels: number;
  paused: boolean;
  previewChannels: number;
  onSpike: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const bufferRef = useRef<Float32Array[]>([]);
  const writeIdxRef = useRef(0);
  const BUFFER_LEN = 600; // samples visible

  // Initialize buffers
  useEffect(() => {
    bufferRef.current = Array.from({ length: previewChannels }, () => new Float32Array(BUFFER_LEN));
    writeIdxRef.current = 0;
  }, [previewChannels]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let running = true;
    let lastTime = performance.now();

    const colors = [
      "#06b6d4", // cyan
      "#22c55e", // green
      "#a78bfa", // purple
      "#f59e0b", // amber
      "#ec4899", // pink
      "#3b82f6", // blue
      "#ef4444", // red
      "#14b8a6", // teal
    ];

    const render = (now: number) => {
      if (!running) return;
      const dt = (now - lastTime) / 1000;
      lastTime = now;

      const w = canvas.width;
      const h = canvas.height;
      const rowH = h / previewChannels;

      // Generate new samples (simulate ~1000 samples/sec worth of data, batch per frame)
      const samplesToAdd = paused ? 0 : Math.max(1, Math.round(dt * 120)); // ~120 visual samples/sec
      for (let s = 0; s < samplesToAdd; s++) {
        const t = performance.now() / 1000 + s * 0.008;
        for (let ch = 0; ch < previewChannels; ch++) {
          const { value, spike } = neuralSample(t, ch * 7.3, 0.003);
          bufferRef.current[ch][writeIdxRef.current % BUFFER_LEN] = value;
          if (spike) onSpike();
        }
        writeIdxRef.current++;
      }

      // Clear
      ctx.fillStyle = "#0c1222";
      ctx.fillRect(0, 0, w, h);

      // Draw each channel
      for (let ch = 0; ch < previewChannels; ch++) {
        const yCenter = rowH * ch + rowH / 2;

        // Channel label background
        ctx.fillStyle = "rgba(255,255,255,0.03)";
        if (ch % 2 === 0) ctx.fillRect(0, rowH * ch, w, rowH);

        // Divider
        ctx.strokeStyle = "rgba(255,255,255,0.06)";
        ctx.beginPath();
        ctx.moveTo(0, rowH * ch);
        ctx.lineTo(w, rowH * ch);
        ctx.stroke();

        // Channel label
        ctx.fillStyle = "rgba(255,255,255,0.3)";
        ctx.font = "10px monospace";
        ctx.fillText(`Ch ${ch}`, 4, yCenter - rowH / 2 + 12);

        // Waveform
        ctx.strokeStyle = colors[ch % colors.length];
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        const buf = bufferRef.current[ch];
        const startIdx = writeIdxRef.current;
        for (let i = 0; i < BUFFER_LEN; i++) {
          const sample = buf[(startIdx + i) % BUFFER_LEN];
          const x = (i / BUFFER_LEN) * w;
          const scale = rowH / 600; // ±300uV maps to full row height
          const y = yCenter - sample * scale;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }

      // Time scale bar
      ctx.fillStyle = "rgba(255,255,255,0.4)";
      ctx.font = "10px monospace";
      ctx.fillText("← 5s →", w - 50, h - 6);

      animRef.current = requestAnimationFrame(render);
    };

    animRef.current = requestAnimationFrame(render);
    return () => {
      running = false;
      cancelAnimationFrame(animRef.current);
    };
  }, [previewChannels, paused, onSpike]);

  // Handle resize
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(() => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * window.devicePixelRatio;
      canvas.height = rect.height * window.devicePixelRatio;
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    });
    observer.observe(canvas);
    // Trigger initial sizing
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;
    const ctx = canvas.getContext("2d");
    if (ctx) ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    return () => observer.disconnect();
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="w-full rounded-lg border border-neural-border"
      style={{ height: `${Math.min(previewChannels * 56, 450)}px` }}
    />
  );
}

/* ═══════════════ Channel Health Grid ═══════════════ */

function ChannelHealthGrid({ channels, paused }: { channels: number; paused: boolean }) {
  const [health, setHealth] = useState<number[]>([]);

  useEffect(() => {
    // Generate initial channel health
    setHealth(
      Array.from({ length: channels }, (_, i) => {
        const base = 0.7 + Math.random() * 0.3;
        // A few noisy channels
        if (i % 17 === 0) return 0.2 + Math.random() * 0.2;
        if (i % 23 === 0) return 0; // dead channel
        return base;
      }),
    );
  }, [channels]);

  // Slowly fluctuate health
  useEffect(() => {
    if (paused) return;
    const iv = setInterval(() => {
      setHealth((prev) =>
        prev.map((h) => {
          if (h === 0) return 0; // dead stays dead
          return Math.max(0.1, Math.min(1, h + (Math.random() - 0.5) * 0.05));
        }),
      );
    }, 2000);
    return () => clearInterval(iv);
  }, [paused]);

  const cols = channels <= 32 ? 8 : channels <= 64 ? 8 : 16;

  const statusColor = (val: number) => {
    if (val === 0) return "bg-neutral-800 border-neutral-700";
    if (val < 0.3) return "bg-red-500/40 border-red-500/50";
    if (val < 0.6) return "bg-amber-500/30 border-amber-500/40";
    return "bg-emerald-500/30 border-emerald-500/40";
  };

  const statusLabel = (val: number) => {
    if (val === 0) return "Dead";
    if (val < 0.3) return "Noisy";
    if (val < 0.6) return "Fair";
    return "Good";
  };

  const goodCount = health.filter((h) => h >= 0.6).length;
  const fairCount = health.filter((h) => h >= 0.3 && h < 0.6).length;
  const noisyCount = health.filter((h) => h > 0 && h < 0.3).length;
  const deadCount = health.filter((h) => h === 0).length;

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-neural-text-muted">Channel Health</span>
        <div className="flex items-center gap-3 text-[10px] text-neural-text-muted">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-emerald-500/40" />{goodCount} good</span>
          {fairCount > 0 && <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-amber-500/40" />{fairCount} fair</span>}
          {noisyCount > 0 && <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-red-500/40" />{noisyCount} noisy</span>}
          {deadCount > 0 && <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-neutral-800" />{deadCount} dead</span>}
        </div>
      </div>
      <div
        className="grid gap-0.5"
        style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}
      >
        {health.map((h, i) => (
          <div
            key={i}
            title={`Ch ${i}: ${statusLabel(h)} (${(h * 100).toFixed(0)}%)`}
            className={`aspect-square rounded-[2px] border cursor-default ${statusColor(h)}`}
          />
        ))}
      </div>
    </div>
  );
}

/* ═══════════════ Stat Card ═══════════════ */

function StatCard({ icon, label, value, sub, color }: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  color?: string;
}) {
  return (
    <div className="bg-neural-surface-alt rounded-lg border border-neural-border p-3">
      <div className="flex items-center gap-1.5 mb-1">
        <span className={color || "text-neural-text-muted"}>{icon}</span>
        <span className="text-[10px] text-neural-text-muted uppercase tracking-wider">{label}</span>
      </div>
      <p className={`text-lg font-mono font-semibold ${color || "text-neural-text-primary"}`}>{value}</p>
      {sub && <p className="text-[10px] text-neural-text-muted mt-0.5">{sub}</p>}
    </div>
  );
}

/* ═══════════════ Main Dashboard ═══════════════ */

export default function LiveRecordingDashboard({
  sessionName,
  experimentName,
  channels,
  sampleRate,
  format,
  elapsedSec,
  paused,
  onPause,
  onResume,
  onStop,
}: Props) {
  // Stats
  const spikeCountRef = useRef(0);
  const [stats, setStats] = useState<RecordingStats>({
    spikeCount: 0,
    firingRate: 0,
    dataMB: 0,
    dataRateMBs: 0,
    bufferPct: 0,
    snr: 0,
  });

  // Event markers
  const [markers, setMarkers] = useState<EventMarker[]>([]);
  const [markerText, setMarkerText] = useState("");
  const [markerType, setMarkerType] = useState<EventMarker["type"]>("note");
  const [showMarkerHistory, setShowMarkerHistory] = useState(false);

  // Preview channel count (user adjustable)
  const [previewChannels, setPreviewChannels] = useState(Math.min(channels, 8));

  // Spike rolling window for firing rate
  const spikeWindowRef = useRef<number[]>([]); // timestamps of recent spikes

  const handleSpike = useCallback(() => {
    if (paused) return;
    spikeCountRef.current++;
    spikeWindowRef.current.push(performance.now());
  }, [paused]);

  // Update stats at 4 Hz
  useEffect(() => {
    if (paused) return;
    const iv = setInterval(() => {
      const now = performance.now();
      // Prune spike window to last 3 seconds
      spikeWindowRef.current = spikeWindowRef.current.filter((t) => now - t < 3000);
      const recentSpikes = spikeWindowRef.current.length;
      const firingRate = recentSpikes / 3; // spikes per second over 3s window

      // Scale spike count to realistic numbers (multiply by channel ratio since canvas only shows preview)
      const channelScale = channels / Math.min(channels, 8);
      const totalSpikes = Math.round(spikeCountRef.current * channelScale);

      // Data rate: channels * sampleRate * 2 bytes (16-bit) per sample
      const bytesPerSec = channels * sampleRate * 2;
      const dataRateMBs = bytesPerSec / (1024 * 1024);
      const dataMB = dataRateMBs * elapsedSec;

      // Buffer: simulate realistic buffer usage (oscillates 15-45%)
      const bufferBase = 25 + Math.sin(now / 5000) * 10 + Math.sin(now / 1300) * 5;
      const bufferPct = Math.max(5, Math.min(85, bufferBase + (Math.random() - 0.5) * 4));

      // SNR: simulate (8-15 dB range, slowly drifting)
      const snr = 10 + Math.sin(now / 20000) * 2.5 + (Math.random() - 0.5) * 0.5;

      setStats({
        spikeCount: totalSpikes,
        firingRate: Math.round(firingRate * channelScale * 10) / 10,
        dataMB,
        dataRateMBs,
        bufferPct,
        snr: Math.round(snr * 10) / 10,
      });
    }, 250);
    return () => clearInterval(iv);
  }, [paused, channels, sampleRate, elapsedSec]);

  // Add event marker
  const addMarker = useCallback(() => {
    if (!markerText.trim()) return;
    const marker: EventMarker = {
      id: `mk-${Date.now()}`,
      time: elapsedSec,
      label: markerText.trim(),
      type: markerType,
    };
    setMarkers((prev) => [...prev, marker]);
    setMarkerText("");
  }, [markerText, markerType, elapsedSec]);

  const formatTime = (sec: number) => {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    if (h > 0) return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  const formatSize = (mb: number) => {
    if (mb >= 1024) return `${(mb / 1024).toFixed(2)} GB`;
    return `${mb.toFixed(1)} MB`;
  };

  const markerColors: Record<EventMarker["type"], string> = {
    note: "text-neural-accent-cyan bg-neural-accent-cyan/10 border-neural-accent-cyan/30",
    stimulus: "text-neural-accent-purple bg-neural-accent-purple/10 border-neural-accent-purple/30",
    artifact: "text-neural-accent-amber bg-neural-accent-amber/10 border-neural-accent-amber/30",
    event: "text-neural-accent-green bg-neural-accent-green/10 border-neural-accent-green/30",
  };

  const bufferColor = stats.bufferPct > 70 ? "text-neural-accent-red" : stats.bufferPct > 50 ? "text-neural-accent-amber" : "text-neural-accent-green";

  const previewOptions = useMemo(() => {
    const opts = [4, 8, 16, 32].filter((n) => n <= channels);
    if (!opts.includes(channels) && channels <= 32) opts.push(channels);
    return opts.sort((a, b) => a - b);
  }, [channels]);

  return (
    <div className="flex flex-col gap-3 flex-1 min-h-0">
      {/* ── Top Control Bar ── */}
      <div className="bg-neural-surface rounded-xl border border-neural-accent-red/30 p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            {/* Recording indicator */}
            <div className="flex items-center gap-2">
              {paused ? (
                <Pause className="w-4 h-4 text-neural-accent-amber" />
              ) : (
                <Circle className="w-3 h-3 fill-neural-accent-red animate-pulse" />
              )}
              <span className={`text-sm font-semibold ${paused ? "text-neural-accent-amber" : "text-neural-accent-red"}`}>
                {paused ? "Paused" : "Recording"}
              </span>
            </div>

            {/* Timer */}
            <span className="text-2xl font-mono font-bold text-neural-text-primary tabular-nums">
              {formatTime(elapsedSec)}
            </span>

            {/* Session info */}
            <div className="hidden md:flex items-center gap-2 text-xs text-neural-text-muted">
              <span className="font-mono">{sessionName}</span>
              <span>&middot;</span>
              <span>{channels} ch</span>
              <span>&middot;</span>
              <span>{(sampleRate / 1000).toFixed(0)}k Hz</span>
              <span>&middot;</span>
              <span>{format}</span>
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-2">
            {paused ? (
              <button
                onClick={onResume}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm bg-neural-accent-green/20 text-neural-accent-green border border-neural-accent-green/30 hover:bg-neural-accent-green/30 neural-transition"
              >
                <Play className="w-4 h-4" /> Resume
              </button>
            ) : (
              <button
                onClick={onPause}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm bg-neural-accent-amber/20 text-neural-accent-amber border border-neural-accent-amber/30 hover:bg-neural-accent-amber/30 neural-transition"
              >
                <Pause className="w-4 h-4" /> Pause
              </button>
            )}
            <button
              onClick={() => onStop(stats, markers)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm bg-neural-accent-red/20 text-neural-accent-red border border-neural-accent-red/30 hover:bg-neural-accent-red/30 neural-transition"
            >
              <Square className="w-4 h-4" /> Stop &amp; Save
            </button>
          </div>
        </div>
      </div>

      {/* ── Stats Row ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
        <StatCard
          icon={<Zap className="w-3.5 h-3.5" />}
          label="Total Spikes"
          value={stats.spikeCount.toLocaleString()}
          color="text-neural-accent-cyan"
        />
        <StatCard
          icon={<Activity className="w-3.5 h-3.5" />}
          label="Firing Rate"
          value={`${stats.firingRate.toFixed(1)} Hz`}
          sub={`${channels} channels`}
          color="text-neural-accent-green"
        />
        <StatCard
          icon={<Signal className="w-3.5 h-3.5" />}
          label="SNR"
          value={`${stats.snr.toFixed(1)} dB`}
          sub={stats.snr >= 10 ? "Good quality" : stats.snr >= 7 ? "Fair quality" : "Low quality"}
          color={stats.snr >= 10 ? "text-neural-accent-green" : stats.snr >= 7 ? "text-neural-accent-amber" : "text-neural-accent-red"}
        />
        <StatCard
          icon={<Database className="w-3.5 h-3.5" />}
          label="Data Written"
          value={formatSize(stats.dataMB)}
          sub={`${stats.dataRateMBs.toFixed(1)} MB/s`}
          color="text-neural-accent-blue"
        />
        <StatCard
          icon={<Gauge className="w-3.5 h-3.5" />}
          label="Buffer"
          value={`${stats.bufferPct.toFixed(0)}%`}
          sub={stats.bufferPct > 70 ? "High — slow disk?" : "Healthy"}
          color={bufferColor}
        />
        <StatCard
          icon={<HardDrive className="w-3.5 h-3.5" />}
          label="Est. Final Size"
          value={formatSize(stats.dataRateMBs * 60 * 30)} // estimate for 30min
          sub="@ 30 min"
          color="text-neural-text-secondary"
        />
      </div>

      {/* ── Main Content: Waveforms + Sidebar ── */}
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-4 gap-3">
        {/* Waveform Panel (3/4) */}
        <div className="lg:col-span-3 flex flex-col gap-2 min-h-0">
          {/* Waveform header */}
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-neural-text-secondary flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-neural-accent-cyan" />
              Live Neural Waveforms
            </span>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-neural-text-muted">Preview channels:</span>
              <select
                value={previewChannels}
                onChange={(e) => setPreviewChannels(parseInt(e.target.value))}
                className="bg-neural-surface-alt border border-neural-border rounded px-2 py-0.5 text-xs text-neural-text-primary focus:outline-none"
              >
                {previewOptions.map((n) => (
                  <option key={n} value={n}>{n} ch</option>
                ))}
              </select>
            </div>
          </div>

          {/* Canvas waveform */}
          <div className="flex-1 min-h-0">
            <LiveWaveformCanvas
              channels={channels}
              paused={paused}
              previewChannels={previewChannels}
              onSpike={handleSpike}
            />
          </div>

          {/* Event Marker Input */}
          <div className="bg-neural-surface rounded-lg border border-neural-border p-3">
            <div className="flex items-center gap-2">
              <Bookmark className="w-4 h-4 text-neural-accent-purple shrink-0" />
              <select
                value={markerType}
                onChange={(e) => setMarkerType(e.target.value as EventMarker["type"])}
                className="bg-neural-surface-alt border border-neural-border rounded-lg px-2 py-1.5 text-xs text-neural-text-primary focus:outline-none shrink-0"
              >
                <option value="note">Note</option>
                <option value="stimulus">Stimulus</option>
                <option value="artifact">Artifact</option>
                <option value="event">Event</option>
              </select>
              <input
                type="text"
                value={markerText}
                onChange={(e) => setMarkerText(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") addMarker(); }}
                placeholder={`Add ${markerType} marker at ${formatTime(elapsedSec)}...`}
                className="flex-1 bg-neural-surface-alt border border-neural-border rounded-lg px-3 py-1.5 text-sm text-neural-text-primary placeholder:text-neural-text-muted/50 focus:outline-none focus:border-neural-accent-purple/50"
              />
              <button
                onClick={addMarker}
                disabled={!markerText.trim()}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs bg-neural-accent-purple/20 text-neural-accent-purple border border-neural-accent-purple/30 hover:bg-neural-accent-purple/30 disabled:opacity-40 neural-transition shrink-0"
              >
                <Send className="w-3 h-3" /> Add
              </button>
            </div>

            {/* Marker history */}
            {markers.length > 0 && (
              <div className="mt-2">
                <button
                  onClick={() => setShowMarkerHistory((s) => !s)}
                  className="flex items-center gap-1 text-[10px] text-neural-text-muted hover:text-neural-text-secondary neural-transition"
                >
                  {showMarkerHistory ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  {markers.length} marker{markers.length !== 1 ? "s" : ""} added
                </button>
                {showMarkerHistory && (
                  <div className="mt-1.5 max-h-28 overflow-y-auto space-y-1">
                    {markers.map((mk) => (
                      <div key={mk.id} className="flex items-center gap-2 text-xs">
                        <span className="font-mono text-neural-text-muted w-12 shrink-0">{formatTime(mk.time)}</span>
                        <span className={`px-1.5 py-0.5 rounded text-[10px] border ${markerColors[mk.type]}`}>
                          {mk.type}
                        </span>
                        <span className="text-neural-text-secondary truncate">{mk.label}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Sidebar (1/4) */}
        <div className="flex flex-col gap-3 min-h-0 overflow-y-auto">
          {/* Channel Health */}
          <div className="bg-neural-surface rounded-lg border border-neural-border p-3">
            <div className="flex items-center gap-1.5 mb-2">
              <Cpu className="w-3.5 h-3.5 text-neural-text-muted" />
              <span className="text-xs font-medium text-neural-text-secondary">Electrode Array</span>
            </div>
            <ChannelHealthGrid channels={channels} paused={paused} />
          </div>

          {/* Recording Info */}
          <div className="bg-neural-surface rounded-lg border border-neural-border p-3 space-y-2">
            <div className="flex items-center gap-1.5 mb-1">
              <Clock className="w-3.5 h-3.5 text-neural-text-muted" />
              <span className="text-xs font-medium text-neural-text-secondary">Session Info</span>
            </div>
            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-neural-text-muted">Session</span>
                <span className="text-neural-text-primary font-mono">{sessionName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neural-text-muted">Experiment</span>
                <span className="text-neural-text-primary truncate ml-2 text-right">{experimentName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neural-text-muted">Channels</span>
                <span className="text-neural-text-primary font-mono">{channels}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neural-text-muted">Sample Rate</span>
                <span className="text-neural-text-primary font-mono">{(sampleRate / 1000).toFixed(0)}k Hz</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neural-text-muted">Format</span>
                <span className="text-neural-text-primary">{format}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neural-text-muted">Elapsed</span>
                <span className="text-neural-text-primary font-mono">{formatTime(elapsedSec)}</span>
              </div>
            </div>
          </div>

          {/* Warnings */}
          {(stats.bufferPct > 60 || stats.snr < 7) && (
            <div className="bg-neural-surface rounded-lg border border-neural-accent-amber/30 p-3">
              <div className="flex items-center gap-1.5 mb-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-neural-accent-amber" />
                <span className="text-xs font-medium text-neural-accent-amber">Warnings</span>
              </div>
              <div className="space-y-1 text-[11px]">
                {stats.bufferPct > 60 && (
                  <p className="text-neural-accent-amber">Buffer usage high ({stats.bufferPct.toFixed(0)}%). Check disk write speed.</p>
                )}
                {stats.snr < 7 && (
                  <p className="text-neural-accent-amber">Low SNR ({stats.snr.toFixed(1)} dB). Check electrode impedance.</p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
