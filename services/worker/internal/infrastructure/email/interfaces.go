package email

import (
	"context"

	"task-scheduler-worker/internal/domain/models"
)

// EmailService defines the interface for email sending operations
type EmailService interface {
	// Send an email
	SendEmail(ctx context.Context, job *models.EmailJob) error
	
	// Health check
	Ping(ctx context.Context) error
	
	// Configuration validation
	ValidateConfig() error
}

// EmailConfig holds email service configuration
type EmailConfig struct {
	SMTPHost string
	SMTPPort string
	From     string
}