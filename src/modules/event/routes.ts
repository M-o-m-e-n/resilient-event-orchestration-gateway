import { Router } from 'express';
import {
  ingestEvent,
  getEventStatus,
  getStats,
  getFailedEvents,
  replayDLQ,
} from './controller';

const router = Router();

// Event ingestion (thin layer - fast response)
router.post('/', ingestEvent);

// Get queue statistics
router.get('/stats', getStats);

// Get failed events
router.get('/failed', getFailedEvents);

// Replay DLQ jobs
router.post('/dlq/replay', replayDLQ);

// Get event status by ID
router.get('/:eventId', getEventStatus);

export default router;

