package cache

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"

	"task-scheduler-worker/internal/domain/errors"
	"task-scheduler-worker/internal/domain/models"
)

// RedisService implements CacheService using Redis
type RedisService struct {
	client *redis.Client
}

// NewRedisService creates a new Redis cache service
func NewRedisService(redisURL string) (*RedisService, error) {
	opt, err := redis.ParseURL(redisURL)
	if err != nil {
		return nil, errors.NewRedisErrorWithCause("failed to parse Redis URL", err)
	}

	client := redis.NewClient(opt)
	
	return &RedisService{
		client: client,
	}, nil
}

// StoreJob stores a job in Redis with TTL
func (r *RedisService) StoreJob(ctx context.Context, job *models.EmailJob, ttl time.Duration) error {
	if err := job.Validate(); err != nil {
		return errors.NewValidationErrorWithCause("invalid job", err)
	}

	jobData, err := json.Marshal(job)
	if err != nil {
		return errors.NewRedisErrorWithCause("failed to marshal job", err)
	}

	key := fmt.Sprintf("job:%s", job.JobID)
	err = r.client.SetEx(ctx, key, string(jobData), ttl).Err()
	if err != nil {
		return errors.NewRedisErrorWithCause("failed to store job", err)
	}

	return nil
}

// GetJob retrieves a job from Redis
func (r *RedisService) GetJob(ctx context.Context, jobID string) (*models.EmailJob, error) {
	if jobID == "" {
		return nil, errors.NewValidationError("job ID is required")
	}

	key := fmt.Sprintf("job:%s", jobID)
	jobData, err := r.client.Get(ctx, key).Result()
	if err != nil {
		if err == redis.Nil {
			return nil, errors.NewRedisError(fmt.Sprintf("job %s not found", jobID))
		}
		return nil, errors.NewRedisErrorWithCause("failed to get job", err)
	}

	var job models.EmailJob
	if err := json.Unmarshal([]byte(jobData), &job); err != nil {
		return nil, errors.NewRedisErrorWithCause("failed to unmarshal job", err)
	}

	return &job, nil
}

// UpdateJobStatus updates the job status and publishes to pub/sub
func (r *RedisService) UpdateJobStatus(ctx context.Context, jobID string, status models.JobStatus, errorMsg string, retryCount int) error {
	if jobID == "" {
		return errors.NewValidationError("job ID is required")
	}

	if !status.IsValid() {
		return errors.NewValidationError("invalid status")
	}

	// Get existing job
	job, err := r.GetJob(ctx, jobID)
	if err != nil {
		return err
	}

	// Update job status
	job.UpdateStatus(status, "", errorMsg)
	if retryCount > 0 {
		job.RetryCount = retryCount
	}

	// Store updated job
	jobData, err := json.Marshal(job)
	if err != nil {
		return errors.NewRedisErrorWithCause("failed to marshal updated job", err)
	}

	key := fmt.Sprintf("job:%s", jobID)
	err = r.client.SetEx(ctx, key, string(jobData), 24*time.Hour).Err()
	if err != nil {
		return errors.NewRedisErrorWithCause("failed to update job", err)
	}

	// Publish status update
	statusUpdate := &JobStatusUpdate{
		JobID:      jobID,
		Status:     status,
		Timestamp:  time.Now(),
		History:    job.History,
		To:         job.To,
		Subject:    job.Subject,
		UpdatedAt:  job.UpdatedAt,
		LastError:  errorMsg,
		RetryCount: job.RetryCount,
	}

	return r.PublishJobStatusUpdate(ctx, statusUpdate)
}

// DeleteJob removes a job from Redis
func (r *RedisService) DeleteJob(ctx context.Context, jobID string) error {
	if jobID == "" {
		return errors.NewValidationError("job ID is required")
	}

	key := fmt.Sprintf("job:%s", jobID)
	err := r.client.Del(ctx, key).Err()
	if err != nil {
		return errors.NewRedisErrorWithCause("failed to delete job", err)
	}

	return nil
}

// PublishJobStatusUpdate publishes a job status update to Redis pub/sub
func (r *RedisService) PublishJobStatusUpdate(ctx context.Context, update *JobStatusUpdate) error {
	updateData, err := json.Marshal(update)
	if err != nil {
		return errors.NewRedisErrorWithCause("failed to marshal status update", err)
	}

	err = r.client.Publish(ctx, "job_status_updates", string(updateData)).Err()
	if err != nil {
		return errors.NewRedisErrorWithCause("failed to publish status update", err)
	}

	return nil
}

// SubscribeToJobStatusUpdates subscribes to job status updates
func (r *RedisService) SubscribeToJobStatusUpdates(ctx context.Context, handler func(*JobStatusUpdate)) error {
	pubsub := r.client.Subscribe(ctx, "job_status_updates")
	defer pubsub.Close()

	ch := pubsub.Channel()

	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case msg := <-ch:
			var update JobStatusUpdate
			if err := json.Unmarshal([]byte(msg.Payload), &update); err != nil {
				// Log error but continue processing
				continue
			}
			handler(&update)
		}
	}
}

// Ping checks Redis connectivity
func (r *RedisService) Ping(ctx context.Context) error {
	_, err := r.client.Ping(ctx).Result()
	if err != nil {
		return errors.NewRedisErrorWithCause("Redis ping failed", err)
	}
	return nil
}

// Close closes the Redis connection
func (r *RedisService) Close() error {
	err := r.client.Close()
	if err != nil {
		return errors.NewRedisErrorWithCause("failed to close Redis connection", err)
	}
	return nil
}