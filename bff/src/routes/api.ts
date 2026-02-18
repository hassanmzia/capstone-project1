import { Router } from 'express';
import {
  createProxyMiddleware,
  type Options as ProxyOptions,
} from 'http-proxy-middleware';
import type { IncomingMessage, ServerResponse } from 'http';
import type { ClientRequest } from 'http';

/**
 * API Proxy Router
 *
 * Proxies all /api/* requests to the Django backend service.
 * Adds forwarding headers and handles proxy errors gracefully.
 */
export function createApiRouter(djangoUrl: string): Router {
  const router = Router();

  const proxyOptions: ProxyOptions = {
    target: djangoUrl,
    changeOrigin: true,
    // Preserve /api/* path as-is when forwarding to Django
    pathRewrite: undefined,
    on: {
      proxyReq: (proxyReq: ClientRequest, req: IncomingMessage) => {
        // Add forwarding headers so Django knows the original client
        const clientIp =
          (req.headers['x-forwarded-for'] as string) ||
          req.socket.remoteAddress ||
          'unknown';

        proxyReq.setHeader('X-Forwarded-For', clientIp);
        proxyReq.setHeader('X-Real-IP', clientIp.split(',')[0].trim());
        proxyReq.setHeader(
          'X-Forwarded-Proto',
          (req.headers['x-forwarded-proto'] as string) || 'http'
        );
        proxyReq.setHeader(
          'X-Forwarded-Host',
          req.headers.host || 'unknown'
        );

        // Forward Authorization header if present
        if (req.headers.authorization) {
          proxyReq.setHeader('Authorization', req.headers.authorization);
        }

        console.log(
          `[ApiProxy] ${req.method} ${req.url} -> ${djangoUrl}${req.url}`
        );
      },
      proxyRes: (
        proxyRes: IncomingMessage,
        req: IncomingMessage
      ) => {
        console.log(
          `[ApiProxy] Response for ${req.method} ${req.url}: ${proxyRes.statusCode}`
        );
      },
      error: (
        err: Error,
        req: IncomingMessage,
        res: ServerResponse | import('net').Socket
      ) => {
        console.error(
          `[ApiProxy] Proxy error for ${req.method} ${req.url}: ${err.message}`
        );

        // Only send a response if it's an HTTP response and headers haven't been sent
        if ('headersSent' in res && !res.headersSent && 'writeHead' in res) {
          const httpRes = res as ServerResponse;
          httpRes.writeHead(502, { 'Content-Type': 'application/json' });
          httpRes.end(
            JSON.stringify({
              error: 'Bad Gateway',
              message: 'Unable to reach the backend service',
              path: req.url,
              timestamp: new Date().toISOString(),
            })
          );
        }
      },
    },
    // Increase timeout for long-running neural data requests
    proxyTimeout: 30000,
    timeout: 30000,
  };

  const proxy = createProxyMiddleware(proxyOptions);

  // Proxy all routes under /api/*
  router.use('/api', proxy);

  return router;
}
