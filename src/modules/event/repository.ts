import { Event, IEvent, EventStatus } from './model';
import { logger } from '../../shared/logger';

/**
 * Check if an event already exists (for idempotency)
 */
export async function eventExists(eventId: string): Promise<boolean> {
  const event = await Event.findOne({ eventId }).lean();
  return !!event;
}

/**
 * Create a new event record
 */
export async function createEvent(data: {
  eventId: string;
  type: string;
  payload: Record<string, unknown>;
  correlationId?: string;
}): Promise<IEvent | null> {
  try {
    const event = new Event({
      eventId: data.eventId,
      type: data.type,
      payload: data.payload,
      correlationId: data.correlationId,
      status: 'ROUTING_PENDING',
      attempts: 0,
    });
    return await event.save();
  } catch (error: any) {
    // Handle duplicate key error (idempotency)
    if (error.code === 11000) {
      logger.info({ eventId: data.eventId }, 'Duplicate event detected, skipping');
      return null;
    }
    throw error;
  }
}

/**
 * Update event status
 */
export async function updateEventStatus(
  eventId: string,
  status: EventStatus,
  additionalData?: Partial<IEvent>
): Promise<IEvent | null> {
  return Event.findOneAndUpdate(
    { eventId },
    {
      $set: {
        status,
        ...additionalData,
        updatedAt: new Date(),
      },
    },
    { new: true }
  );
}

/**
 * Increment event attempt count
 */
export async function incrementEventAttempts(
  eventId: string
): Promise<IEvent | null> {
  return Event.findOneAndUpdate(
    { eventId },
    {
      $inc: { attempts: 1 },
      $set: { updatedAt: new Date() },
    },
    { new: true }
  );
}

/**
 * Mark event as failed
 */
export async function markEventFailed(
  eventId: string,
  error: string
): Promise<IEvent | null> {
  return Event.findOneAndUpdate(
    { eventId },
    {
      $set: {
        status: 'FAILED',
        error,
        updatedAt: new Date(),
      },
    },
    { new: true }
  );
}

/**
 * Mark event as routed
 */
export async function markEventRouted(eventId: string): Promise<IEvent | null> {
  return Event.findOneAndUpdate(
    { eventId },
    {
      $set: {
        status: 'ROUTED',
        processedAt: new Date(),
        updatedAt: new Date(),
      },
    },
    { new: true }
  );
}

/**
 * Get event by ID
 */
export async function getEventById(eventId: string): Promise<IEvent | null> {
  return Event.findOne({ eventId }).lean();
}

/**
 * Get events by status
 */
export async function getEventsByStatus(
  status: EventStatus,
  limit: number = 100
): Promise<IEvent[]> {
  return Event.find({ status })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();
}

