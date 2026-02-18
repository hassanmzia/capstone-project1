import { useEffect, useRef, useCallback, useState } from "react";

interface UseWebSocketOptions {
  url: string;
  onMessage?: (data: unknown) => void;
  onOpen?: (event: Event) => void;
  onClose?: (event: CloseEvent) => void;
  onError?: (event: Event) => void;
  reconnect?: boolean;
  reconnectInterval?: number;
  reconnectAttempts?: number;
  autoConnect?: boolean;
}

interface UseWebSocketReturn {
  sendMessage: (data: unknown) => void;
  connect: () => void;
  disconnect: () => void;
  isConnected: boolean;
  reconnectCount: number;
}

export function useWebSocket({
  url,
  onMessage,
  onOpen,
  onClose,
  onError,
  reconnect = true,
  reconnectInterval = 3000,
  reconnectAttempts = 10,
  autoConnect = true,
}: UseWebSocketOptions): UseWebSocketReturn {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectCountRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [reconnectCount, setReconnectCount] = useState(0);
  const intentionalCloseRef = useRef(false);

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, []);

  const connect = useCallback(() => {
    clearReconnectTimer();
    intentionalCloseRef.current = false;

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    try {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = url.startsWith("ws") ? url : `${protocol}//${window.location.host}${url}`;
      const ws = new WebSocket(wsUrl);

      ws.onopen = (event) => {
        setIsConnected(true);
        reconnectCountRef.current = 0;
        setReconnectCount(0);
        onOpen?.(event);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          onMessage?.(data);
        } catch {
          onMessage?.(event.data);
        }
      };

      ws.onclose = (event) => {
        setIsConnected(false);
        onClose?.(event);

        if (
          reconnect &&
          !intentionalCloseRef.current &&
          reconnectCountRef.current < reconnectAttempts
        ) {
          reconnectCountRef.current += 1;
          setReconnectCount(reconnectCountRef.current);
          const delay = reconnectInterval * Math.min(reconnectCountRef.current, 5);
          reconnectTimerRef.current = setTimeout(connect, delay);
        }
      };

      ws.onerror = (event) => {
        onError?.(event);
      };

      wsRef.current = ws;
    } catch (err) {
      console.error("WebSocket connection error:", err);
    }
  }, [url, onMessage, onOpen, onClose, onError, reconnect, reconnectInterval, reconnectAttempts, clearReconnectTimer]);

  const disconnect = useCallback(() => {
    intentionalCloseRef.current = true;
    clearReconnectTimer();
    if (wsRef.current) {
      wsRef.current.close(1000, "Client disconnect");
      wsRef.current = null;
    }
    setIsConnected(false);
  }, [clearReconnectTimer]);

  const sendMessage = useCallback((data: unknown) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(typeof data === "string" ? data : JSON.stringify(data));
    } else {
      console.warn("WebSocket is not connected. Message not sent.");
    }
  }, []);

  useEffect(() => {
    if (autoConnect) {
      connect();
    }
    return () => {
      disconnect();
    };
  }, [autoConnect, connect, disconnect]);

  return { sendMessage, connect, disconnect, isConnected, reconnectCount };
}

export default useWebSocket;
