import type { Request, Response, NextFunction } from 'express';

/**
 * Auth Middleware
 *
 * Extracts the JWT from the Authorization header and passes it through
 * to Django for validation. The BFF does not validate the JWT itself;
 * it simply forwards it as-is to the upstream Django service.
 */
export function authMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;

  if (authHeader) {
    // Ensure the Authorization header is forwarded to upstream
    // The proxy will include all original headers, but we log for tracing
    const tokenType = authHeader.startsWith('Bearer ') ? 'Bearer' : 'Unknown';
    console.debug(
      `[Auth] Forwarding ${tokenType} token for ${req.method} ${req.path}`
    );
  }

  // Always pass through - Django handles actual JWT validation
  next();
}

/**
 * Extract JWT token from a WebSocket upgrade request's query params or headers.
 * Used during WebSocket handshake to forward auth to Django Channels.
 */
export function extractWsToken(
  req: Request
): string | undefined {
  // Check Authorization header first
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }

  // Fall back to query parameter (common for WebSocket connections)
  const token = req.query?.token;
  if (typeof token === 'string' && token.length > 0) {
    return token;
  }

  return undefined;
}
