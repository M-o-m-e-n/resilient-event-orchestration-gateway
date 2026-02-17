import pino from 'pino';

const isProduction = process.env.NODE_ENV === 'production';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: !isProduction
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
        },
      }
    : undefined,
  base: {
    pid: process.pid,
    service: 'event-gateway',
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

/**
 * Create a child logger with correlation ID
 */
export function createChildLogger(correlationId: string): pino.Logger {
  return logger.child({ correlationId });
}

export type Logger = pino.Logger;

