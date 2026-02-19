import Redis from 'ioredis';
import wsManager from './wsManager.js';
import type { RedisChannel, WsChannel } from '../types/index.js';

/**
 * Redis Subscriber Service
 *
 * Subscribes to Redis pub/sub channels for real-time neural data events
 * and broadcasts them to connected WebSocket clients via wsManager.
 */

// Mapping from Redis channel names to WebSocket channel names
const CHANNEL_MAP: Record<RedisChannel, WsChannel> = {
  'neural:processed_data': 'neural-data',
  'neural:spike_events': 'spike-events',
  'neural:pcb_data': 'neural-data',
  'neural:agent_health': 'agent-status',
  'neural:alerts': 'agent-status',
  'neural:notifications': 'notifications',
  'neural:telemetry': 'telemetry',
};

const REDIS_CHANNELS: RedisChannel[] = [
  'neural:processed_data',
  'neural:spike_events',
  'neural:pcb_data',
  'neural:agent_health',
  'neural:alerts',
  'neural:notifications',
  'neural:telemetry',
];

/**
 * High-frequency channels are batched before broadcasting to reduce per-message
 * overhead. Events are accumulated and flushed every BATCH_INTERVAL_MS.
 */
const BATCH_INTERVAL_MS = 16; // ~60 Hz flush rate
const BATCHABLE_CHANNELS: Set<RedisChannel> = new Set([
  'neural:spike_events',
  'neural:telemetry',
]);

let subscriber: Redis | null = null;
let isConnected = false;

/** Pending batched messages keyed by WsChannel. */
const batchBuffers: Map<WsChannel, string[]> = new Map();
let batchTimer: ReturnType<typeof setInterval> | null = null;

/** Flush all accumulated batches to WebSocket clients. */
function flushBatches(): void {
  for (const [wsChannel, msgs] of batchBuffers.entries()) {
    if (msgs.length === 0) continue;

    if (msgs.length === 1) {
      wsManager.broadcast(wsChannel, msgs[0]);
    } else {
      // Wrap multiple messages in a JSON array batch envelope
      wsManager.broadcast(wsChannel, `[${msgs.join(',')}]`);
    }
    msgs.length = 0; // clear without re-allocating
  }
}

/**
 * Initialize the Redis subscriber and begin listening for messages.
 */
export function initRedisSubscriber(redisUrl: string): void {
  subscriber = new Redis(redisUrl, {
    retryStrategy(times: number): number | null {
      const delay = Math.min(times * 500, 5000);
      console.log(
        `[RedisSubscriber] Reconnecting in ${delay}ms (attempt ${times})`
      );
      return delay;
    },
    maxRetriesPerRequest: null,
    lazyConnect: true,
  });

  subscriber.on('connect', () => {
    isConnected = true;
    console.log('[RedisSubscriber] Connected to Redis');
  });

  subscriber.on('error', (err: Error) => {
    console.error(`[RedisSubscriber] Redis error: ${err.message}`);
  });

  subscriber.on('close', () => {
    isConnected = false;
    console.log('[RedisSubscriber] Redis connection closed');
  });

  // Handle incoming messages from subscribed channels
  subscriber.on('message', (channel: string, message: string) => {
    const redisChannel = channel as RedisChannel;
    const wsChannel = CHANNEL_MAP[redisChannel];
    if (!wsChannel) {
      console.warn(
        `[RedisSubscriber] Received message on unknown channel: ${channel}`
      );
      return;
    }

    try {
      // Validate JSON before broadcasting
      JSON.parse(message);

      if (BATCHABLE_CHANNELS.has(redisChannel)) {
        // Accumulate into batch buffer — flushed on timer
        let buf = batchBuffers.get(wsChannel);
        if (!buf) {
          buf = [];
          batchBuffers.set(wsChannel, buf);
        }
        buf.push(message);
      } else {
        wsManager.broadcast(wsChannel, message);
      }
    } catch {
      console.error(
        `[RedisSubscriber] Invalid JSON on channel "${channel}": ${message.substring(0, 100)}`
      );
    }
  });

  // Start batch flush timer for high-frequency channels
  if (!batchTimer) {
    batchTimer = setInterval(flushBatches, BATCH_INTERVAL_MS);
  }

  // Connect and subscribe
  subscriber
    .connect()
    .then(() => {
      return subscriber!.subscribe(...REDIS_CHANNELS);
    })
    .then(() => {
      console.log(
        `[RedisSubscriber] Subscribed to channels: ${REDIS_CHANNELS.join(', ')}`
      );
    })
    .catch((err: Error) => {
      console.error(
        `[RedisSubscriber] Failed to subscribe: ${err.message}`
      );
    });
}

/**
 * Check if Redis subscriber is connected.
 */
export function isRedisConnected(): boolean {
  return isConnected;
}

/**
 * Gracefully close the Redis subscriber connection.
 */
export async function closeRedisSubscriber(): Promise<void> {
  // Stop batch timer
  if (batchTimer) {
    clearInterval(batchTimer);
    flushBatches(); // send any remaining buffered messages
    batchTimer = null;
  }

  if (subscriber) {
    try {
      await subscriber.unsubscribe();
      await subscriber.quit();
      console.log('[RedisSubscriber] Disconnected from Redis');
    } catch (err) {
      console.error('[RedisSubscriber] Error during disconnect:', err);
      subscriber.disconnect();
    }
    subscriber = null;
    isConnected = false;
  }
}
