const autocannon = require('autocannon');
const crypto = require('crypto');

const target = process.env.TARGET_URL || 'http://localhost:3000/events';
const secret = process.env.HMAC_SECRET || 'your-super-secret-key-change-in-production';

// Pre-generate a set of requests with unique eventIds and valid signatures
const NUM_REQUESTS = 1000;
const requests = [];

for (let i = 0; i < NUM_REQUESTS; i++) {
  const body = JSON.stringify({
    eventId: crypto.randomUUID(),
    type: 'test',
    payload: { test: true, index: i }
  });

  const signature = crypto
    .createHmac('sha256', secret)
    .update(body)
    .digest('hex');

  requests.push({
    method: 'POST',
    path: '/events',
    headers: {
      'Content-Type': 'application/json',
      'x-hmac-signature': signature,
    },
    body,
  });
}

const client = autocannon({
  url: target,
  connections: 100,
  duration: 10,
  requests,
});

autocannon.track(client, { renderProgressBar: true });

client.on('error', (error) => {
  console.error('Load test error:', error.message || error);
});

client.on('done', (result) => {
  console.log('Load test finished');
  console.log(`2xx: ${result['2xx']}, non-2xx: ${result.non2xx}`);
  console.log(`Avg latency: ${result.latency.average}ms`);
  console.log(`Requests/sec: ${result.requests.average}`);
});
