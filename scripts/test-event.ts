/**
 * Test script to send events with valid HMAC signatures
 * Usage: npx ts-node scripts/test-event.ts
 */

import crypto from 'crypto';

const HMAC_SECRET = process.env.HMAC_SECRET || 'your-super-secret-key-change-in-production';
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

interface EventPayload {
  eventId?: string;
  type: string;
  payload: Record<string, unknown>;
}

function generateHMAC(payload: object, secret: string): string {
  return crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(payload))
    .digest('hex');
}

async function sendEvent(event: EventPayload): Promise<void> {
  const signature = generateHMAC(event, HMAC_SECRET);

  console.log('Sending event:', JSON.stringify(event, null, 2));
  console.log('HMAC Signature:', signature);

  const response = await fetch(`${BASE_URL}/events`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-hmac-signature': signature,
    },
    body: JSON.stringify(event),
  });

  const data = await response.json();
  console.log('Response:', response.status, JSON.stringify(data, null, 2));
}

async function sendBatchEvents(count: number): Promise<void> {
  console.log(`Sending ${count} events...`);
  const startTime = Date.now();

  const promises = Array.from({ length: count }, (_, i) => {
    const event: EventPayload = {
      eventId: crypto.randomUUID(),
      type: 'ORDER_CREATED',
      payload: {
        orderId: `order-${i}`,
        timestamp: new Date().toISOString(),
      },
    };
    return sendEvent(event);
  });

  await Promise.all(promises);

  const duration = Date.now() - startTime;
  console.log(`\nSent ${count} events in ${duration}ms`);
  console.log(`Average: ${(duration / count).toFixed(2)}ms per event`);
}

async function checkHealth(): Promise<void> {
  const response = await fetch(`${BASE_URL}/health`);
  const data = await response.json();
  console.log('Health:', response.status, JSON.stringify(data, null, 2));
}

async function getStats(): Promise<void> {
  const response = await fetch(`${BASE_URL}/events/stats`);
  const data = await response.json();
  console.log('Stats:', JSON.stringify(data, null, 2));
}

// Main execution
const args = process.argv.slice(2);
const command = args[0] || 'single';

(async () => {
  try {
    switch (command) {
      case 'single':
        await sendEvent({
          type: 'ORDER_CREATED',
          payload: { orderId: '12345', status: 'pending' },
        });
        break;
      case 'batch':
        const count = parseInt(args[1] || '10', 10);
        await sendBatchEvents(count);
        break;
      case 'health':
        await checkHealth();
        break;
      case 'stats':
        await getStats();
        break;
      default:
        console.log('Usage: npx ts-node scripts/test-event.ts [single|batch <count>|health|stats]');
    }
  } catch (error) {
    console.error('Error:', error);
  }
})();

