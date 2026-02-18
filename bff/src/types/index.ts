import type { WebSocket } from 'ws';
import type { IncomingMessage } from 'http';

// ─── WebSocket Channel Names ────────────────────────────────────────────────

export type WsChannel = 'neural-data' | 'agent-status' | 'chat' | 'spike-events' | 'notifications' | 'telemetry';

// ─── WebSocket Message Types ────────────────────────────────────────────────

export interface WsBaseMessage {
  type: string;
  timestamp: string;
}

export interface NeuralDataMessage extends WsBaseMessage {
  type: 'neural_data';
  channel_id: number;
  samples: number[];
  sample_rate: number;
}

export interface SpikeEventMessage extends WsBaseMessage {
  type: 'spike_event';
  neuron_id: number;
  amplitude: number;
  waveform: number[];
}

export interface PcbDataMessage extends WsBaseMessage {
  type: 'pcb_data';
  board_id: string;
  temperature: number;
  voltage: number;
  current: number;
}

export interface AgentHealthMessage extends WsBaseMessage {
  type: 'agent_health';
  agent_id: string;
  status: 'online' | 'offline' | 'degraded';
  metrics: Record<string, number>;
}

export interface AlertMessage extends WsBaseMessage {
  type: 'alert';
  severity: 'info' | 'warning' | 'error' | 'critical';
  source: string;
  message: string;
}

export interface ChatMessage extends WsBaseMessage {
  type: 'chat_message';
  user_id: string;
  content: string;
  room: string;
}

export type WsMessage =
  | NeuralDataMessage
  | SpikeEventMessage
  | PcbDataMessage
  | AgentHealthMessage
  | AlertMessage
  | ChatMessage;

// ─── WebSocket Client Tracking ──────────────────────────────────────────────

export interface TrackedClient {
  ws: WebSocket;
  channel: WsChannel;
  connectedAt: Date;
  remoteAddress: string;
}

// ─── Proxy Configuration ────────────────────────────────────────────────────

export interface ProxyTargetConfig {
  target: string;
  pathRewrite?: Record<string, string>;
  ws?: boolean;
}

export interface ProxyConfig {
  django: ProxyTargetConfig;
}

export interface BffConfig {
  port: number;
  corsOrigin: string;
  djangoUrl: string;
  redisUrl: string;
  rateLimit: {
    windowMs: number;
    max: number;
  };
}

// ─── Redis Channel Mapping ──────────────────────────────────────────────────

export type RedisChannel =
  | 'neural:processed_data'
  | 'neural:spike_events'
  | 'neural:pcb_data'
  | 'neural:agent_health'
  | 'neural:alerts'
  | 'neural:notifications'
  | 'neural:telemetry';

export interface RedisChannelMapping {
  redisChannel: RedisChannel;
  wsChannel: WsChannel;
}

// ─── Health Check ───────────────────────────────────────────────────────────

export interface HealthCheckResponse {
  status: 'ok' | 'degraded' | 'error';
  uptime: number;
  connections: {
    'neural-data': number;
    'agent-status': number;
    chat: number;
    'spike-events': number;
    notifications: number;
    telemetry: number;
    total: number;
  };
  timestamp: string;
}

// ─── Augmented Express Request ──────────────────────────────────────────────

export interface AuthenticatedRequest extends IncomingMessage {
  headers: IncomingMessage['headers'] & {
    authorization?: string;
    'x-forwarded-for'?: string;
    'x-real-ip'?: string;
  };
}
