import type { Request, Response, NextFunction } from 'express';

/**
 * Request Logger Middleware
 *
 * Logs HTTP method, URL, status code, and response time for every request.
 */
export function requestLogger(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const startTime = process.hrtime.bigint();
  const timestamp = new Date().toISOString();

  // Hook into response finish event to log after response is complete
  res.on('finish', () => {
    const endTime = process.hrtime.bigint();
    const durationMs = Number(endTime - startTime) / 1_000_000;

    const statusCode = res.statusCode;
    const statusColor = getStatusColor(statusCode);

    console.log(
      `[${timestamp}] ${req.method} ${req.originalUrl || req.url} ${statusColor}${statusCode}\x1b[0m ${durationMs.toFixed(2)}ms`
    );
  });

  next();
}

/**
 * Returns ANSI color code based on HTTP status code range.
 */
function getStatusColor(statusCode: number): string {
  if (statusCode >= 500) return '\x1b[31m'; // Red - server errors
  if (statusCode >= 400) return '\x1b[33m'; // Yellow - client errors
  if (statusCode >= 300) return '\x1b[36m'; // Cyan - redirects
  if (statusCode >= 200) return '\x1b[32m'; // Green - success
  return '\x1b[0m'; // Default
}
