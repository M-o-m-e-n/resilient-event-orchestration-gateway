# Resilient Event Orchestration Gateway

## Principal Engineer Deep Dive Guide

------------------------------------------------------------------------

## 1. Understanding the Real Objective

This challenge is not only about coding. It evaluates:

-   Backpressure management
-   Burst traffic handling
-   Event-loop safety
-   Idempotency guarantees
-   Retry strategies
-   Distributed systems thinking
-   Clean architecture structure

This is a distributed systems design problem disguised as an
implementation task.

------------------------------------------------------------------------

## 2. High-Level Architecture

    External Producers
            |
       (HMAC Validation)
            |
    Thin Ingestion Layer (<150ms)
            |
         Redis Queue
            |
       Worker Pool (Controlled Concurrency)
            |
    Idempotency + MongoDB State Lookup
            |
    Routing Service (2s delay simulation)
            |
    Retry Strategy (Exponential Backoff)
            |
    Dead Letter Queue (DLQ)

Core principle: Fast acknowledgment + asynchronous processing.

------------------------------------------------------------------------

## 3. Technology Stack

Recommended:

-   Node.js
-   Express
-   Redis
-   BullMQ (Redis-based queue)
-   MongoDB
-   Docker + Docker Compose
-   Pino (structured logging)

------------------------------------------------------------------------

## 4. Low-Latency Ingestion Layer

Goals: - Validate HMAC - Minimal validation - Push to queue - Return 202
Accepted

DO NOT: - Call Mongo - Call Routing service - Perform heavy logic

Flow:

1.  Verify HMAC signature
2.  Validate payload schema
3.  Add job to Redis queue
4.  Return response immediately

HMAC Validation Implementation:

``` js
const crypto = require('crypto');

function validateHMAC(payload, signature, secret) {
  const expected = crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(payload))
    .digest('hex');
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expected)
  );
}
```

------------------------------------------------------------------------

## 5. Queueing Strategy

Use Redis + BullMQ.

Worker configuration example:

``` js
new Worker("events", processor, {
  concurrency: 20,
  limiter: {
    max: 100,
    duration: 1000
  }
})
```

Why? - Controlled parallelism - Resource protection - Built-in retries -
Persistence

------------------------------------------------------------------------

## 6. Idempotency Strategy

Duplicate events are common in logistics.

Approach: - Require eventId - Store eventId in MongoDB - Create unique
index

MongoDB Connection Setup:

``` js
const mongoose = require('mongoose');

mongoose.connect(process.env.MONGO_URI, {
  maxPoolSize: 10,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000
});

mongoose.connection.on('error', (err) => {
  console.error('MongoDB connection error:', err);
});

mongoose.connection.on('disconnected', () => {
  console.warn('MongoDB disconnected. Attempting reconnect...');
});
```

Mongo Schema Example:

``` json
{
  "eventId": "uuid",
  "status": "processed",
  "processedAt": "timestamp"
}
```

On processing:

-   Attempt insert
-   If duplicate key error → skip processing

Guarantees exactly-once processing logic.

------------------------------------------------------------------------

## 7. Handling the 2-Second Routing Delay

Simulate latency:

``` js
await new Promise(resolve => setTimeout(resolve, 2000));
```

Important: This must run inside workers only. Never inside controller.

------------------------------------------------------------------------

## 8. Retry Strategy (Exponential Backoff)

Example configuration:

``` js
attempts: 5,
backoff: {
  type: 'exponential',
  delay: 1000
}
```

Retry sequence: 1s → 2s → 4s → 8s → 16s

Prevents cascading failures.

------------------------------------------------------------------------

## 9. Dead Letter Queue (DLQ) Strategy

After max retry attempts:

-   Move job to DLQ
-   Store failure metadata
-   Enable manual replay

DLQ Implementation:

