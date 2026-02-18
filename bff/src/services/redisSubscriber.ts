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

let subscriber: Redis | null = null;
let isConnected = false;

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
    const wsChannel = CHANNEL_MAP[channel as RedisChannel];
    if (!wsChannel) {
      console.warn(
        `[RedisSubscriber] Received message on unknown channel: ${channel}`
      );
      return;
    }

    try {
      // Validate JSON before broadcasting
      JSON.parse(message);
      wsManager.broadcast(wsChannel, message);
    } catch {
      console.error(
        `[RedisSubscriber] Invalid JSON on channel "${channel}": ${message.substring(0, 100)}`
      );
    }
  });

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
