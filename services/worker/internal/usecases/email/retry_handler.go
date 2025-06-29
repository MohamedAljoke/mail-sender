package email

import (
	"context"
	"fmt"
	"log"
	"time"

	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/codes"
	"go.opentelemetry.io/otel/trace"

	"task-scheduler-worker/internal/config"
	"task-scheduler-worker/internal/domain/errors"
	"task-scheduler-worker/internal/domain/models"
	"task-scheduler-worker/internal/infrastructure/cache"
	"task-scheduler-worker/internal/infrastructure/messaging"
)

// RetryHandlerUseCaseImpl implements RetryHandlerUseCase
type RetryHandlerUseCaseImpl struct {
	cacheService     cache.CacheService
	messagingService messaging.MessageBroker
	config           *config.Config
	tracer           trace.Tracer
}

// NewRetryHandlerUseCase creates a new retry handler use case
func NewRetryHandlerUseCase(
	cacheService cache.CacheService,
	messagingService messaging.MessageBroker,
	config *config.Config,
	tracer trace.Tracer,
) *RetryHandlerUseCaseImpl {
	return &RetryHandlerUseCaseImpl{
		cacheService:     cacheService,
		messagingService: messagingService,
		config:           config,
		tracer:           tracer,
	}
}

// HandleRetry handles job retry logic
func (rh *RetryHandlerUseCaseImpl) HandleRetry(ctx context.Context, job *models.EmailJob, err error) error {
	ctx, span := rh.tracer.Start(ctx, "handle_job_retry")
	defer span.End()

	span.SetAttributes(
		attribute.String("email.job_id", job.JobID),
		attribute.Int("email.retry_count", job.RetryCount),
		attribute.Int("email.max_retries", job.MaxRetries),
		attribute.String("error.message", err.Error()),
	)

	// Check if we should retry
	if !rh.ShouldRetry(job, err) {
		return rh.handleMaxRetriesExceeded(ctx, job, err)
	}

	// Increment retry count
	job.IncrementRetry(err.Error())

	// Update job status in cache
	if statusErr := rh.cacheService.UpdateJobStatus(ctx, job.JobID, models.JobStatusRetrying, err.Error(), job.RetryCount); statusErr != nil {
		log.Printf("Error updating job status for retry: %v", statusErr)
		span.RecordError(statusErr)
	}

	// Calculate retry delay (exponential backoff)
	retryDelaySeconds := time.Duration(job.RetryCount*job.RetryCount) * time.Second
	if retryDelaySeconds > 30*time.Second {
		retryDelaySeconds = 30 * time.Second // Cap at 30 seconds
	}

	log.Printf("Job %s will retry in %v (attempt %d/%d)", job.JobID, retryDelaySeconds, job.RetryCount, job.MaxRetries)

	// Add retry delay before republishing
	go func() {
		time.Sleep(retryDelaySeconds)

		// Publish back to main email queue
		queueNames := &messaging.QueueNames{
			EmailTasks:  "email_tasks",
			EmailRetry:  "email_tasks_retry",
			EmailFailed: "email_tasks_failed",
		}

		retryErr := rh.messagingService.PublishEmailJob(context.Background(), queueNames.EmailTasks, job)
		if retryErr != nil {
			log.Printf("Failed to requeue job %s for retry: %v", job.JobID, retryErr)
			// Mark job as failed if we can't requeue it
			if statusErr := rh.cacheService.UpdateJobStatus(context.Background(), job.JobID, models.JobStatusFailed, fmt.Sprintf("Failed to requeue: %v", retryErr), job.RetryCount); statusErr != nil {
				log.Printf("Error updating job status to failed after requeue failure: %v", statusErr)
			}
		} else {
			log.Printf("Job %s requeued for retry %d/%d", job.JobID, job.RetryCount, job.MaxRetries)
		}
	}()

	span.SetAttributes(
		attribute.String("email.status", "requeued"),
		attribute.String("queue.name", "email_tasks"),
		attribute.String("retry.delay", retryDelaySeconds.String()),
	)
	span.SetStatus(codes.Ok, "Job scheduled for retry")

	return nil
}

// ShouldRetry determines if a job should be retried based on the error and job state
func (rh *RetryHandlerUseCaseImpl) ShouldRetry(job *models.EmailJob, err error) bool {
	// Don't retry if max retries exceeded
	if job.RetryCount >= job.MaxRetries {
		return false
	}

	// Don't retry if job is in terminal state
	if job.Status.IsTerminal() {
		return false
	}

	// Don't retry validation errors
	if errors.IsValidationError(err) {
		return false
	}

	// Don't retry config errors
	if errors.IsConfigError(err) {
		return false
	}

	// Retry infrastructure errors (Redis, RabbitMQ, SMTP)
	if errors.IsRetryableError(err) {
		return true
	}

	// Default: retry for unknown errors
	return true
}

// handleMaxRetriesExceeded handles jobs that have exceeded max retries
func (rh *RetryHandlerUseCaseImpl) handleMaxRetriesExceeded(ctx context.Context, job *models.EmailJob, originalErr error) error {
	ctx, span := rh.tracer.Start(ctx, "handle_max_retries_exceeded")
	defer span.End()

	span.SetAttributes(
		attribute.String("email.job_id", job.JobID),
		attribute.Int("email.retry_count", job.RetryCount),
		attribute.Int("email.max_retries", job.MaxRetries),
	)

	log.Printf("Job %s exceeded max retries (%d), sending to failed queue", job.JobID, job.MaxRetries)

	// Create final error message
	finalError := fmt.Sprintf("Failed after %d retries: %s", job.RetryCount, originalErr.Error())

	// Update job status to failed
	job.UpdateStatus(models.JobStatusFailed, "Max retries exceeded", finalError)

	// Update in cache
	if err := rh.cacheService.UpdateJobStatus(ctx, job.JobID, models.JobStatusFailed, finalError, job.RetryCount); err != nil {
		log.Printf("Error updating job status to failed: %v", err)
		span.RecordError(err)
	}

	// Send to failed queue
	queueNames := &messaging.QueueNames{
		EmailTasks:  "email_tasks",
		EmailRetry:  "email_tasks_retry",
		EmailFailed: "email_tasks_failed",
	}

	if err := rh.messagingService.PublishEmailJob(ctx, queueNames.EmailFailed, job); err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, "Failed to send job to failed queue")
		return errors.NewJobProcessingErrorWithCause("failed to send job to failed queue", err)
	}

	span.SetAttributes(
		attribute.String("email.status", "failed"),
		attribute.String("queue.name", queueNames.EmailFailed),
	)
	span.SetStatus(codes.Ok, "Job sent to failed queue")

	return errors.NewRetryExceededError(job.JobID, job.MaxRetries)
}