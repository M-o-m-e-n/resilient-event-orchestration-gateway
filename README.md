# Resilient Event Orchestration Gateway

A high-concurrency, asynchronous event gateway built with Node.js, TypeScript, Redis (BullMQ), and MongoDB.

## Features

- **Low-Latency Ingestion** (<150ms response time)
- **HMAC Signature Validation** for payload authenticity
- **Redis-backed Queue** with BullMQ for job persistence
- **Exponential Backoff Retry Strategy** for transient failures
- **Dead Letter Queue (DLQ)** for failed events with replay capability
- **Idempotency Guarantees** using MongoDB unique indexes
- **Graceful Shutdown** handling
- **Health Check Endpoints** for monitoring
- **Correlation IDs** for request tracing
- **Structured Logging** with Pino

## Architecture

```
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
```

## Quick Start

### Prerequisites

- Docker & Docker Compose
- Node.js 20+ (for local development)

### Run with Docker Compose

```bash
docker-compose up --build
```

This single command spins up:
- App (Node.js application)
- Redis (job queue)
- MongoDB (state persistence)

### Local Development

```bash
# Install dependencies
npm install

# Start Redis and MongoDB (using Docker)
docker-compose up redis mongo -d

# Run in development mode
npm run dev
```

## API Endpoints

### POST /events
Ingest a new event.

**Headers:**
- `Content-Type: application/json`
- `x-hmac-signature`: HMAC-SHA256 signature of the payload
- `x-correlation-id` (optional): Correlation ID for tracing

**Body:**
```json
{
  "eventId": "uuid",
  "type": "ORDER_CREATED",
  "payload": {
    "orderId": "12345",
    "data": "..."
  }
}
```

**Response (202 Accepted):**
```json
{
  "accepted": true,
  "eventId": "uuid",
  "correlationId": "uuid",
  "message": "Event queued for processing",
  "latencyMs": 45
}
```

### GET /events/:eventId
Get event processing status.

### GET /events/stats
Get queue statistics.

### GET /events/failed
Get failed events.

### POST /events/dlq/replay
Replay all jobs from the Dead Letter Queue.

### GET /health
Health check endpoint.

### GET /ready
Readiness check endpoint.

## Dead Letter Queue (DLQ) Strategy

Events that fail after all retry attempts (default: 5) are automatically moved to the DLQ.

### DLQ Behavior:
1. After max retries, job metadata is stored in `events-dlq` queue
2. Original payload, error message, and attempt count are preserved
3. Events can be replayed via `POST /events/dlq/replay`

### Monitoring:
- Check DLQ count via `GET /events/stats`
- View failed events via `GET /events/failed`

### Replay:
```bash
curl -X POST http://localhost:3000/events/dlq/replay
```

## Eventual Consistency

This system follows an **eventual consistency** model:

1. **Immediate Acknowledgment**: Events receive a 202 response within <150ms
2. **Asynchronous Processing**: Heavy logic runs in background workers
3. **State Lifecycle**: Events transition through states:
   - `ROUTING_PENDING` → Initial state after ingestion
   - `ROUTED` → Successfully processed
   - `FAILED` → Failed after all retry attempts

### Guarantees:
- **At-least-once delivery**: Events may be processed multiple times (retries)
- **Idempotent processing**: MongoDB unique index prevents duplicate processing
- **Ordered within event**: Single event processed atomically

## Load Testing

Run the load test to verify the system handles 100 concurrent requests:

```bash
# Start the application first
docker-compose up --build

# In another terminal, run load test
npm run load-test
```

Expected results:
- Zero failed HTTP requests
- All events acknowledged with 202
- Events processed asynchronously
- Retry logs visible for simulated failures

## Unit Testing

Run the unit tests:

```bash
# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

## Project Structure

```
src/
├── index.ts                 # Application entry point
├── app.ts                   # Express app setup
├── infrastructure/
│   ├── redis/              # Redis connection management
│   │   ├── connection.ts
│   │   └── index.ts
│   └── mongo/              # MongoDB connection management
│       ├── connection.ts
│       └── index.ts
├── modules/
│   └── event/              # Event module
│       ├── controller.ts   # HTTP handlers
│       ├── service.ts      # Business logic
│       ├── worker.ts       # Queue worker
│       ├── queue.ts        # Queue configuration
│       ├── repository.ts   # Data access
│       ├── model.ts        # Mongoose schema
│       ├── routes.ts       # Express routes
│       └── index.ts
└── shared/
    ├── logger.ts           # Pino logger setup
    ├── hmac.ts             # HMAC validation utilities
    └── rateLimiter.ts      # HTTP rate limiting middleware
tests/
├── hmac.test.ts            # HMAC validation tests
├── event.test.ts           # Event payload validation tests
└── queue.test.ts           # Queue configuration tests
```

## Design Decisions & Tradeoffs

1. **At-least-once vs Exactly-once**: Chose at-least-once with idempotency checks for simplicity and reliability.

2. **Thin Ingestion Layer**: No database calls during ingestion ensures <150ms response times.

3. **BullMQ over raw Redis**: Built-in retry, backoff, and rate limiting features.

4. **MongoDB for State**: Flexible schema for event payloads, TTL indexes for automatic cleanup.

5. **Worker Concurrency (20)**: Balanced between throughput and resource consumption.

6. **Rate Limiting**: 
   - HTTP-level: 100 requests/second per IP using `express-rate-limit`
   - Worker-level: 100 jobs/second using BullMQ limiter

## Environment Variables

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

Key variables:
- `HMAC_SECRET`: Secret key for HMAC signature validation
- `RATE_LIMIT_MAX_REQUESTS`: Max HTTP requests per window (default: 100)
- `QUEUE_CONCURRENCY`: Worker concurrency level (default: 20)
- `MAX_RETRY_ATTEMPTS`: Max retry attempts before DLQ (default: 5)

## License

ISC
