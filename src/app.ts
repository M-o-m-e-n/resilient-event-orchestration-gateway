import express, { Express, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { logger } from './shared/logger';
import { isRedisHealthy, closeRedis } from './infrastructure/redis';
import { isMongoHealthy, closeMongo } from './infrastructure/mongo';
import { eventRoutes, closeQueues, startWorker, stopWorker } from './modules/event';

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      correlationId: string;
      rawBody?: Buffer;
    }
  }
}

export function createApp(): Express {
  const app = express();

  // Parse JSON bodies
  app.use(express.json({
    limit: '1mb',
    verify: (req, res, buf) => {
      (req as Request & { rawBody?: Buffer }).rawBody = buf;
    },
  }));

  // Correlation ID middleware
  app.use((req: Request, res: Response, next: NextFunction) => {
    req.correlationId = (req.headers['x-correlation-id'] as string) || crypto.randomUUID();
    res.setHeader('x-correlation-id', req.correlationId);
    next();
  });

  // Request logging middleware
  app.use((req: Request, res: Response, next: NextFunction) => {
    const startTime = Date.now();

    res.on('finish', () => {
      const duration = Date.now() - startTime;
      logger.info({
        method: req.method,
        url: req.url,
        statusCode: res.statusCode,
        duration,
        correlationId: req.correlationId,
      }, 'Request completed');
    });

    next();
  });

  // Health check endpoint
  app.get('/health', async (req: Request, res: Response) => {
    try {
      const redisOk = await isRedisHealthy();
      const mongoOk = isMongoHealthy();

      const status = redisOk && mongoOk ? 200 : 503;
      res.status(status).json({
        status: status === 200 ? 'healthy' : 'unhealthy',
        timestamp: new Date().toISOString(),
        services: {
          redis: redisOk ? 'up' : 'down',
          mongo: mongoOk ? 'up' : 'down',
        },
      });
    } catch (error: any) {
      res.status(503).json({
        status: 'unhealthy',
        error: error.message,
      });
    }
  });

  // Readiness check
  app.get('/ready', async (req: Request, res: Response) => {
    const redisOk = await isRedisHealthy();
    const mongoOk = isMongoHealthy();

    if (redisOk && mongoOk) {
      res.status(200).json({ ready: true });
    } else {
      res.status(503).json({ ready: false });
    }
  });

  // Event routes
  app.use('/events', eventRoutes);

  // 404 handler
  app.use((req: Request, res: Response) => {
    res.status(404).json({ error: 'Not found' });
  });

  // Error handler
  app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
    logger.error({
      error: err.message,
      stack: err.stack,
      correlationId: req.correlationId,
    }, 'Unhandled error');

    res.status(500).json({
      error: 'Internal server error',
      correlationId: req.correlationId,
    });
  });

  return app;
}

/**
 * Graceful shutdown handler
 */
export async function gracefulShutdown(
  signal: string,
  server: ReturnType<Express['listen']>
): Promise<void> {
  logger.info({ signal }, 'Received shutdown signal. Starting graceful shutdown...');

  // Stop accepting new requests
  server.close(() => {
    logger.info('HTTP server closed');
  });

  try {
    // Close worker
    await stopWorker();
    logger.info('Worker stopped');

    // Close queues
    await closeQueues();
    logger.info('Queues closed');

    // Close database connections
    await closeMongo();
    logger.info('MongoDB disconnected');

    await closeRedis();
    logger.info('Redis disconnected');

    logger.info('Graceful shutdown completed');
    process.exit(0);
  } catch (error) {
    logger.error({ error }, 'Error during graceful shutdown');
    process.exit(1);
  }
}
