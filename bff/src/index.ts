import 'dotenv/config';

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { createServer, type IncomingMessage } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import type { Duplex } from 'stream';

import { createApiRouter } from './routes/api.js';
import { createHealthRouter } from './routes/health.js';
import { authMiddleware } from './middleware/auth.js';
import { requestLogger } from './middleware/logger.js';
import wsManager from './services/wsManager.js';
import {
  initRedisSubscriber,
  closeRedisSubscriber,
} from './services/redisSubscriber.js';
import type { WsChannel } from './types/index.js';

// ─── Configuration ──────────────────────────────────────────────────────────

const PORT = parseInt(process.env.BFF_PORT || '3026', 10);
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://172.168.1.95:3025';
const DJANGO_URL = process.env.DJANGO_URL || 'http://django:8085';
const REDIS_URL = process.env.REDIS_URL || 'redis://redis:6379';

// ─── Django Channels WebSocket Target ───────────────────────────────────────

const DJANGO_WS_URL = process.env.DJANGO_WS_URL || DJANGO_URL.replace('http', 'ws');

// Map BFF WebSocket paths to Django Channels paths
const WS_ROUTE_MAP: Record<string, { djangoPath: string; channel: WsChannel }> = {
  '/ws/neural-data': {
    djangoPath: '/ws/neural-data/',
    channel: 'neural-data',
  },
  '/ws/agent-status': {
    djangoPath: '/ws/agent-status/',
    channel: 'agent-status',
  },
  '/ws/chat': {
    djangoPath: '/ws/chat/',
    channel: 'chat',
  },
};

// ─── Express App Setup ──────────────────────────────────────────────────────

const app = express();

// Security headers
app.use(helmet());

// CORS
app.use(
  cors({
    origin: CORS_ORIGIN,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  })
);

// Compression
app.use(compression());

// Rate limiting: 100 requests per 15 minutes per IP
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too Many Requests',
    message: 'Rate limit exceeded. Please try again later.',
  },
});
app.use(limiter);

// Request logging
app.use(requestLogger);

// Auth middleware (forwards JWT, does not validate)
app.use(authMiddleware);

// ─── Routes ─────────────────────────────────────────────────────────────────

// Health check (before API proxy so it's not proxied)
app.use(createHealthRouter());

// API proxy to Django
app.use(createApiRouter(DJANGO_URL));

// ─── HTTP Server ────────────────────────────────────────────────────────────

const server = createServer(app);

// ─── WebSocket Server ───────────────────────────────────────────────────────

const wss = new WebSocketServer({ noServer: true });

/**
 * Handle WebSocket upgrade requests.
 * Routes /ws/* paths to the appropriate handler.
 */
server.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
  const pathname = req.url?.split('?')[0] || '';

  const routeConfig = WS_ROUTE_MAP[pathname];
  if (!routeConfig) {
    console.warn(`[WebSocket] Rejected upgrade for unknown path: ${pathname}`);
    socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
    socket.destroy();
    return;
  }

  wss.handleUpgrade(req, socket, head, (clientWs: WebSocket) => {
    handleWsConnection(clientWs, req, routeConfig);
  });
});

/**
 * Handle an established WebSocket connection.
 * Creates a proxy connection to Django Channels and manages bidirectional data flow.
 */
