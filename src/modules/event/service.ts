import { createChildLogger } from '../../shared/logger';
import {
  eventExists,
  createEvent,
  incrementEventAttempts,
  markEventRouted,
  markEventFailed
} from './repository';
import { EventJobData } from './queue';

const ROUTING_DELAY_MS = parseInt(process.env.ROUTING_SERVICE_DELAY_MS || '2000', 10);

/**
 * Simulate the routing service with 2-second delay
 * In production, this would call an external routing API
 */
async function simulateRoutingService(
  eventId: string,
  payload: Record<string, unknown>
): Promise<boolean> {
  // Simulate the 2-second delay of external routing service
  await new Promise((resolve) => setTimeout(resolve, ROUTING_DELAY_MS));

  // Simulate occasional failures (10% chance) for testing retry logic
  if (Math.random() < 0.1) {
    throw new Error('Routing service temporarily unavailable');
  }

  return true;
}

/**
 * Process an event (called by worker)
 */
export async function processEvent(
  data: EventJobData,
  attemptsMade: number
): Promise<{ success: boolean; message: string }> {
  const log = createChildLogger(data.correlationId || data.eventId);

  log.info({ eventId: data.eventId, type: data.type, attempt: attemptsMade + 1 }, 'Processing event');

  // Check idempotency - skip if already processed
  const exists = await eventExists(data.eventId);
  if (exists) {
    const existingEvent = await import('./repository').then(r => r.getEventById(data.eventId));
    if (existingEvent?.status === 'ROUTED') {
      log.info({ eventId: data.eventId }, 'Event already processed, skipping');
      return { success: true, message: 'Event already processed (idempotent skip)' };
    }
  }

  // Create or update event record
  if (!exists) {
    await createEvent({
      eventId: data.eventId,
      type: data.type,
      payload: data.payload,
      correlationId: data.correlationId,
    });
  }

  // Increment attempt counter
  await incrementEventAttempts(data.eventId);

  try {
    // Call the routing service (with simulated 2s delay)
    await simulateRoutingService(data.eventId, data.payload);

    // Mark as successfully routed
    await markEventRouted(data.eventId);

    log.info({ eventId: data.eventId }, 'Event successfully routed');
    return { success: true, message: 'Event routed successfully' };
  } catch (error: any) {
    log.error({ eventId: data.eventId, error: error.message }, 'Routing failed');

    // Don't mark as failed yet - let BullMQ retry
    // Only mark as failed when all retries are exhausted (handled in worker)
    throw error;
  }
}

/**
 * Handle final failure after all retries exhausted
 */
export async function handleFinalFailure(
  data: EventJobData,
  error: string
): Promise<void> {
  const log = createChildLogger(data.correlationId || data.eventId);

  await markEventFailed(data.eventId, error);

  log.error({ eventId: data.eventId, error }, 'Event processing failed permanently');
}

