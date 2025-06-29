package email

import (
	"context"
	"log"
	"time"

	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/codes"
	"go.opentelemetry.io/otel/trace"

	"task-scheduler-worker/internal/config"
	"task-scheduler-worker/internal/domain/errors"
	"task-scheduler-worker/internal/domain/models"
	"task-scheduler-worker/internal/infrastructure/cache"
	"task-scheduler-worker/internal/infrastructure/email"
)

// ProcessEmailUseCaseImpl implements EmailProcessorUseCase
type ProcessEmailUseCaseImpl struct {
	cacheService cache.CacheService
	emailService email.EmailService
	config       *config.Config
	tracer       trace.Tracer
}

// NewProcessEmailUseCase creates a new email processing use case
func NewProcessEmailUseCase(
	cacheService cache.CacheService,
	emailService email.EmailService,
	config *config.Config,
	tracer trace.Tracer,
) *ProcessEmailUseCaseImpl {
	return &ProcessEmailUseCaseImpl{
		cacheService: cacheService,
		emailService: emailService,
		config:       config,
		tracer:       tracer,
	}
}

// ProcessEmailJob processes an email job with full tracing and error handling
func (uc *ProcessEmailUseCaseImpl) ProcessEmailJob(ctx context.Context, job *models.EmailJob) error {
	// Create span for job processing
	ctx, span := uc.tracer.Start(ctx, "process_email_job")
	defer span.End()

	span.SetAttributes(
		attribute.String("email.job_id", job.JobID),
		attribute.String("email.to", job.To),
		attribute.String("email.subject", job.Subject),
		attribute.Int("email.retry_count", job.RetryCount),
		attribute.Int("email.max_retries", job.MaxRetries),
		attribute.Int("email.body_length", len(job.Body)),
	)

	log.Printf("Processing email job: %s (retry %d/%d)", job.JobID, job.RetryCount, job.MaxRetries)
	log.Printf("To: %s, Subject: %s", job.To, job.Subject)

	// Validate job can be processed
	if !job.CanProcess() {
		err := errors.NewJobProcessingError("job cannot be processed in current state")
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())
		return err
	}

	// Update status to processing
	if err := uc.updateJobStatus(ctx, job.JobID, models.JobStatusProcessing, ""); err != nil {
		log.Printf("Error updating job status to processing: %v", err)
		span.RecordError(err)
		// Continue processing even if status update fails
	}

	// Add processing delay to make status transitions visible
	if uc.config.ProcessingDelay > 0 {
		log.Printf("Simulating email processing delay for job: %s", job.JobID)
		time.Sleep(uc.config.ProcessingDelay)
	}

	// Send email with tracing
	if err := uc.sendEmailWithTracing(ctx, job); err != nil {
		log.Printf("Error sending email for job %s: %v", job.JobID, err)
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())
		
		// Update job status to failed (retry logic handled by caller)
		if statusErr := uc.updateJobStatus(ctx, job.JobID, models.JobStatusFailed, err.Error()); statusErr != nil {
			log.Printf("Error updating job status to failed: %v", statusErr)
		}
		
		return err
	}

	// Add completion delay
	if uc.config.CompletionDelay > 0 {
		log.Printf("Email sent successfully, finalizing job: %s", job.JobID)
		time.Sleep(uc.config.CompletionDelay)
	}

	// Update status to completed
	if err := uc.updateJobStatus(ctx, job.JobID, models.JobStatusCompleted, ""); err != nil {
		log.Printf("Error updating job status to completed: %v", err)
		span.RecordError(err)
		// Don't fail the job if status update fails after successful send
	} else {
		span.SetAttributes(attribute.String("email.status", "completed"))
		span.SetStatus(codes.Ok, "Email job completed successfully")
	}

	log.Printf("Email job completed successfully: %s", job.JobID)
	return nil
}

// sendEmailWithTracing sends email with distributed tracing
func (uc *ProcessEmailUseCaseImpl) sendEmailWithTracing(ctx context.Context, job *models.EmailJob) error {
	ctx, span := uc.tracer.Start(ctx, "smtp_send_email")
	defer span.End()

	span.SetAttributes(
		attribute.String("smtp.operation", "send"),
		attribute.String("email.to", job.To),
		attribute.String("email.subject", job.Subject),
		attribute.String("smtp.protocol", "smtp"),
	)

	err := uc.emailService.SendEmail(ctx, job)
	if err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())
		return err
	}

	span.SetStatus(codes.Ok, "Email sent successfully")
	return nil
}

// updateJobStatus updates job status with tracing
func (uc *ProcessEmailUseCaseImpl) updateJobStatus(ctx context.Context, jobID string, status models.JobStatus, errorMsg string) error {
	ctx, span := uc.tracer.Start(ctx, "update_job_status")
	defer span.End()

	span.SetAttributes(
		attribute.String("redis.operation", "update_status"),
		attribute.String("redis.key", "job:"+jobID),
		attribute.String("db.system", "redis"),
		attribute.String("job.status", string(status)),
	)

	err := uc.cacheService.UpdateJobStatus(ctx, jobID, status, errorMsg, 0)
	if err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())
		return err
	}

	span.SetStatus(codes.Ok, "Job status updated successfully")
	return nil
}