package messaging

import (
	"context"

	"task-scheduler-worker/internal/domain/models"
)

// MessageBroker defines the interface for message broker operations
type MessageBroker interface {
	// Connection management
	Connect(ctx context.Context) error
	Close() error
	
	// Queue management
	DeclareQueues(ctx context.Context) error
	
	// Message operations
	ConsumeEmailJobs(ctx context.Context, handler func(*models.EmailJob)) error
	PublishEmailJob(ctx context.Context, queue string, job *models.EmailJob) error
	
	// Health check
	Ping(ctx context.Context) error
}

// QueueNames defines the queue names used by the worker
type QueueNames struct {
	EmailTasks      string
	EmailRetry      string
	EmailFailed     string
}