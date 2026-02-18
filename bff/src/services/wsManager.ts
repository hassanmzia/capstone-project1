import { WebSocket } from 'ws';
import type { WsChannel } from '../types/index.js';

/**
 * WebSocket Connection Manager
 *
 * Tracks connected clients per channel and provides broadcast capabilities
 * for real-time neural data streaming.
 */
class WsManager {
  private clients: Map<WsChannel, Set<WebSocket>>;

  constructor() {
    this.clients = new Map<WsChannel, Set<WebSocket>>([
      ['neural-data', new Set()],
      ['agent-status', new Set()],
      ['chat', new Set()],
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
   * Automatically cleans up dead connections encountered during broadcast.
   */
  broadcast(channel: WsChannel, data: string | Buffer): void {
    const channelClients = this.clients.get(channel);
    if (!channelClients || channelClients.size === 0) return;

    const deadClients: WebSocket[] = [];

    channelClients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
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
      total: this.getTotalClientCount(),
    };
  }
}

// Singleton instance
const wsManager = new WsManager();
export default wsManager;
