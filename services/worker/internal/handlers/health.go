package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	"task-scheduler-worker/internal/domain/models"
	"task-scheduler-worker/internal/infrastructure/cache"
	"task-scheduler-worker/internal/infrastructure/email"
	"task-scheduler-worker/internal/infrastructure/messaging"
	"task-scheduler-worker/pkg/logger"
)

// HealthHandler handles health check requests
type HealthHandler struct {
	cacheService     cache.CacheService
	messagingService messaging.MessageBroker
	emailService     email.EmailService
	logger           *logger.Logger
	isRunning        bool
	jobsProcessed    int
}

// NewHealthHandler creates a new health check handler
func NewHealthHandler(
	cacheService cache.CacheService,
	messagingService messaging.MessageBroker,
	emailService email.EmailService,
	logger *logger.Logger,
) *HealthHandler {
	return &HealthHandler{
		cacheService:     cacheService,
		messagingService: messagingService,
		emailService:     emailService,
		logger:           logger,
		isRunning:        true,
		jobsProcessed:    0,
	}
}

// SetRunning updates the running status
func (h *HealthHandler) SetRunning(running bool) {
	h.isRunning = running
}

// IncrementJobsProcessed increments the jobs processed counter
func (h *HealthHandler) IncrementJobsProcessed() {
	h.jobsProcessed++
}

// GetJobsProcessed returns the number of jobs processed
func (h *HealthHandler) GetJobsProcessed() int {
	return h.jobsProcessed
}

// HealthCheck performs a comprehensive health check
func (h *HealthHandler) HealthCheck(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	
	response := models.NewHealthResponse("worker-go", h.isRunning, h.jobsProcessed)
	
	// Check Redis connectivity
	h.checkRedis(ctx, response)
	
	// Check RabbitMQ connectivity
	h.checkRabbitMQ(ctx, response)
	
	// Check SMTP connectivity
	h.checkSMTP(ctx, response)
	
	// Set HTTP status based on overall health
	statusCode := http.StatusOK
	if response.Status == string(models.HealthStatusUnhealthy) {
		statusCode = http.StatusServiceUnavailable
	} else if response.Status == string(models.HealthStatusDegraded) {
		statusCode = http.StatusOK // 200 for degraded but operational
	}
	
	// Log health check result
	h.logger.WithComponent("health").Info("Health check completed",
		"status", response.Status,
		"dependencies", len(response.Dependencies),
	)
	
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	json.NewEncoder(w).Encode(response)
}

// ReadinessCheck performs a readiness check (simpler than health check)
func (h *HealthHandler) ReadinessCheck(w http.ResponseWriter, r *http.Request) {
	response := &models.HealthResponse{
		Status:    "ready",
		Service:   "worker-go",
		Timestamp: time.Now(),
	}
	
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// checkRedis checks Redis connectivity and latency
func (h *HealthHandler) checkRedis(ctx context.Context, response *models.HealthResponse) {
	start := time.Now()
	
	pingCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	
	err := h.cacheService.Ping(pingCtx)
	latency := time.Since(start)
	
	if err != nil {
		response.AddDependencyCheck("redis", models.HealthStatusUnhealthy, err.Error(), latency.String())
		h.logger.LogHealthCheck("redis", false, latency.String(), err)
	} else {
		response.AddDependencyCheck("redis", models.HealthStatusHealthy, "Connected", latency.String())
		h.logger.LogHealthCheck("redis", true, latency.String(), nil)
	}
}

// checkRabbitMQ checks RabbitMQ connectivity and latency
func (h *HealthHandler) checkRabbitMQ(ctx context.Context, response *models.HealthResponse) {
	start := time.Now()
	
	pingCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	
	err := h.messagingService.Ping(pingCtx)
	latency := time.Since(start)
	
	if err != nil {
		response.AddDependencyCheck("rabbitmq", models.HealthStatusUnhealthy, err.Error(), latency.String())
		h.logger.LogHealthCheck("rabbitmq", false, latency.String(), err)
	} else {
		response.AddDependencyCheck("rabbitmq", models.HealthStatusHealthy, "Connected", latency.String())
		h.logger.LogHealthCheck("rabbitmq", true, latency.String(), nil)
	}
}

// checkSMTP checks SMTP server connectivity and latency
func (h *HealthHandler) checkSMTP(ctx context.Context, response *models.HealthResponse) {
	start := time.Now()
	
	pingCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	
	err := h.emailService.Ping(pingCtx)
	latency := time.Since(start)
	
	if err != nil {
		// SMTP failure is less critical - mark as degraded instead of unhealthy
		response.AddDependencyCheck("smtp", models.HealthStatusDegraded, err.Error(), latency.String())
		h.logger.LogHealthCheck("smtp", false, latency.String(), err)
	} else {
		response.AddDependencyCheck("smtp", models.HealthStatusHealthy, "Connected", latency.String())
		h.logger.LogHealthCheck("smtp", true, latency.String(), nil)
	}
}