``` js
const { Queue, Worker } = require('bullmq');

const deadLetterQueue = new Queue('events-dlq', { connection: redisConnection });

const worker = new Worker('events', processor, {
  connection: redisConnection,
  concurrency: 20,
  settings: {
    backoffStrategy: (attemptsMade) => Math.pow(2, attemptsMade) * 1000
  }
});

worker.on('failed', async (job, err) => {
  if (job.attemptsMade >= job.opts.attempts) {
    await deadLetterQueue.add('failed-event', {
      originalJob: job.data,
      error: err.message,
      failedAt: new Date().toISOString(),
      attempts: job.attemptsMade
    });
    console.error(`Job ${job.id} moved to DLQ after ${job.attemptsMade} attempts`);
  }
});
```

Production Considerations: - Monitoring - Alerting - Replay tools

DLQ Replay Utility:

``` js
async function replayDLQJobs() {
  const jobs = await deadLetterQueue.getJobs(['waiting', 'delayed']);
  for (const job of jobs) {
    await eventsQueue.add('retry', job.data.originalJob);
    await job.remove();
  }
}
```

------------------------------------------------------------------------

## 10. Eventual Consistency Strategy

Ingestion returns 202 immediately. Processing happens asynchronously.

Order status lifecycle example:

ROUTING_PENDING → ROUTED → FAILED

System becomes eventually consistent.

------------------------------------------------------------------------

## 11. Load Testing (Proof of 100 Concurrent Requests)

Use autocannon:

    npx autocannon -c 100 -d 10 http://localhost:3000/events

Expected: - Zero failed HTTP requests - Retry logs visible - Successful
processing

Include logs or screenshot in repository.

------------------------------------------------------------------------

## 12. Clean Architecture Folder Structure

    src/
     ├── app.ts
     ├── infrastructure/
     │     ├── redis/
     │     ├── mongo/
     ├── modules/
     │     └── event/
     │           ├── controller.ts
     │           ├── service.ts
     │           ├── worker.ts
     │           ├── repository.ts
     ├── shared/
     │     ├── logger.ts
     │     ├── hmac.ts

Principles: - Separation of concerns - Modular monolith - Infrastructure
isolated

------------------------------------------------------------------------

## 13. Docker Compose Setup

Include:

-   app
-   redis
-   mongo

Run with:

    docker-compose up --build

Single command setup is mandatory.

------------------------------------------------------------------------

## 14. Advanced Production Enhancements

To impress:

-   Structured logging
-   Correlation IDs
-   Graceful shutdown
-   Health check endpoint
-   Rate limiting

### Correlation ID Middleware

``` js
const crypto = require('crypto');

app.use((req, res, next) => {
  req.correlationId = req.headers['x-correlation-id'] || crypto.randomUUID();
  res.setHeader('x-correlation-id', req.correlationId);
  next();
});
```

### Health Check Endpoint

``` js
app.get('/health', async (req, res) => {
  try {
    const redisOk = await redis.ping() === 'PONG';
    const mongoOk = mongoose.connection.readyState === 1;
    
    const status = redisOk && mongoOk ? 200 : 503;
    res.status(status).json({
      status: status === 200 ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      services: {
        redis: redisOk ? 'up' : 'down',
        mongo: mongoOk ? 'up' : 'down'
      }
    });
  } catch (error) {
    res.status(503).json({ status: 'unhealthy', error: error.message });
  }
});
```

### Graceful Shutdown

``` js
async function gracefulShutdown(signal) {
  console.log(`Received ${signal}. Starting graceful shutdown...`);
  
  // Stop accepting new requests
  server.close(() => {
    console.log('HTTP server closed');
  });
  
  // Close worker connections
  await worker.close();
  console.log('Worker closed');
  
  // Close queue connections
  await queue.close();
  console.log('Queue closed');
  
  // Close database connections
  await mongoose.disconnect();
  console.log('MongoDB disconnected');
  
  await redis.quit();
  console.log('Redis disconnected');
  
  process.exit(0);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
```

------------------------------------------------------------------------

## 15. Tradeoffs & Design Thinking

-   At-least-once delivery
-   Eventual consistency model
-   Storage cost of idempotency table
-   Controlled concurrency vs throughput

This demonstrates principal-level systems thinking.

------------------------------------------------------------------------