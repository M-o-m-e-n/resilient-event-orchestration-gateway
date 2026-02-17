import Redis from 'ioredis';
import { logger } from '../../shared/logger';

export interface RedisConfig {
  host: string;
  port: number;
  maxRetriesPerRequest: null;
  enableReadyCheck: boolean;
}

const redisConfig: RedisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  maxRetriesPerRequest: null, // Required for BullMQ
  enableReadyCheck: false,
};

// Main Redis connection for general operations
export const redis = new Redis(redisConfig);

redis.on('connect', () => {
  logger.info('Redis connected');
});

redis.on('error', (err) => {
  logger.error({ err }, 'Redis connection error');
});

redis.on('close', () => {
  logger.warn('Redis connection closed');
});

/**
 * Get Redis connection config for BullMQ
 */
export function getRedisConnection(): RedisConfig {
  return redisConfig;
}

/**
 * Check Redis health
 */
export async function isRedisHealthy(): Promise<boolean> {
  try {
    const result = await redis.ping();
    return result === 'PONG';
  } catch (error) {
    return false;
  }
}

/**
 * Close Redis connection gracefully
 */
export async function closeRedis(): Promise<void> {
  await redis.quit();
  logger.info('Redis disconnected');
}

