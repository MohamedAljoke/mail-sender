package models

import (
	"encoding/json"
	"time"
)

// EmailJob represents an email processing job
type EmailJob struct {
	JobID       string            `json:"job_id"`
	To          string            `json:"to"`
	Subject     string            `json:"subject"`
	Body        string            `json:"body"`
	CreatedAt   time.Time         `json:"-"`
	CreatedAtStr string           `json:"created_at"`
	UpdatedAt   time.Time         `json:"updated_at"`
	Status      JobStatus         `json:"status"`
	RetryCount  int               `json:"retry_count"`
	MaxRetries  int               `json:"max_retries"`
	LastError   string            `json:"last_error,omitempty"`
	History     []JobHistoryEntry `json:"history"`
	Metadata    map[string]string `json:"metadata,omitempty"`
}

// JobStatus represents the status of a job
type JobStatus string

const (
	JobStatusPending    JobStatus = "pending"
	JobStatusProcessing JobStatus = "processing"
	JobStatusCompleted  JobStatus = "completed"
	JobStatusFailed     JobStatus = "failed"
	JobStatusRetrying   JobStatus = "retrying"
)

// JobHistoryEntry represents a single entry in job history
type JobHistoryEntry struct {
	Status    JobStatus `json:"status"`
	Timestamp time.Time `json:"timestamp"`
	Error     string    `json:"error,omitempty"`
	Message   string    `json:"message,omitempty"`
}

// IsTerminal returns true if the job status is terminal (completed or failed)
func (s JobStatus) IsTerminal() bool {
	return s == JobStatusCompleted || s == JobStatusFailed
}

// IsValid returns true if the job status is valid
func (s JobStatus) IsValid() bool {
	switch s {
	case JobStatusPending, JobStatusProcessing, JobStatusCompleted, JobStatusFailed, JobStatusRetrying:
		return true
	default:
		return false
	}
}

// NewEmailJob creates a new email job with default values
func NewEmailJob(jobID, to, subject, body string, maxRetries int) *EmailJob {
	now := time.Now()
	return &EmailJob{
		JobID:      jobID,
		To:         to,
		Subject:    subject,
		Body:       body,
		CreatedAt:  now,
		UpdatedAt:  now,
		Status:     JobStatusPending,
		RetryCount: 0,
		MaxRetries: maxRetries,
		History:    []JobHistoryEntry{},
		Metadata:   make(map[string]string),
	}
}

// AddHistoryEntry adds a new entry to the job history
func (j *EmailJob) AddHistoryEntry(status JobStatus, message, errorMsg string) {
	entry := JobHistoryEntry{
		Status:    status,
		Timestamp: time.Now(),
		Message:   message,
		Error:     errorMsg,
	}
	j.History = append(j.History, entry)
	j.UpdatedAt = entry.Timestamp
}

// UpdateStatus updates the job status and adds a history entry
func (j *EmailJob) UpdateStatus(status JobStatus, message, errorMsg string) {
	j.Status = status
	j.LastError = errorMsg
	j.AddHistoryEntry(status, message, errorMsg)
}

// IncrementRetry increments the retry count and updates the status
func (j *EmailJob) IncrementRetry(errorMsg string) {
	j.RetryCount++
	j.LastError = errorMsg
	j.UpdateStatus(JobStatusRetrying, "Job requeued for retry", errorMsg)
}

// ShouldRetry returns true if the job should be retried
func (j *EmailJob) ShouldRetry() bool {
	return j.RetryCount < j.MaxRetries && !j.Status.IsTerminal()
}

// CanProcess returns true if the job can be processed
func (j *EmailJob) CanProcess() bool {
	return j.Status == JobStatusPending || j.Status == JobStatusRetrying
}

// Validate validates the email job
func (j *EmailJob) Validate() error {
	if j.JobID == "" {
		return &ValidationError{Message: "job_id is required"}
	}
	if j.To == "" {
		return &ValidationError{Message: "to is required"}
	}
	if j.Subject == "" {
		return &ValidationError{Message: "subject is required"}
	}
	if j.Body == "" {
		return &ValidationError{Message: "body is required"}
	}
	if j.MaxRetries < 0 {
		return &ValidationError{Message: "max_retries must be >= 0"}
	}
	if !j.Status.IsValid() {
		return &ValidationError{Message: "invalid status"}
	}
	return nil
}

// ValidationError represents a validation error
type ValidationError struct {
	Message string
}

func (e *ValidationError) Error() string {
	return e.Message
}

// UnmarshalJSON custom unmarshaling to handle string timestamps from API
func (j *EmailJob) UnmarshalJSON(data []byte) error {
	type Alias EmailJob
	aux := &struct {
		*Alias
	}{
		Alias: (*Alias)(j),
	}
	
	if err := json.Unmarshal(data, &aux); err != nil {
		return err
	}
	
	// Convert string timestamp to time.Time
	if j.CreatedAtStr != "" {
		if t, err := time.Parse(time.RFC3339, j.CreatedAtStr); err == nil {
			j.CreatedAt = t
		}
	}
	
	// Set default values if not provided
	if j.UpdatedAt.IsZero() {
		j.UpdatedAt = j.CreatedAt
	}
	
	return nil
}