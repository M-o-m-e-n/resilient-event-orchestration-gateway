import { Request, Response } from 'express';
import crypto from 'crypto';
import { validateHMAC } from '../../shared/hmac';
import { createChildLogger } from '../../shared/logger';
import { addEventToQueue, getQueueStats, replayDLQJobs } from './queue';
import { getEventById, getEventsByStatus } from './repository';

const HMAC_SECRET = process.env.HMAC_SECRET;

export interface EventPayload {
  eventId: string;
  type: string;
  payload: Record<string, unknown>;
}

/**
 * Ingest a new event
 * POST /events
 */
export async function ingestEvent(req: Request, res: Response): Promise<void> {
  const startTime = Date.now();
  const correlationId = req.correlationId || (req.headers['x-correlation-id'] as string) || crypto.randomUUID();
  const signature = req.headers['x-hmac-signature'] as string;
  const log = createChildLogger(correlationId);

  try {
    if (!HMAC_SECRET) {
      log.error('HMAC_SECRET is not configured');
      res.status(500).json({
        error: 'Server misconfiguration',
        correlationId,
      });
      return;
    }

    if (!req.rawBody) {
      log.warn('Missing raw body for HMAC validation');
      res.status(400).json({
        error: 'Invalid request body',
        correlationId,
      });
      return;
    }

    const body: EventPayload = req.body;

    // Validate HMAC signature
    if (!validateHMAC(req.rawBody, signature, HMAC_SECRET)) {
      log.warn('Invalid HMAC signature');
      res.status(401).json({
        error: 'Invalid signature',
        correlationId,
      });
      return;
    }

    // Minimal validation
    if (!body.eventId || !body.type || !body.payload) {
      log.warn({ body }, 'Invalid payload');
      res.status(400).json({
        error: 'Missing required fields: eventId, type, payload',
        correlationId,
      });
      return;
    }

    // Require eventId from producer
    const eventId = body.eventId;

    // Add to queue immediately - NO heavy processing here
    await addEventToQueue({
      eventId,
      type: body.type,
      payload: body.payload,
      correlationId,
    });

    const latency = Date.now() - startTime;
    log.info({ eventId, latency }, 'Event accepted');

    // Return 202 Accepted immediately
    res.status(202).json({
      accepted: true,
      eventId,
      correlationId,
      message: 'Event queued for processing',
      latencyMs: latency,
    });
  } catch (error: any) {
    log.error({ error: error.message }, 'Failed to ingest event');
    res.status(500).json({
      error: 'Internal server error',
      correlationId,
    });
  }
}

/**
 * Get event status
 * GET /events/:eventId
 */
export async function getEventStatus(req: Request, res: Response): Promise<void> {
  const eventId = req.params.eventId as string;
  const correlationId = req.correlationId || (req.headers['x-correlation-id'] as string) || crypto.randomUUID();
  const log = createChildLogger(correlationId);

  try {
    const event = await getEventById(eventId);

    if (!event) {
      res.status(404).json({
        error: 'Event not found',
        eventId,
        correlationId,
      });
      return;
    }

    res.json({
      eventId: event.eventId,
      type: event.type,
      status: event.status,
      attempts: event.attempts,
      error: event.error,
      processedAt: event.processedAt,
      createdAt: event.createdAt,
      correlationId,
    });
  } catch (error: any) {
    log.error({ error: error.message, eventId }, 'Failed to get event status');
    res.status(500).json({
      error: 'Internal server error',
      correlationId,
    });
  }
}

/**
 * Get queue statistics
 * GET /events/stats
 */
export async function getStats(req: Request, res: Response): Promise<void> {
  try {
    const stats = await getQueueStats();
    res.json(stats);
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to get stats' });
  }
}

/**
 * Get failed events
 * GET /events/failed
 */
export async function getFailedEvents(req: Request, res: Response): Promise<void> {
  try {
    const limit = parseInt(req.query.limit as string) || 100;
    const events = await getEventsByStatus('FAILED', limit);
    res.json({ count: events.length, events });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to get failed events' });
  }
}

/**
 * Replay DLQ jobs
 * POST /events/dlq/replay
 */
export async function replayDLQ(req: Request, res: Response): Promise<void> {
  try {
    const count = await replayDLQJobs();
    res.json({ replayed: count, message: 'DLQ jobs replayed' });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to replay DLQ' });
  }
}
