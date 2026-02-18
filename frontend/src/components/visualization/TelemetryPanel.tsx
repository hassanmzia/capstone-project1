/**
 * System telemetry panel.
 * Displays USB throughput, buffer utilization, packet loss, agent status,
 * sample rate, and recording duration in real-time.
 */

import { useEffect, useState, useRef, useCallback } from "react";
import { useWebSocket } from "@/hooks/useWebSocket";

interface AgentStatus {
  name: string;
  status: "online" | "degraded" | "offline" | "error";
  lastHeartbeat: number;
}

interface TelemetryData {
  usbThroughputMbps: number;
  bufferUtilization: number; // 0-100
  packetLossCount: number;
  packetLossRate: number; // packets/sec
  sampleRate: number;
  agents: AgentStatus[];
  fpgaTemp: number;
  recordingActive: boolean;
  recordingStartTime: number | null;
}

interface TelemetryPanelProps {
  className?: string;
}

const STATUS_COLORS: Record<string, string> = {
  online: "#22c55e",
  degraded: "#f59e0b",
  offline: "#6b7280",
  error: "#ef4444",
};

export default function TelemetryPanel({ className = "" }: TelemetryPanelProps) {
  const [telemetry, setTelemetry] = useState<TelemetryData>({
    usbThroughputMbps: 0,
    bufferUtilization: 0,
    packetLossCount: 0,
    packetLossRate: 0,
    sampleRate: 30000,
    agents: [],
    fpgaTemp: 0,
    recordingActive: false,
    recordingStartTime: null,
  });

  const [throughputHistory, setThroughputHistory] = useState<number[]>([]);
  const [recordingDuration, setRecordingDuration] = useState("00:00:00");
  const throughputCanvasRef = useRef<HTMLCanvasElement>(null);
  const bufferCanvasRef = useRef<HTMLCanvasElement>(null);

  const handleMessage = useCallback((data: unknown) => {
    const msg = data as Record<string, unknown>;
    if (msg.type === "telemetry" || msg.type === "system_status") {
      setTelemetry((prev) => ({
        ...prev,
        usbThroughputMbps: (msg.usbThroughputMbps as number) ?? prev.usbThroughputMbps,
        bufferUtilization: (msg.bufferUtilization as number) ?? prev.bufferUtilization,
        packetLossCount: (msg.packetLossCount as number) ?? prev.packetLossCount,
        packetLossRate: (msg.packetLossRate as number) ?? prev.packetLossRate,
        sampleRate: (msg.sampleRate as number) ?? prev.sampleRate,
        fpgaTemp: (msg.fpgaTemp as number) ?? prev.fpgaTemp,
        recordingActive: (msg.recordingActive as boolean) ?? prev.recordingActive,
        recordingStartTime: (msg.recordingStartTime as number | null) ?? prev.recordingStartTime,
        agents: (msg.agents as AgentStatus[]) ?? prev.agents,
      }));

      if (typeof msg.usbThroughputMbps === "number") {
        setThroughputHistory((prev) => {
          const next = [...prev, msg.usbThroughputMbps as number];
          return next.length > 60 ? next.slice(-60) : next;
        });
      }
    }
  }, []);

  useWebSocket({
    url: "/ws/telemetry",
    onMessage: handleMessage,
    autoConnect: true,
    reconnect: true,
  });

  // Recording timer
  useEffect(() => {
    if (!telemetry.recordingActive || !telemetry.recordingStartTime) {
      setRecordingDuration("00:00:00");
      return;
    }

    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - telemetry.recordingStartTime!) / 1000);
      const h = Math.floor(elapsed / 3600)
        .toString()
        .padStart(2, "0");
      const m = Math.floor((elapsed % 3600) / 60)
        .toString()
        .padStart(2, "0");
      const s = (elapsed % 60).toString().padStart(2, "0");
      setRecordingDuration(`${h}:${m}:${s}`);
    }, 1000);

    return () => clearInterval(interval);
  }, [telemetry.recordingActive, telemetry.recordingStartTime]);

  // Throughput sparkline
  useEffect(() => {
    const canvas = throughputCanvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.clearRect(0, 0, w, h);

    if (throughputHistory.length < 2) return;

    const maxVal = Math.max(...throughputHistory, 1);

    ctx.strokeStyle = "#06b6d4";
    ctx.lineWidth = 1.5;
    ctx.beginPath();

    for (let i = 0; i < throughputHistory.length; i++) {
      const x = (i / (throughputHistory.length - 1)) * w;
      const y = h - (throughputHistory[i] / maxVal) * h;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }

    ctx.stroke();

    // Fill area under curve
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.fillStyle = "rgba(6, 182, 212, 0.1)";
    ctx.fill();
  }, [throughputHistory]);

  // Buffer gauge
  useEffect(() => {
    const canvas = bufferCanvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.clearRect(0, 0, w, h);

    const util = telemetry.bufferUtilization / 100;
    const barH = 8;
    const barY = (h - barH) / 2;

    // Background
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    ctx.fillRect(0, barY, w, barH);

    // Fill
    const color =
      util > 0.9
        ? "#ef4444"
        : util > 0.7
        ? "#f59e0b"
        : "#22c55e";
    ctx.fillStyle = color;
    ctx.fillRect(0, barY, w * util, barH);
  }, [telemetry.bufferUtilization]);

  const bufferColor =
    telemetry.bufferUtilization > 90
      ? "text-red-400"
      : telemetry.bufferUtilization > 70
      ? "text-yellow-400"
      : "text-green-400";

  return (
    <div className={`flex flex-col bg-neural-surface rounded-xl border border-neural-border ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-neural-border">
        <h3 className="text-xs font-semibold text-neural-text-secondary uppercase tracking-wider">
          System Telemetry
        </h3>
        {telemetry.recordingActive && (
          <span className="flex items-center gap-1.5 text-xs text-red-400 font-mono">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            REC {recordingDuration}
          </span>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {/* USB Throughput */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] text-neural-text-muted uppercase tracking-wide">
              USB Throughput
            </span>
            <span className="text-xs font-mono text-neural-accent-cyan">
              {telemetry.usbThroughputMbps.toFixed(1)} MB/s
            </span>
          </div>
          <canvas
            ref={throughputCanvasRef}
            className="w-full h-8 rounded bg-neural-surface-alt"
          />
        </div>

        {/* Buffer Utilization */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] text-neural-text-muted uppercase tracking-wide">
              Buffer Usage
            </span>
            <span className={`text-xs font-mono ${bufferColor}`}>
              {telemetry.bufferUtilization.toFixed(0)}%
            </span>
          </div>
          <canvas
            ref={bufferCanvasRef}
            className="w-full h-4 rounded bg-neural-surface-alt"
          />
        </div>

        {/* Packet Loss */}
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-neural-text-muted uppercase tracking-wide">
            Packet Loss
          </span>
          <div className="text-right">
            <span
              className={`text-xs font-mono ${
                telemetry.packetLossRate > 0 ? "text-red-400" : "text-green-400"
              }`}
            >
              {telemetry.packetLossCount}
            </span>
            <span className="text-[10px] text-neural-text-muted ml-1">
              ({telemetry.packetLossRate.toFixed(1)}/s)
            </span>
          </div>
        </div>

        {/* Sample Rate */}
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-neural-text-muted uppercase tracking-wide">
            Sample Rate
          </span>
          <span className="text-xs font-mono text-neural-text-primary">
            {(telemetry.sampleRate / 1000).toFixed(1)} kHz
          </span>
        </div>

        {/* FPGA Temperature */}
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-neural-text-muted uppercase tracking-wide">
            FPGA Temp
          </span>
          <span
            className={`text-xs font-mono ${
              telemetry.fpgaTemp > 70
                ? "text-red-400"
                : telemetry.fpgaTemp > 55
                ? "text-yellow-400"
                : "text-neural-text-primary"
            }`}
          >
            {telemetry.fpgaTemp.toFixed(1)} C
          </span>
        </div>

        {/* Divider */}
        <div className="border-t border-neural-border" />

        {/* Agent Status */}
        <div>
          <span className="text-[10px] text-neural-text-muted uppercase tracking-wide block mb-1.5">
            Agent Status
          </span>
          <div className="space-y-1">
            {telemetry.agents.length > 0 ? (
              telemetry.agents.map((agent) => (
                <div
                  key={agent.name}
                  className="flex items-center justify-between"
                >
                  <div className="flex items-center gap-1.5">
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: STATUS_COLORS[agent.status] }}
                    />
                    <span className="text-xs text-neural-text-primary">
                      {agent.name}
                    </span>
                  </div>
                  <span className="text-[10px] text-neural-text-muted capitalize">
                    {agent.status}
                  </span>
                </div>
              ))
            ) : (
              <div className="text-xs text-neural-text-muted italic">
                No agents connected
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
