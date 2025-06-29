package cache

import (
	"context"
	"time"

	"task-scheduler-worker/internal/domain/models"
)

// CacheService defines the interface for cache operations
type CacheService interface {
	// Job operations
	StoreJob(ctx context.Context, job *models.EmailJob, ttl time.Duration) error
	GetJob(ctx context.Context, jobID string) (*models.EmailJob, error)
	UpdateJobStatus(ctx context.Context, jobID string, status models.JobStatus, errorMsg string, retryCount int) error
	DeleteJob(ctx context.Context, jobID string) error

	// Pub/Sub operations
	PublishJobStatusUpdate(ctx context.Context, update *JobStatusUpdate) error
	SubscribeToJobStatusUpdates(ctx context.Context, handler func(*JobStatusUpdate)) error

	// Health check
	Ping(ctx context.Context) error
	
	// Connection management
	Close() error
}

// JobStatusUpdate represents a job status update for pub/sub
type JobStatusUpdate struct {
	JobID     string                    `json:"job_id"`
	Status    models.JobStatus          `json:"status"`
	Timestamp time.Time                 `json:"timestamp"`
	History   []models.JobHistoryEntry  `json:"history"`
	To        string                    `json:"to"`
	Subject   string                    `json:"subject"`
	UpdatedAt time.Time                 `json:"updated_at"`
	LastError string                    `json:"last_error,omitempty"`
	RetryCount int                      `json:"retry_count,omitempty"`
}