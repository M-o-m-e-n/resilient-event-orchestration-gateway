import { Worker, Job } from 'bullmq';
import { getRedisConnection } from '../../infrastructure/redis';
import { logger } from '../../shared/logger';
import { processEvent, handleFinalFailure } from './service';
import { addToDLQ, EventJobData } from './queue';

const QUEUE_NAME = 'events';
const CONCURRENCY = parseInt(process.env.QUEUE_CONCURRENCY || '20', 10);
const MAX_RATE = parseInt(process.env.QUEUE_MAX_RATE || '100', 10);
const RATE_DURATION = parseInt(process.env.QUEUE_RATE_DURATION || '1000', 10);

let worker: Worker<EventJobData> | null = null;

/**
 * Process a single event job
 */
async function processor(job: Job<EventJobData>): Promise<void> {
  const { data } = job;
  const attemptsMade = job.attemptsMade;

  logger.debug({
    jobId: job.id,
    eventId: data.eventId,
    attempt: attemptsMade + 1
  }, 'Worker processing job');

  await processEvent(data, attemptsMade);
}

/**
 * Start the event worker
 */
export function startWorker(): Worker<EventJobData> {
  if (worker) {
    return worker;
  }

  worker = new Worker<EventJobData>(QUEUE_NAME, processor, {
    connection: getRedisConnection(),
    concurrency: CONCURRENCY,
    limiter: {
      max: MAX_RATE,
      duration: RATE_DURATION,
    },
  });

  // Event handlers
  worker.on('completed', (job) => {
    logger.info({
      jobId: job.id,
      eventId: job.data.eventId
    }, 'Job completed successfully');
  });

  worker.on('failed', async (job, error) => {
    if (!job) return;

    const maxAttempts = job.opts.attempts || 5;

    logger.warn({
      jobId: job.id,
      eventId: job.data.eventId,
      attempt: job.attemptsMade,
      maxAttempts,
      error: error.message,
    }, 'Job failed');

    // If max retries exhausted, move to DLQ
    if (job.attemptsMade >= maxAttempts) {
      await handleFinalFailure(job.data, error.message);

      await addToDLQ({
        originalJob: job.data,
        error: error.message,
        failedAt: new Date().toISOString(),
        attempts: job.attemptsMade,
      });
    }
  });

  worker.on('error', (error) => {
    logger.error({ error: error.message }, 'Worker error');
  });

  worker.on('ready', () => {
    logger.info({ concurrency: CONCURRENCY }, 'Worker ready and listening for jobs');
  });

  return worker;
}

/**
 * Stop the worker gracefully
 */
export async function stopWorker(): Promise<void> {
  if (worker) {
    await worker.close();
    worker = null;
    logger.info('Worker stopped');
  }
}

/**
 * Get worker instance
 */
export function getWorker(): Worker<EventJobData> | null {
  return worker;
}

