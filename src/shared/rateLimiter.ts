import rateLimit from 'express-rate-limit';
import { logger } from './logger';

/**
 * Rate limiter for event ingestion endpoint
 * Protects against burst traffic and potential DDoS
 */
export const eventIngestionLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '1000', 10), // 1 second window
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10), // 100 requests per window
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  message: {
    error: 'Too many requests',
    message: 'Rate limit exceeded. Please try again later.',
    retryAfter: 1,
  },
  handler: (req, res, next, options) => {
    logger.warn({
      ip: req.ip,
      correlationId: req.correlationId,
      path: req.path,
    }, 'Rate limit exceeded');

    res.status(429).json(options.message);
  },
  skip: (req) => {
    // Skip rate limiting for health checks
    return req.path === '/health' || req.path === '/ready';
  },
});

/**
 * More lenient rate limiter for status/stats endpoints
 */
export const statusLimiter = rateLimit({
  windowMs: parseInt(process.env.STATUS_RATE_LIMIT_WINDOW_MS || '1000', 10),
  max: parseInt(process.env.STATUS_RATE_LIMIT_MAX || '50', 10),
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many requests',
    message: 'Rate limit exceeded for status endpoint.',
  },
});

