package worker

import (
	"context"
	"fmt"
	"time"

	"task-scheduler-worker/internal/config"
	"task-scheduler-worker/internal/handlers"
	"task-scheduler-worker/internal/infrastructure/cache"
	"task-scheduler-worker/internal/infrastructure/email"
	"task-scheduler-worker/internal/infrastructure/messaging"
	"task-scheduler-worker/internal/infrastructure/tracing"
	emailUC "task-scheduler-worker/internal/usecases/email"
	"task-scheduler-worker/pkg/logger"
)

// Container holds all application dependencies
type Container struct {
	// Configuration
	Config *config.Config

	// Infrastructure services
	Logger           *logger.Logger
	TracingService   *tracing.TracingService
	CacheService     cache.CacheService
	MessagingService messaging.MessageBroker
	EmailService     email.EmailService

	// Use cases
	EmailProcessorUseCase emailUC.EmailProcessorUseCase
	RetryHandlerUseCase   emailUC.RetryHandlerUseCase

	// Handlers
	HealthHandler *handlers.HealthHandler
}

// NewContainer creates and initializes a new dependency container
func NewContainer() (*Container, error) {
	container := &Container{}

	// Load configuration
	if err := container.initConfig(); err != nil {
		return nil, fmt.Errorf("failed to initialize config: %w", err)
	}

	// Initialize logger
	if err := container.initLogger(); err != nil {
		return nil, fmt.Errorf("failed to initialize logger: %w", err)
	}

	// Initialize tracing
	if err := container.initTracing(); err != nil {
		return nil, fmt.Errorf("failed to initialize tracing: %w", err)
	}

	// Initialize infrastructure services
	if err := container.initInfrastructure(); err != nil {
		return nil, fmt.Errorf("failed to initialize infrastructure: %w", err)
	}

	// Initialize use cases
	if err := container.initUseCases(); err != nil {
		return nil, fmt.Errorf("failed to initialize use cases: %w", err)
	}

	// Initialize handlers
	if err := container.initHandlers(); err != nil {
		return nil, fmt.Errorf("failed to initialize handlers: %w", err)
	}

	return container, nil
}

// initConfig loads and validates configuration
func (c *Container) initConfig() error {
	config, err := config.Load()
	if err != nil {
		return err
	}
	c.Config = config
	return nil
}

// initLogger initializes structured logging
func (c *Container) initLogger() error {
	loggerConfig := &logger.Config{
		Level:  c.Config.LogLevel,
		Format: c.Config.LogFormat,
	}
	c.Logger = logger.NewLogger(loggerConfig)
	return nil
}

// initTracing initializes OpenTelemetry tracing
func (c *Container) initTracing() error {
	tracingService, err := tracing.NewTracingService(c.Config, c.Logger)
	if err != nil {
		return err
	}
	c.TracingService = tracingService
	return nil
}

// initInfrastructure initializes all infrastructure services
func (c *Container) initInfrastructure() error {
	// Initialize Redis cache service
	redisService, err := cache.NewRedisService(c.Config.RedisURL)
	if err != nil {
		return fmt.Errorf("failed to create Redis service: %w", err)
	}
	c.CacheService = redisService

	// Initialize RabbitMQ messaging service
	rabbitMQService := messaging.NewRabbitMQService(c.Config.RabbitMQURL)
	c.MessagingService = rabbitMQService

	// Initialize SMTP email service
	emailConfig := &email.EmailConfig{
		SMTPHost: c.Config.SMTPHost,
		SMTPPort: c.Config.SMTPPort,
		From:     "noreply@distributed-scheduler.com",
	}
	smtpService := email.NewSMTPService(emailConfig)
	c.EmailService = smtpService

	return nil
}

// initUseCases initializes business logic use cases
func (c *Container) initUseCases() error {
	tracer := c.TracingService.GetTracer()

	// Initialize email processing use case
	c.EmailProcessorUseCase = emailUC.NewProcessEmailUseCase(
		c.CacheService,
		c.EmailService,
		c.Config,
		tracer,
	)

	// Initialize retry handler use case
	c.RetryHandlerUseCase = emailUC.NewRetryHandlerUseCase(
		c.CacheService,
		c.MessagingService,
		c.Config,
		tracer,
	)

	return nil
}

// initHandlers initializes HTTP handlers
func (c *Container) initHandlers() error {
	// Initialize health check handler
	c.HealthHandler = handlers.NewHealthHandler(
		c.CacheService,
		c.MessagingService,
		c.EmailService,
		c.Logger,
	)

	return nil
}

// ConnectInfrastructure establishes connections to external services
func (c *Container) ConnectInfrastructure(ctx context.Context) error {
	c.Logger.Info("Connecting to infrastructure services...")

	// Connect to RabbitMQ with retries
	for {
		err := c.MessagingService.Connect(ctx)
		if err != nil {
			c.Logger.Error("Failed to connect to RabbitMQ, retrying in 5 seconds...", "error", err)
			select {
			case <-ctx.Done():
				return ctx.Err()
			case <-time.After(5 * time.Second):
				continue
			}
		}
		break
	}

	// Declare RabbitMQ queues
	if err := c.MessagingService.DeclareQueues(ctx); err != nil {
		return fmt.Errorf("failed to declare queues: %w", err)
	}

	// Test Redis connection
	if err := c.CacheService.Ping(ctx); err != nil {
		return fmt.Errorf("failed to connect to Redis: %w", err)
	}

	// Validate email service configuration
	if err := c.EmailService.ValidateConfig(); err != nil {
		return fmt.Errorf("invalid email configuration: %w", err)
	}

	c.Logger.Info("All infrastructure services connected successfully")
	return nil
}

// Shutdown gracefully shuts down all services
func (c *Container) Shutdown(ctx context.Context) error {
	c.Logger.Info("Shutting down services...")

	// Update health handler status
	c.HealthHandler.SetRunning(false)

	var errors []error

	// Close messaging service
	if err := c.MessagingService.Close(); err != nil {
		errors = append(errors, fmt.Errorf("failed to close messaging service: %w", err))
	}

	// Close cache service
	if err := c.CacheService.Close(); err != nil {
		errors = append(errors, fmt.Errorf("failed to close cache service: %w", err))
	}

	// Shutdown tracing
	if err := c.TracingService.Shutdown(ctx); err != nil {
		errors = append(errors, fmt.Errorf("failed to shutdown tracing: %w", err))
	}

	if len(errors) > 0 {
		return fmt.Errorf("errors during shutdown: %v", errors)
	}

	c.Logger.Info("All services shut down successfully")
	return nil
}