import { Router } from 'express';
import type { Request, Response } from 'express';
import wsManager from '../services/wsManager.js';
import { isRedisConnected } from '../services/redisSubscriber.js';
import type { HealthCheckResponse } from '../types/index.js';

/**
 * Health Check Router
 *
 * Provides a /health endpoint that returns server status, uptime,
 * and current WebSocket connection counts per channel.
 */
export function createHealthRouter(): Router {
  const router = Router();

  router.get('/health', (_req: Request, res: Response) => {
    const clientCounts = wsManager.getAllClientCounts();

    const response: HealthCheckResponse = {
      status: isRedisConnected() ? 'ok' : 'degraded',
      uptime: process.uptime(),
      connections: {
        'neural-data': clientCounts['neural-data'],
        'agent-status': clientCounts['agent-status'],
        chat: clientCounts.chat,
        total: clientCounts.total,
      },
      timestamp: new Date().toISOString(),
    };

    const httpStatus = response.status === 'ok' ? 200 : 503;
    res.status(httpStatus).json(response);
  });

  return router;
}
