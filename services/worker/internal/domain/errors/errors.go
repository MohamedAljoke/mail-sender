package errors

import (
	"fmt"
)

// DomainError represents a domain-specific error
type DomainError struct {
	Code    string `json:"code"`
	Message string `json:"message"`
	Cause   error  `json:"cause,omitempty"`
}

func (e *DomainError) Error() string {
	if e.Cause != nil {
		return fmt.Sprintf("%s: %s (caused by: %v)", e.Code, e.Message, e.Cause)
	}
	return fmt.Sprintf("%s: %s", e.Code, e.Message)
}

func (e *DomainError) Unwrap() error {
	return e.Cause
}

// Error type constants
const (
	// Validation errors
	ValidationErrorCode = "VALIDATION_ERROR"
	
	// Configuration errors
	ConfigErrorCode = "CONFIG_ERROR"
	
	// Infrastructure errors
	RedisErrorCode    = "REDIS_ERROR"
	RabbitMQErrorCode = "RABBITMQ_ERROR"
	SMTPErrorCode     = "SMTP_ERROR"
	
	// Business logic errors
	JobProcessingErrorCode = "JOB_PROCESSING_ERROR"
	RetryExceededErrorCode = "RETRY_EXCEEDED_ERROR"
	
	// System errors
	ShutdownErrorCode = "SHUTDOWN_ERROR"
	HealthCheckErrorCode = "HEALTH_CHECK_ERROR"
)

// Validation errors
func NewValidationError(message string) *DomainError {
	return &DomainError{
		Code:    ValidationErrorCode,
		Message: message,
	}
}

func NewValidationErrorWithCause(message string, cause error) *DomainError {
	return &DomainError{
		Code:    ValidationErrorCode,
		Message: message,
		Cause:   cause,
	}
}

// Configuration errors
func NewConfigError(message string) *DomainError {
	return &DomainError{
		Code:    ConfigErrorCode,
		Message: message,
	}
}

func NewConfigErrorWithCause(message string, cause error) *DomainError {
	return &DomainError{
		Code:    ConfigErrorCode,
		Message: message,
		Cause:   cause,
	}
}

// Infrastructure errors
func NewRedisError(message string) *DomainError {
	return &DomainError{
		Code:    RedisErrorCode,
		Message: message,
	}
}

func NewRedisErrorWithCause(message string, cause error) *DomainError {
	return &DomainError{
		Code:    RedisErrorCode,
		Message: message,
		Cause:   cause,
	}
}

func NewRabbitMQError(message string) *DomainError {
	return &DomainError{
		Code:    RabbitMQErrorCode,
		Message: message,
	}
}

func NewRabbitMQErrorWithCause(message string, cause error) *DomainError {
	return &DomainError{
		Code:    RabbitMQErrorCode,
		Message: message,
		Cause:   cause,
	}
}

func NewSMTPError(message string) *DomainError {
	return &DomainError{
		Code:    SMTPErrorCode,
		Message: message,
	}
}

func NewSMTPErrorWithCause(message string, cause error) *DomainError {
	return &DomainError{
		Code:    SMTPErrorCode,
		Message: message,
		Cause:   cause,
	}
}

// Business logic errors
func NewJobProcessingError(message string) *DomainError {
	return &DomainError{
		Code:    JobProcessingErrorCode,
		Message: message,
	}
}

func NewJobProcessingErrorWithCause(message string, cause error) *DomainError {
	return &DomainError{
		Code:    JobProcessingErrorCode,
		Message: message,
		Cause:   cause,
	}
}

func NewRetryExceededError(jobID string, maxRetries int) *DomainError {
	return &DomainError{
		Code:    RetryExceededErrorCode,
		Message: fmt.Sprintf("job %s exceeded max retries (%d)", jobID, maxRetries),
	}
}

// System errors
func NewShutdownError(message string) *DomainError {
	return &DomainError{
		Code:    ShutdownErrorCode,
		Message: message,
	}
}

func NewShutdownErrorWithCause(message string, cause error) *DomainError {
	return &DomainError{
		Code:    ShutdownErrorCode,
		Message: message,
		Cause:   cause,
	}
}

func NewHealthCheckError(message string) *DomainError {
	return &DomainError{
		Code:    HealthCheckErrorCode,
		Message: message,
	}
}

func NewHealthCheckErrorWithCause(message string, cause error) *DomainError {
	return &DomainError{
		Code:    HealthCheckErrorCode,
		Message: message,
		Cause:   cause,
	}
}

// Helper functions for error checking
func IsDomainError(err error) bool {
	_, ok := err.(*DomainError)
	return ok
}

func IsValidationError(err error) bool {
	if domainErr, ok := err.(*DomainError); ok {
		return domainErr.Code == ValidationErrorCode
	}
	return false
}

func IsConfigError(err error) bool {
	if domainErr, ok := err.(*DomainError); ok {
		return domainErr.Code == ConfigErrorCode
	}
	return false
}

func IsInfrastructureError(err error) bool {
	if domainErr, ok := err.(*DomainError); ok {
		return domainErr.Code == RedisErrorCode || 
			   domainErr.Code == RabbitMQErrorCode || 
			   domainErr.Code == SMTPErrorCode
	}
	return false
}

func IsRetryableError(err error) bool {
	if domainErr, ok := err.(*DomainError); ok {
		return domainErr.Code == RedisErrorCode || 
			   domainErr.Code == RabbitMQErrorCode || 
			   domainErr.Code == SMTPErrorCode ||
			   domainErr.Code == JobProcessingErrorCode
	}
	return false
}