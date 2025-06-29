# Distributed Email Sender

A distributed email processing system built with Node.js (API) and Go (Worker) that uses RabbitMQ for message queuing and Redis for job status tracking.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              AWS Region: us-east-1                              │
│                                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │                    VPC: task-manager-vpc (10.16.0.0/16)                │    │
│  │                                                                         │    │
│  │  ┌─────────────┬─────────────┬─────────────┬─────────────────────────┐  │    │
│  │  │     AZ-A    │     AZ-B    │     AZ-C    │                         │  │    │
│  │  │             │             │             │                         │  │    │
│  │  │ ┌─────────┐ │ ┌─────────┐ │ ┌─────────┐ │   ┌─────────────────┐   │  │    │
│  │  │ │Web Layer│ │ │Web Layer│ │ │Web Layer│ │   │                 │   │  │    │
│  │  │ │ Public  │ │ │ Public  │ │ │ Public  │ │   │  Load Balancer  │   │  │    │
│  │  │ │.48.0/20 │ │ │.112.0/20│ │ │.176.0/20│ │   │      (ALB)      │   │  │    │
│  │  │ └─────────┘ │ └─────────┘ │ └─────────┘ │   │                 │   │  │    │
│  │  │             │             │             │   │ ┌─API-UI─────┐   │   │  │    │
│  │  │ ┌─────────┐ │ ┌─────────┐ │ ┌─────────┐ │   │ │MailHog-UI  │   │   │  │    │
│  │  │ │App Layer│ │ │App Layer│ │ │App Layer│ │   │ │ Jaeger-UI  │   │   │  │    │
│  │  │ │ Private │ │ │ Private │ │ │ Private │ │   │ └───────────┘   │   │  │    │
│  │  │ │.32.0/20 │ │ │.96.0/20 │ │ │.160.0/20│ │   └─────────────────┘   │  │    │
│  │  │ └─────────┘ │ └─────────┘ │ └─────────┘ │                         │  │    │
│  │  │             │             │             │                         │  │    │
│  │  │ ┌─────────┐ │ ┌─────────┐ │ ┌─────────┐ │                         │  │    │
│  │  │ │DB Layer │ │ │DB Layer │ │ │DB Layer │ │                         │  │    │
│  │  │ │Isolated │ │ │Isolated │ │ │Isolated │ │                         │  │    │
│  │  │ │.16.0/20 │ │ │.80.0/20 │ │ │.144.0/20│ │                         │  │    │
│  │  │ └─────────┘ │ └─────────┘ │ └─────────┘ │                         │  │    │
│  │  │             │             │             │                         │  │    │
│  │  │ ┌─────────┐ │ ┌─────────┐ │ ┌─────────┐ │                         │  │    │
│  │  │ │Reserved │ │ │Reserved │ │ │Reserved │ │                         │  │    │
│  │  │ │.0.0/20  │ │ │.64.0/20 │ │ │.128.0/20│ │                         │  │    │
│  │  │ └─────────┘ │ └─────────┘ │ └─────────┘ │                         │  │    │
│  │  └─────────────┴─────────────┴─────────────┴─────────────────────────┘  │    │
│  │                                                                         │    │
│  │  ┌─────────────────────────────────────────────────────────────────┐   │    │
│  │  │                    ECS Services in App Layer                    │   │    │
│  │  │                                                                 │   │    │
│  │  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │   │    │
│  │  │  │   API       │  │   Worker    │  │  RabbitMQ   │              │   │    │
│  │  │  │ Service     │  │  Service    │  │  Service    │              │   │    │
│  │  │  │ (Node.js)   │  │    (Go)     │  │   +EFS      │              │   │    │
│  │  │  │ Port: 3000  │  │ Port: 3002  │  │ Port: 5672  │              │   │    │
│  │  │  └─────────────┘  └─────────────┘  └─────────────┘              │   │    │
│  │  │                                                                 │   │    │
│  │  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │   │    │
│  │  │  │    Redis    │  │   MailHog   │  │   Jaeger    │              │   │    │
│  │  │  │   Service   │  │  Service    │  │  Service    │              │   │    │
│  │  │  │ Port: 6379  │  │SMTP:1025    │  │Trace:14268  │              │   │    │
│  │  │  │             │  │Web: 8025    │  │Web: 16686   │              │   │    │
│  │  │  └─────────────┘  └─────────────┘  └─────────────┘              │   │    │
│  │  └─────────────────────────────────────────────────────────────────┘   │    │
│  │                                                                         │    │
│  │  ┌─────────────────────────────────────────────────────────────────┐   │    │
│  │  │           Service Discovery: task-manager.local                 │   │    │
│  │  │                                                                 │   │    │
│  │  │  • api.task-manager.local           • redis.task-manager.local  │   │    │
│  │  │  • worker.task-manager.local        • mailhog.task-manager.local│   │    │
│  │  │  • rabbitmq.task-manager.local      • jaeger.task-manager.local │   │    │
│  │  └─────────────────────────────────────────────────────────────────┘   │    │
│  │                                                                         │    │
│  │  Internet Gateway ←→ Public Subnets ←→ NAT Gateway ←→ Private Subnets   │    │
│  └─────────────────────────────────────────────────────────────────────────┘    │
│                                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                              ECR Repositories                           │   │
│  │  • task-manager-api     • task-manager-worker                          │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────────┘

Data Flow:
Internet → ALB → API Service (App Layer) → RabbitMQ → Worker Service → MailHog
                     ↓                                    ↓
                  Redis (Status)                      Redis (Update)
                     ↓                                    ↓
                  Jaeger (Tracing) ←─────────────────── Jaeger
```

**Key Architecture Points:**

1. **Multi-AZ Setup**: 3 availability zones (us-east-1a/b/c) for high availability
2. **4-Tier Network**: Reserved, DB, App (private), Web (public) subnets  
3. **ECS Fargate**: All services run as containerized tasks
4. **Service Discovery**: Internal DNS resolution via `task-manager.local`
5. **Load Balancer**: ALB routes traffic to API, MailHog UI, and Jaeger UI
6. **Persistent Storage**: EFS for RabbitMQ data persistence
7. **Security**: Security groups control inter-service communication
8. **Observability**: Jaeger for distributed tracing, CloudWatch for logs

## Components

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

## Special Email Addresses for Testing

- `error-1@email.com` - Simulates error on first try
- `error@email.com` - Error sending mail