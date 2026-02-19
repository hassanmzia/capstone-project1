import { WebSocket } from 'ws';
import type { WsChannel } from '../types/index.js';

/**
 * Maximum buffered bytes before a client is considered "slow" and
 * data-intensive channels start skipping sends to it.
 * 1 MB threshold prevents unbounded memory growth under load.
 */
const BACKPRESSURE_THRESHOLD = 1024 * 1024; // 1 MB

/**
 * Channels that carry high-throughput data and should respect backpressure.
 * Low-volume channels (chat, notifications) always send immediately.
 */
const HIGH_THROUGHPUT_CHANNELS: Set<WsChannel> = new Set([
  'neural-data',
  'spike-events',
  'telemetry',
]);

/**
 * WebSocket Connection Manager
 *
 * Tracks connected clients per channel and provides broadcast capabilities
 * for real-time neural data streaming. Includes backpressure handling to
 * prevent data loss and memory growth under high-throughput conditions.
 */
class WsManager {
  private clients: Map<WsChannel, Set<WebSocket>>;
  private droppedFrames: Map<WsChannel, number>;

  constructor() {
    this.clients = new Map<WsChannel, Set<WebSocket>>([
      ['neural-data', new Set()],
      ['agent-status', new Set()],
      ['chat', new Set()],
      ['spike-events', new Set()],
      ['notifications', new Set()],
      ['telemetry', new Set()],
    ]);
    this.droppedFrames = new Map<WsChannel, number>([
      ['neural-data', 0],
      ['spike-events', 0],
      ['telemetry', 0],
    ]);
  }

  /**
   * Register a new WebSocket client on a specific channel.
   */
  addClient(channel: WsChannel, ws: WebSocket): void {
    const channelClients = this.clients.get(channel);
    if (!channelClients) {
      console.warn(`[WsManager] Unknown channel: ${channel}`);
      return;
    }

    channelClients.add(ws);
    console.log(
      `[WsManager] Client added to "${channel}" (total: ${channelClients.size})`
    );

    // Auto-cleanup on close or error
    const cleanup = () => {
      this.removeClient(channel, ws);
    };

    ws.on('close', cleanup);
    ws.on('error', (err: Error) => {
      console.error(
        `[WsManager] Client error on "${channel}": ${err.message}`
      );
      cleanup();
    });
  }

  /**
   * Remove a WebSocket client from a specific channel.
   */
  removeClient(channel: WsChannel, ws: WebSocket): void {
    const channelClients = this.clients.get(channel);
    if (!channelClients) return;

    const deleted = channelClients.delete(ws);
    if (deleted) {
      console.log(
        `[WsManager] Client removed from "${channel}" (total: ${channelClients.size})`
      );
    }

    // Ensure the socket is terminated
    if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
      try {
        ws.terminate();
      } catch {
        // Ignore termination errors
      }
    }
  }

  /**
   * Broadcast a message to all connected clients on a specific channel.
   * For high-throughput channels, checks client backpressure before sending.
   * Automatically cleans up dead connections encountered during broadcast.
   */
  broadcast(channel: WsChannel, data: string | Buffer): void {
    const channelClients = this.clients.get(channel);
    if (!channelClients || channelClients.size === 0) return;

    const isHighThroughput = HIGH_THROUGHPUT_CHANNELS.has(channel);
    const deadClients: WebSocket[] = [];

    channelClients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        // Backpressure check: skip send if client buffer is overloaded
        if (isHighThroughput && client.bufferedAmount > BACKPRESSURE_THRESHOLD) {
          // Client is too slow — drop this frame for them
          const count = this.droppedFrames.get(channel) ?? 0;
          this.droppedFrames.set(channel, count + 1);
          return; // Skip this client, don't kill it
        }

        try {
          client.send(data);
        } catch (err) {
          console.error(
            `[WsManager] Failed to send to client on "${channel}":`,
            err
          );
          deadClients.push(client);
        }
      } else {
        deadClients.push(client);
      }
    });

    // Clean up dead connections
    deadClients.forEach((client) => {
      channelClients.delete(client);
      try {
        client.terminate();
      } catch {
        // Ignore termination errors
      }
    });
  }

  /**
   * Get the number of connected clients on a specific channel.
   */
  getClientCount(channel: WsChannel): number {
    return this.clients.get(channel)?.size ?? 0;
  }

  /**
   * Get total client count across all channels.
   */
  getTotalClientCount(): number {
    let total = 0;
    this.clients.forEach((clients) => {
      total += clients.size;
    });
    return total;
  }

  /**
   * Get client counts for all channels.
   */
  getAllClientCounts(): Record<WsChannel | 'total', number> {
    return {
      'neural-data': this.getClientCount('neural-data'),
      'agent-status': this.getClientCount('agent-status'),
      chat: this.getClientCount('chat'),
      'spike-events': this.getClientCount('spike-events'),
      notifications: this.getClientCount('notifications'),
      telemetry: this.getClientCount('telemetry'),
      total: this.getTotalClientCount(),
    };
  }

  /**
   * Get dropped frame counts for high-throughput channels.
   * Useful for monitoring backpressure impact.
   */
  getDroppedFrameCounts(): Record<string, number> {
    const result: Record<string, number> = {};
    this.droppedFrames.forEach((count, channel) => {
      result[channel] = count;
    });
    return result;
  }
}

// Singleton instance
const wsManager = new WsManager();
export default wsManager;
