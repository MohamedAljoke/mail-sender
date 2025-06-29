package email

import (
	"context"

	"task-scheduler-worker/internal/domain/models"
)

// EmailProcessorUseCase defines the interface for email processing business logic
type EmailProcessorUseCase interface {
	ProcessEmailJob(ctx context.Context, job *models.EmailJob) error
}

// RetryHandlerUseCase defines the interface for retry handling business logic
type RetryHandlerUseCase interface {
	HandleRetry(ctx context.Context, job *models.EmailJob, err error) error
	ShouldRetry(job *models.EmailJob, err error) bool
}