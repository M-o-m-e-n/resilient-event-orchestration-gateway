import { Router } from 'express';
import {
  ingestEvent,
  getEventStatus,
  getStats,
  getFailedEvents,
  replayDLQ,
} from './controller';
import { eventIngestionLimiter, statusLimiter } from '../../shared/rateLimiter';

const router = Router();

// Event ingestion (thin layer - fast response) with rate limiting
router.post('/', eventIngestionLimiter, ingestEvent);

// Get queue statistics
router.get('/stats', statusLimiter, getStats);

// Get failed events
router.get('/failed', statusLimiter, getFailedEvents);

// Replay DLQ jobs
router.post('/dlq/replay', statusLimiter, replayDLQ);

// Get event status by ID
router.get('/:eventId', statusLimiter, getEventStatus);

export default router;

