package worker

import (
	"context"

	"task-scheduler-worker/internal/domain/models"
)

// WorkerService orchestrates email job processing
type WorkerService struct {
	container *Container
	isRunning bool
}

// NewWorkerService creates a new worker service
func NewWorkerService(container *Container) *WorkerService {
	return &WorkerService{
		container: container,
		isRunning: false,
	}
}

// Start starts the worker service
func (w *WorkerService) Start(ctx context.Context) error {
	w.isRunning = true
	w.container.HealthHandler.SetRunning(true)

	w.container.Logger.Info("Starting email job consumer...")

	// Start consuming jobs from RabbitMQ
	err := w.container.MessagingService.ConsumeEmailJobs(ctx, w.handleEmailJob)
	if err != nil {
		return err
	}

	w.container.Logger.Info("Email worker ready to process jobs")
	return nil
}

// Stop stops the worker service
func (w *WorkerService) Stop() {
	w.isRunning = false
	w.container.HealthHandler.SetRunning(false)
	w.container.Logger.Info("Worker service stopped")
}

// IsRunning returns whether the worker is currently running
func (w *WorkerService) IsRunning() bool {
	return w.isRunning
}

// handleEmailJob processes an individual email job
func (w *WorkerService) handleEmailJob(job *models.EmailJob) {
	ctx := context.Background()
	
	logger := w.container.Logger.WithJobID(job.JobID)
	
	logger.LogJobStart(ctx, job.JobID, job.To, job.Subject, job.RetryCount, job.MaxRetries)

	if !w.isRunning {
		logger.Warn("Worker not running, skipping job")
		return
	}

	// Process the email job
	err := w.container.EmailProcessorUseCase.ProcessEmailJob(ctx, job)
	if err != nil {
		logger.LogJobFailed(ctx, job.JobID, err, job.RetryCount)
		
		// Handle retry logic
		if retryErr := w.container.RetryHandlerUseCase.HandleRetry(ctx, job, err); retryErr != nil {
			logger.Error("Failed to handle job retry", "error", retryErr)
		}
		return
	}

	// Job completed successfully
	logger.LogJobCompleted(ctx, job.JobID)
	w.container.HealthHandler.IncrementJobsProcessed()
}