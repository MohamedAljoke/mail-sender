package messaging

import (
	"context"
	"encoding/json"
	"time"

	amqp "github.com/rabbitmq/amqp091-go"

	"task-scheduler-worker/internal/domain/errors"
	"task-scheduler-worker/internal/domain/models"
)

// RabbitMQService implements MessageBroker using RabbitMQ
type RabbitMQService struct {
	url        string
	conn       *amqp.Connection
	channel    *amqp.Channel
	queueNames *QueueNames
}

// NewRabbitMQService creates a new RabbitMQ message broker service
func NewRabbitMQService(rabbitMQURL string) *RabbitMQService {
	return &RabbitMQService{
		url: rabbitMQURL,
		queueNames: &QueueNames{
			EmailTasks:  "email_tasks",
			EmailRetry:  "email_tasks_retry",
			EmailFailed: "email_tasks_failed",
		},
	}
}

// Connect establishes connection to RabbitMQ
func (r *RabbitMQService) Connect(ctx context.Context) error {
	var err error
	
	r.conn, err = amqp.Dial(r.url)
	if err != nil {
		return errors.NewRabbitMQErrorWithCause("failed to connect to RabbitMQ", err)
	}

	r.channel, err = r.conn.Channel()
	if err != nil {
		return errors.NewRabbitMQErrorWithCause("failed to open channel", err)
	}

	return nil
}

// Close closes the RabbitMQ connection
func (r *RabbitMQService) Close() error {
	var errs []error

	if r.channel != nil {
		if err := r.channel.Close(); err != nil {
			errs = append(errs, errors.NewRabbitMQErrorWithCause("failed to close channel", err))
		}
	}

	if r.conn != nil {
		if err := r.conn.Close(); err != nil {
			errs = append(errs, errors.NewRabbitMQErrorWithCause("failed to close connection", err))
		}
	}

	if len(errs) > 0 {
		return errs[0] // Return first error
	}

	return nil
}

// DeclareQueues declares all required queues
func (r *RabbitMQService) DeclareQueues(ctx context.Context) error {
	if r.channel == nil {
		return errors.NewRabbitMQError("channel not initialized")
	}

	// Declare main email tasks queue
	_, err := r.channel.QueueDeclare(
		r.queueNames.EmailTasks, // name
		true,                    // durable
		false,                   // delete when unused
		false,                   // exclusive
		false,                   // no-wait
		nil,                     // arguments
	)
	if err != nil {
		return errors.NewRabbitMQErrorWithCause("failed to declare email tasks queue", err)
	}

	// Retry queue no longer needed - using single queue with retry delay

	// Declare failed queue
	_, err = r.channel.QueueDeclare(
		r.queueNames.EmailFailed, // name
		true,                     // durable
		false,                    // delete when unused
		false,                    // exclusive
		false,                    // no-wait
		nil,                      // arguments
	)
	if err != nil {
		return errors.NewRabbitMQErrorWithCause("failed to declare failed queue", err)
	}

	return nil
}

// ConsumeEmailJobs consumes email jobs from the main queue
func (r *RabbitMQService) ConsumeEmailJobs(ctx context.Context, handler func(*models.EmailJob)) error {
	if r.channel == nil {
		return errors.NewRabbitMQError("channel not initialized")
	}

	msgs, err := r.channel.Consume(
		r.queueNames.EmailTasks, // queue
		"",                      // consumer
		true,                    // auto-ack
		false,                   // exclusive
		false,                   // no-local
		false,                   // no-wait
		nil,                     // args
	)
	if err != nil {
		return errors.NewRabbitMQErrorWithCause("failed to register consumer", err)
	}

	go func() {
		for {
			select {
			case <-ctx.Done():
				return
			case msg := <-msgs:
				if len(msg.Body) == 0 {
					continue
				}

				// First unmarshal to get the content wrapper
				var messageWrapper struct {
					Content json.RawMessage `json:"content"`
				}
				if err := json.Unmarshal(msg.Body, &messageWrapper); err != nil {
					// Log error but continue processing
					continue
				}

				// Then unmarshal the actual EmailJob from content
				var emailJob models.EmailJob
				if err := json.Unmarshal(messageWrapper.Content, &emailJob); err != nil {
					// Log error but continue processing
					continue
				}

				// Validate job before processing
				if err := emailJob.Validate(); err != nil {
					// Log validation error but continue
					continue
				}

				handler(&emailJob)
			}
		}
	}()

	return nil
}

// PublishEmailJob publishes an email job to the specified queue
func (r *RabbitMQService) PublishEmailJob(ctx context.Context, queue string, job *models.EmailJob) error {
	if r.channel == nil {
		return errors.NewRabbitMQError("channel not initialized")
	}

	if err := job.Validate(); err != nil {
		return errors.NewValidationErrorWithCause("invalid job", err)
	}

	jobData, err := json.Marshal(job)
	if err != nil {
		return errors.NewRabbitMQErrorWithCause("failed to marshal job", err)
	}

	err = r.channel.PublishWithContext(
		ctx,
		"",    // exchange
		queue, // routing key
		false, // mandatory
		false, // immediate
		amqp.Publishing{
			ContentType:  "application/json",
			Body:         jobData,
			DeliveryMode: 2, // persistent
			Timestamp:    time.Now(),
		},
	)
	if err != nil {
		return errors.NewRabbitMQErrorWithCause("failed to publish job", err)
	}

	return nil
}

// Ping checks RabbitMQ connectivity
func (r *RabbitMQService) Ping(ctx context.Context) error {
	if r.conn == nil || r.conn.IsClosed() {
		return errors.NewRabbitMQError("connection is closed")
	}

	if r.channel == nil {
		return errors.NewRabbitMQError("channel is not initialized")
	}

	// Try to declare a temporary queue to test connectivity
	_, err := r.channel.QueueDeclare(
		"",    // name (auto-generated)
		false, // durable
		true,  // delete when unused
		true,  // exclusive
		false, // no-wait
		nil,   // arguments
	)
	if err != nil {
		return errors.NewRabbitMQErrorWithCause("RabbitMQ ping failed", err)
	}

	return nil
}

// GetQueueNames returns the queue names configuration
func (r *RabbitMQService) GetQueueNames() *QueueNames {
	return r.queueNames
}