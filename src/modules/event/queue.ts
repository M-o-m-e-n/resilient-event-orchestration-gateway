import { Queue, QueueEvents } from 'bullmq';
import { getRedisConnection } from '../../infrastructure/redis';
import { logger } from '../../shared/logger';

export interface EventJobData {
  eventId: string;
  type: string;
  payload: Record<string, unknown>;
  correlationId?: string;
}

const QUEUE_NAME = 'events';
const DLQ_NAME = 'events-dlq';

// Main event queue
export const eventQueue = new Queue<EventJobData>(QUEUE_NAME, {
  connection: getRedisConnection(),
  defaultJobOptions: {
    attempts: parseInt(process.env.MAX_RETRY_ATTEMPTS || '5', 10),
    backoff: {
      type: 'exponential',
      delay: parseInt(process.env.RETRY_DELAY || '1000', 10),
    },
    removeOnComplete: {
      age: 3600, // Keep completed jobs for 1 hour
      count: 1000,
    },
    removeOnFail: {
      age: 86400, // Keep failed jobs for 24 hours
    },
  },
});

// Dead Letter Queue
export const deadLetterQueue = new Queue(DLQ_NAME, {
  connection: getRedisConnection(),
});

// Queue events for monitoring
export const queueEvents = new QueueEvents(QUEUE_NAME, {
  connection: getRedisConnection(),
});

queueEvents.on('completed', ({ jobId }) => {
  logger.debug({ jobId }, 'Job completed');
});

queueEvents.on('failed', ({ jobId, failedReason }) => {
  logger.error({ jobId, failedReason }, 'Job failed');
});

/**
 * Add event to the queue
 */
export async function addEventToQueue(data: EventJobData): Promise<string> {
  const job = await eventQueue.add('process-event', data, {
    jobId: data.eventId, // Use eventId as jobId for deduplication
  });
  logger.debug({ jobId: job.id, eventId: data.eventId }, 'Event added to queue');
  return job.id!;
}

/**
 * Add failed event to DLQ
 */
export async function addToDLQ(data: {
  originalJob: EventJobData;
  error: string;
  failedAt: string;
  attempts: number;
}): Promise<void> {
  await deadLetterQueue.add('failed-event', data);
  logger.warn({ eventId: data.originalJob.eventId }, 'Event moved to DLQ');
}

/**
 * Replay jobs from DLQ
 */
export async function replayDLQJobs(): Promise<number> {
  const jobs = await deadLetterQueue.getJobs(['waiting', 'delayed']);
  let replayedCount = 0;

  for (const job of jobs) {
    try {
      await eventQueue.add('retry', job.data.originalJob);
      await job.remove();
      replayedCount++;
    } catch (error) {
      logger.error({ jobId: job.id, error }, 'Failed to replay DLQ job');
    }
  }

  logger.info({ replayedCount }, 'DLQ jobs replayed');
  return replayedCount;
}

/**
 * Get queue statistics
 */
export async function getQueueStats() {
  const [waiting, active, completed, failed, delayed] = await Promise.all([
    eventQueue.getWaitingCount(),
    eventQueue.getActiveCount(),
    eventQueue.getCompletedCount(),
    eventQueue.getFailedCount(),
    eventQueue.getDelayedCount(),
  ]);

  const dlqCount = await deadLetterQueue.getWaitingCount();

  return {
    waiting,
    active,
    completed,
    failed,
    delayed,
    dlq: dlqCount,
  };
}

/**
 * Close queue connections
 */
export async function closeQueues(): Promise<void> {
  await eventQueue.close();
  await deadLetterQueue.close();
  await queueEvents.close();
  logger.info('Queues closed');
}

