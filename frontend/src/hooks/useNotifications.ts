/**
 * Hook for receiving real-time notifications via WebSocket.
 *
 * Subscribes to the BFF notification WebSocket channel and provides
 * a notification queue with auto-dismiss and severity filtering.
 */

import { useCallback, useEffect, useRef, useState } from "react";

export interface Notification {
  id: string;
  severity: "info" | "warning" | "critical";
  message: string;
  source: string;
  timestamp: string;
  read: boolean;
  metadata?: Record<string, unknown>;
}

const MAX_NOTIFICATIONS = 200;

function getWsUrl(): string {
  if (import.meta.env.VITE_WS_URL) {
    return import.meta.env.VITE_WS_URL + "/ws/notifications";
  }
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/ws/notifications`;
}

export function useNotifications() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(getWsUrl());
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "notification" || data.severity) {
          const notification: Notification = {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            severity: data.severity ?? "info",
            message: data.message ?? "",
            source: data.source ?? data.source_agent ?? "system",
            timestamp: data.timestamp ?? new Date().toISOString(),
            read: false,
            metadata: data.metadata,
          };
          setNotifications((prev) => {
            const next = [notification, ...prev];
            return next.slice(0, MAX_NOTIFICATIONS);
          });
        }
      } catch {
        // ignore malformed messages
      }
    };

    ws.onclose = () => {
      setConnected(false);
      reconnectTimer.current = setTimeout(connect, 3000);
    };

    ws.onerror = () => ws.close();
  }, []);

  useEffect(() => {
    connect();
    return () => {
      clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);

  const markRead = useCallback((id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
  }, []);

  const markAllRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, []);

  const clearAll = useCallback(() => {
    setNotifications([]);
  }, []);

  const unreadCount = notifications.filter((n) => !n.read).length;

  return {
    notifications,
    unreadCount,
    connected,
    markRead,
    markAllRead,
    clearAll,
  };
}
