# Distributed Email Sender

A distributed email processing system built with Node.js (API) and Go (Worker) that uses RabbitMQ for message queuing and Redis for job status tracking.

## Architecture

- **API Service** (`services/api/`): Node.js/TypeScript REST API that receives email requests
- **Worker Service** (`services/worker/`): Go-based worker that processes email jobs
- **Message Queue**: RabbitMQ for reliable job queuing
- **Cache/Status**: Redis for job status tracking and caching
- **Email Testing**: MailHog for local email testing
- **Observability**: OpenTelemetry with Jaeger for distributed tracing

## Quick Start

```bash
# Start all services
docker-compose up --build -d

# Send a test email
curl -X POST http://localhost:3000/api/emails \
  -H "Content-Type: application/json" \
  -d '{"to":"test@example.com","subject":"Test","body":"Hello World"}'

# Check job history
curl http://localhost:3000/api/jobs/history

# View emails in MailHog UI
open http://localhost:8025
```

## Services & Ports

| Service   | Port | Purpose                    |
|-----------|------|----------------------------|
| API       | 3000 | REST API endpoints         |
| Worker    | 3002 | Worker health checks       |
| RabbitMQ  | 5672 | AMQP message broker        |
| RabbitMQ UI | 15672 | Management interface     |
| Redis     | 6379 | Cache and job status       |
| MailHog   | 8025 | Email testing UI           |
| MailHog SMTP | 1025 | SMTP server             |
| Jaeger    | 16686 | Tracing UI                |

## API Endpoints

### POST /api/emails
Submit an email job for processing.

**Request:**
```json
{
  "to": "recipient@example.com",
  "subject": "Email Subject",
  "body": "Email content"
}
```

**Response:**
```json
{
  "message": "Email job submitted successfully",
  "job_id": "uuid",
  "status": "queued"
}
```

### GET /api/jobs/history
Get all job history with status tracking.

**Response:**
```json
{
  "total": 2,
  "jobs": [
    {
      "job_id": "uuid",
      "to": "test@example.com",
      "subject": "Test Email",
      "status": "completed",
      "created_at": "2025-06-29T15:52:17.432Z",
      "updated_at": "2025-06-29T15:52:20.445Z",
      "retry_count": 0,
      "history": [
        {"status": "queued", "timestamp": "...", "message": "Job queued"},
        {"status": "processing", "timestamp": "...", "message": ""},
        {"status": "completed", "timestamp": "...", "message": ""}
      ]
    }
  ]
}
```

### GET /health
Health check endpoint for both API and Worker services.

## Message Flow

1. **API** receives email request via REST
2. **API** creates job in Redis with "queued" status
3. **API** publishes message to RabbitMQ `email_tasks` queue
4. **Worker** consumes message from queue
5. **Worker** updates job status to "processing"
6. **Worker** sends email via SMTP (MailHog)
7. **Worker** updates job status to "completed"
8. **API** broadcasts status updates via WebSocket

## Development

### Running Tests
```bash
# API tests
cd services/api && npm test

# Worker tests
cd services/worker && go test ./...
```

### Build Commands
```bash
# API
cd services/api && npm run build

# Worker
cd services/worker && go build -o worker ./cmd/worker
```

### Environment Variables

**API Service:**
- `PORT=3000`
- `RABBITMQ_URL=amqp://admin:password@rabbitmq:5672`
- `REDIS_URL=redis://redis:6379`
- `OTEL_EXPORTER_JAEGER_ENDPOINT=http://jaeger:14268/api/traces`

**Worker Service:**
- `PORT=3002`
- `RABBITMQ_URL=amqp://admin:password@rabbitmq:5672`
- `REDIS_URL=redis://redis:6379`
- `SMTP_HOST=mailhog`
- `SMTP_PORT=1025`

## Troubleshooting

### Common Issues

**Emails stuck in "queued" status:**
- Check RabbitMQ connection in worker logs
- Verify queue names match between API and worker
- Ensure message format compatibility

**Worker not processing jobs:**
- Check RabbitMQ connectivity: `docker logs mail-sender-rabbitmq-1`
- Check worker logs: `docker logs mail-sender-worker-1`
- Verify queue exists in RabbitMQ UI

**Database connection issues:**
- Check Redis connectivity: `docker logs mail-sender-redis-1`
- Verify Redis URL format

### Useful Commands

```bash
# View logs
docker logs mail-sender-api-1 --tail=50
docker logs mail-sender-worker-1 --tail=50

# Check RabbitMQ queues
curl -u admin:password http://localhost:15672/api/queues

# Check Redis keys
docker exec mail-sender-redis-1 redis-cli keys "*"

# Restart services
docker-compose restart api worker
```

## Recent Fixes

**2025-06-29**: Fixed data format mismatch between API and Worker
- API now wraps EmailJob data in `content` field to match IMessage interface
- Worker now extracts job data from nested `content` structure
- Added custom JSON unmarshaling for timestamp handling
- Emails now process correctly from "queued" to "completed" status

## Architecture Notes

- **Fault Tolerance**: Jobs are persisted in RabbitMQ with durability
- **Retry Logic**: Failed jobs can be retried with exponential backoff
- **Monitoring**: Full distributed tracing with OpenTelemetry
- **Scalability**: Worker can be horizontally scaled
- **Development**: MailHog captures all emails for testing