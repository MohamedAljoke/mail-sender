package models

import "time"

// HealthResponse represents the health check response
type HealthResponse struct {
	Status        string                 `json:"status"`
	Service       string                 `json:"service"`
	IsRunning     bool                   `json:"isRunning"`
	JobsProcessed int                    `json:"jobsProcessed"`
	Timestamp     time.Time              `json:"timestamp"`
	Dependencies  map[string]HealthCheck `json:"dependencies,omitempty"`
}

// HealthCheck represents the health status of a dependency
type HealthCheck struct {
	Status    string    `json:"status"`
	Message   string    `json:"message,omitempty"`
	Timestamp time.Time `json:"timestamp"`
	Latency   string    `json:"latency,omitempty"`
}

// HealthStatus represents possible health status values
type HealthStatus string

const (
	HealthStatusHealthy   HealthStatus = "healthy"
	HealthStatusUnhealthy HealthStatus = "unhealthy"
	HealthStatusDegraded  HealthStatus = "degraded"
)

// NewHealthResponse creates a new health response
func NewHealthResponse(service string, isRunning bool, jobsProcessed int) *HealthResponse {
	return &HealthResponse{
		Status:        string(HealthStatusHealthy),
		Service:       service,
		IsRunning:     isRunning,
		JobsProcessed: jobsProcessed,
		Timestamp:     time.Now(),
		Dependencies:  make(map[string]HealthCheck),
	}
}

// AddDependencyCheck adds a dependency health check
func (h *HealthResponse) AddDependencyCheck(name string, status HealthStatus, message, latency string) {
	h.Dependencies[name] = HealthCheck{
		Status:    string(status),
		Message:   message,
		Timestamp: time.Now(),
		Latency:   latency,
	}
	
	// Update overall status based on dependencies
	h.updateOverallStatus()
}

// updateOverallStatus updates the overall health status based on dependencies
func (h *HealthResponse) updateOverallStatus() {
	if !h.IsRunning {
		h.Status = string(HealthStatusUnhealthy)
		return
	}

	hasUnhealthy := false
	hasDegraded := false

	for _, dep := range h.Dependencies {
		switch HealthStatus(dep.Status) {
		case HealthStatusUnhealthy:
			hasUnhealthy = true
		case HealthStatusDegraded:
			hasDegraded = true
		}
	}

	if hasUnhealthy {
		h.Status = string(HealthStatusUnhealthy)
	} else if hasDegraded {
		h.Status = string(HealthStatusDegraded)
	} else {
		h.Status = string(HealthStatusHealthy)
	}
}