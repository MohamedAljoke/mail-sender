package email

import (
	"context"
	"fmt"
	"net"
	"net/smtp"
	"strconv"
	"strings"
	"time"

	"task-scheduler-worker/internal/domain/errors"
	"task-scheduler-worker/internal/domain/models"
)

// SMTPService implements EmailService using SMTP
type SMTPService struct {
	config *EmailConfig
}

// NewSMTPService creates a new SMTP email service
func NewSMTPService(config *EmailConfig) *SMTPService {
	return &SMTPService{
		config: config,
	}
}

// SendEmail sends an email using SMTP
func (s *SMTPService) SendEmail(ctx context.Context, job *models.EmailJob) error {
	if err := job.Validate(); err != nil {
		return errors.NewValidationErrorWithCause("invalid job", err)
	}

	if err := s.ValidateConfig(); err != nil {
		return err
	}

	// Error simulation for testing
	if err := s.simulateErrorForTestingEmails(job); err != nil {
		return err
	}

	// Create message
	message := s.formatMessage(job)

	// Connect to SMTP server
	addr := fmt.Sprintf("%s:%s", s.config.SMTPHost, s.config.SMTPPort)

	// Create context with timeout for SMTP operation
	smtpCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()

	// Send email with context
	err := s.sendWithContext(smtpCtx, addr, s.config.From, []string{job.To}, []byte(message))
	if err != nil {
		return errors.NewSMTPErrorWithCause("failed to send email", err)
	}

	return nil
}

// sendWithContext sends email with context support
func (s *SMTPService) sendWithContext(ctx context.Context, addr, from string, to []string, msg []byte) error {
	// Connect with timeout
	conn, err := net.DialTimeout("tcp", addr, 10*time.Second)
	if err != nil {
		return fmt.Errorf("failed to connect to SMTP server: %w", err)
	}
	defer conn.Close()

	// Create SMTP client
	client, err := smtp.NewClient(conn, s.config.SMTPHost)
	if err != nil {
		return fmt.Errorf("failed to create SMTP client: %w", err)
	}
	defer client.Quit()

	// Check if context is cancelled
	select {
	case <-ctx.Done():
		return ctx.Err()
	default:
	}

	// Set sender
	if err := client.Mail(from); err != nil {
		return fmt.Errorf("failed to set sender: %w", err)
	}

	// Set recipients
	for _, recipient := range to {
		if err := client.Rcpt(recipient); err != nil {
			return fmt.Errorf("failed to set recipient %s: %w", recipient, err)
		}
	}

	// Check if context is cancelled
	select {
	case <-ctx.Done():
		return ctx.Err()
	default:
	}

	// Send message
	writer, err := client.Data()
	if err != nil {
		return fmt.Errorf("failed to get data writer: %w", err)
	}
	defer writer.Close()

	_, err = writer.Write(msg)
	if err != nil {
		return fmt.Errorf("failed to write message: %w", err)
	}

	return nil
}

// formatMessage formats the email message
func (s *SMTPService) formatMessage(job *models.EmailJob) string {
	return fmt.Sprintf("From: %s\r\n"+
		"To: %s\r\n"+
		"Subject: %s\r\n"+
		"Date: %s\r\n"+
		"MIME-Version: 1.0\r\n"+
		"Content-Type: text/plain; charset=UTF-8\r\n"+
		"\r\n"+
		"%s\r\n",
		s.config.From,
		job.To,
		job.Subject,
		time.Now().Format(time.RFC1123Z),
		job.Body,
	)
}

// Ping checks SMTP server connectivity
func (s *SMTPService) Ping(ctx context.Context) error {
	if err := s.ValidateConfig(); err != nil {
		return err
	}

	addr := fmt.Sprintf("%s:%s", s.config.SMTPHost, s.config.SMTPPort)

	// Try to connect with timeout
	pingCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	conn, err := net.DialTimeout("tcp", addr, 5*time.Second)
	if err != nil {
		return errors.NewSMTPErrorWithCause("SMTP server unreachable", err)
	}
	defer conn.Close()

	// Check if context was cancelled
	select {
	case <-pingCtx.Done():
		return errors.NewSMTPErrorWithCause("SMTP ping timeout", pingCtx.Err())
	default:
	}

	// Try to create SMTP client to verify server response
	client, err := smtp.NewClient(conn, s.config.SMTPHost)
	if err != nil {
		return errors.NewSMTPErrorWithCause("SMTP server not responding properly", err)
	}
	defer client.Quit()

	return nil
}

// ValidateConfig validates the email service configuration
func (s *SMTPService) ValidateConfig() error {
	if s.config == nil {
		return errors.NewConfigError("email config is nil")
	}

	if s.config.SMTPHost == "" {
		return errors.NewConfigError("SMTP host is required")
	}

	if s.config.SMTPPort == "" {
		return errors.NewConfigError("SMTP port is required")
	}

	// Validate port is numeric
	if _, err := strconv.Atoi(s.config.SMTPPort); err != nil {
		return errors.NewConfigError("SMTP port must be numeric")
	}

	if s.config.From == "" {
		return errors.NewConfigError("from address is required")
	}

	return nil
}

// GetConfig returns the email configuration
func (s *SMTPService) GetConfig() *EmailConfig {
	return s.config
}

// simulateErrorForTestingEmails simulates errors for specific test email addresses
func (s *SMTPService) simulateErrorForTestingEmails(job *models.EmailJob) error {
	// Simulate error for error-1@email.com only on first attempt (retry_count == 0)
	// This will fail the first time, then succeed on retry
	if strings.Contains(job.To, "error-1@email.com") && job.RetryCount == 0 {
		return errors.NewSMTPErrorWithCause("simulated error for error-1@email.com on first attempt",
			fmt.Errorf("test error simulation: first attempt failure"))
	}

	// Simulate error for error@email.com on all attempts (persistent failure)
	if strings.Contains(job.To, "error@email.com") {
		return errors.NewSMTPErrorWithCause("simulated error for error@email.com",
			fmt.Errorf("test error simulation: persistent failure"))
	}

	return nil
}