function handleWsConnection(
  clientWs: WebSocket,
  req: IncomingMessage,
  routeConfig: { djangoPath: string; channel: WsChannel }
): void {
  const { djangoPath, channel } = routeConfig;
  const clientIp = req.headers['x-forwarded-for'] as string || req.socket.remoteAddress || 'unknown';

  console.log(
    `[WebSocket] New connection on "${channel}" from ${clientIp}`
  );

  // Register client with the WebSocket manager for Redis broadcasts
  wsManager.addClient(channel, clientWs);

  // Create upstream connection to Django Channels
  const djangoWsUrl = `${DJANGO_WS_URL}${djangoPath}`;
  let upstreamWs: WebSocket | null = null;

  try {
    // Forward auth headers to Django Channels
    const headers: Record<string, string> = {};
    if (req.headers.authorization) {
      headers['Authorization'] = req.headers.authorization;
    }
    if (req.headers.cookie) {
      headers['Cookie'] = req.headers.cookie;
    }

    upstreamWs = new WebSocket(djangoWsUrl, {
      headers,
      handshakeTimeout: 10000,
    });

    // Forward messages from Django Channels to the client
    upstreamWs.on('message', (data: Buffer | string) => {
      if (clientWs.readyState === WebSocket.OPEN) {
        try {
          clientWs.send(data);
        } catch (err) {
          console.error(
            `[WebSocket] Error sending to client on "${channel}":`,
            err
          );
        }
      }
    });

    upstreamWs.on('open', () => {
      console.log(
        `[WebSocket] Upstream connection established for "${channel}"`
      );
    });

    upstreamWs.on('error', (err: Error) => {
      console.error(
        `[WebSocket] Upstream error for "${channel}": ${err.message}`
      );
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.close(1011, 'Upstream connection error');
      }
    });

    upstreamWs.on('close', (code: number, reason: Buffer) => {
      console.log(
        `[WebSocket] Upstream closed for "${channel}" (code: ${code}, reason: ${reason.toString()})`
      );
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.close(code, reason.toString());
      }
    });
  } catch (err) {
    console.error(
      `[WebSocket] Failed to connect to upstream "${djangoWsUrl}":`,
      err
    );
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.close(1011, 'Failed to connect to backend');
    }
  }

  // Forward messages from the client to Django Channels
  clientWs.on('message', (data: Buffer | string) => {
    if (upstreamWs && upstreamWs.readyState === WebSocket.OPEN) {
      try {
        upstreamWs.send(data);
      } catch (err) {
        console.error(
          `[WebSocket] Error forwarding message to upstream on "${channel}":`,
          err
        );
      }
    }
  });

  // Handle client disconnect
  clientWs.on('close', (code: number, reason: Buffer) => {
    console.log(
      `[WebSocket] Client disconnected from "${channel}" (code: ${code}, reason: ${reason.toString()})`
    );

    // Close upstream connection when client disconnects
    if (upstreamWs && upstreamWs.readyState === WebSocket.OPEN) {
      upstreamWs.close(1000, 'Client disconnected');
    }
  });

  clientWs.on('error', (err: Error) => {
    console.error(
      `[WebSocket] Client error on "${channel}": ${err.message}`
    );
  });

  // Heartbeat / ping-pong to detect dead connections
  const pingInterval = setInterval(() => {
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.ping();
    } else {
      clearInterval(pingInterval);
    }
  }, 30000);

  clientWs.on('close', () => {
    clearInterval(pingInterval);
  });
}

// ─── Redis Subscriber ───────────────────────────────────────────────────────

initRedisSubscriber(REDIS_URL);

// ─── Start Server ───────────────────────────────────────────────────────────

server.listen(PORT, () => {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Neural Interface BFF Service');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`  Port:           ${PORT}`);
  console.log(`  CORS Origin:    ${CORS_ORIGIN}`);
  console.log(`  Django Backend:  ${DJANGO_URL}`);
  console.log(`  Redis:          ${REDIS_URL}`);
  console.log(`  WebSocket Paths:`);
  Object.entries(WS_ROUTE_MAP).forEach(([path, config]) => {
    console.log(`    ${path} -> ${config.djangoPath}`);
  });
  console.log('═══════════════════════════════════════════════════════════');
});

// ─── Graceful Shutdown ──────────────────────────────────────────────────────

async function shutdown(signal: string): Promise<void> {
  console.log(`\n[Shutdown] Received ${signal}. Shutting down gracefully...`);

  // Close WebSocket server
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.close(1001, 'Server shutting down');
    }
  });

  // Close Redis subscriber
  await closeRedisSubscriber();

  // Close HTTP server
  server.close(() => {
    console.log('[Shutdown] HTTP server closed');
    process.exit(0);
  });

  // Force exit after 10 seconds
  setTimeout(() => {
    console.error('[Shutdown] Forced exit after timeout');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

export default app;
