/**
 * NotificationPanel – slide-out panel showing real-time alerts.
 *
 * Displays notifications from all agents with severity badges,
 * mark-as-read, and clear-all controls.
 */

import { useState } from "react";
import {
  Bell,
  BellOff,
  Check,
  CheckCheck,
  Trash2,
  AlertTriangle,
  AlertCircle,
  Info,
  X,
} from "lucide-react";
import {
  useNotifications,
  type Notification,
} from "@/hooks/useNotifications";

function severityIcon(severity: string) {
  switch (severity) {
    case "critical":
      return <AlertCircle className="w-4 h-4 text-neural-accent-red" />;
    case "warning":
      return <AlertTriangle className="w-4 h-4 text-neural-accent-amber" />;
    default:
      return <Info className="w-4 h-4 text-neural-accent-cyan" />;
  }
}

function severityBg(severity: string) {
  switch (severity) {
    case "critical":
      return "border-l-neural-accent-red bg-red-950/20";
    case "warning":
      return "border-l-neural-accent-amber bg-amber-950/20";
    default:
      return "border-l-neural-accent-cyan bg-cyan-950/10";
  }
}

function timeAgo(timestamp: string): string {
  const seconds = Math.floor(
    (Date.now() - new Date(timestamp).getTime()) / 1000
  );
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

interface Props {
  className?: string;
}

export default function NotificationPanel({ className = "" }: Props) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<string>("all");
  const {
    notifications,
    unreadCount,
    connected,
    markRead,
    markAllRead,
    clearAll,
  } = useNotifications();

  const filtered =
    filter === "all"
      ? notifications
      : notifications.filter((n) => n.severity === filter);

  return (
    <div className={`relative ${className}`}>
      {/* Bell trigger */}
      <button
        onClick={() => setOpen(!open)}
        className="relative p-2 rounded-lg hover:bg-neural-surface-2 transition-colors"
        title="Notifications"
      >
        {connected ? (
          <Bell className="w-5 h-5 text-neural-text-secondary" />
        ) : (
          <BellOff className="w-5 h-5 text-neural-text-muted" />
        )}
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 bg-neural-accent-red text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-96 max-h-[70vh] bg-neural-surface border border-neural-border rounded-xl shadow-2xl z-50 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-neural-border">
            <h3 className="text-sm font-semibold text-neural-text-primary">
              Notifications{" "}
              {unreadCount > 0 && (
                <span className="text-neural-accent-cyan">({unreadCount})</span>
              )}
            </h3>
            <div className="flex items-center gap-2">
              <button
                onClick={markAllRead}
                className="p-1 rounded hover:bg-neural-surface-2 text-neural-text-muted"
                title="Mark all read"
              >
                <CheckCheck className="w-4 h-4" />
              </button>
              <button
                onClick={clearAll}
                className="p-1 rounded hover:bg-neural-surface-2 text-neural-text-muted"
                title="Clear all"
              >
                <Trash2 className="w-4 h-4" />
              </button>
              <button
                onClick={() => setOpen(false)}
                className="p-1 rounded hover:bg-neural-surface-2 text-neural-text-muted"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Filters */}
          <div className="flex items-center gap-1 px-4 py-2 border-b border-neural-border">
            {["all", "critical", "warning", "info"].map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
                  filter === f
                    ? "bg-neural-primary text-white"
                    : "text-neural-text-muted hover:bg-neural-surface-2"
                }`}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-neural-text-muted">
                <Bell className="w-8 h-8 mb-2 opacity-30" />
                <span className="text-sm">No notifications</span>
              </div>
            ) : (
              filtered.map((n: Notification) => (
                <div
                  key={n.id}
                  onClick={() => markRead(n.id)}
                  className={`flex items-start gap-3 px-4 py-3 border-l-2 border-b border-neural-border cursor-pointer transition-colors hover:bg-neural-surface-2 ${
                    severityBg(n.severity)
                  } ${n.read ? "opacity-60" : ""}`}
                >
                  <div className="mt-0.5">{severityIcon(n.severity)}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-neural-text-primary leading-snug">
                      {n.message}
                    </p>
                    <div className="flex items-center gap-2 mt-1 text-xs text-neural-text-muted">
                      <span>{n.source}</span>
                      <span>·</span>
                      <span>{timeAgo(n.timestamp)}</span>
                    </div>
                  </div>
                  {!n.read && (
                    <div className="mt-1">
                      <Check className="w-3.5 h-3.5 text-neural-text-muted" />
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
