package tracing

import (
	"context"
	"fmt"
	"time"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/exporters/jaeger"
	"go.opentelemetry.io/otel/sdk/resource"
	tracesdk "go.opentelemetry.io/otel/sdk/trace"
	semconv "go.opentelemetry.io/otel/semconv/v1.24.0"
	"go.opentelemetry.io/otel/trace"

	"task-scheduler-worker/internal/config"
	"task-scheduler-worker/internal/domain/errors"
	"task-scheduler-worker/pkg/logger"
)

// TracingService manages OpenTelemetry tracing setup
type TracingService struct {
	tracer   trace.Tracer
	provider *tracesdk.TracerProvider
	logger   *logger.Logger
	config   *config.Config
}

// NewTracingService creates a new tracing service
func NewTracingService(config *config.Config, logger *logger.Logger) (*TracingService, error) {
	if !config.TracingEnabled {
		logger.Info("Tracing disabled")
		return &TracingService{
			tracer: trace.NewNoopTracerProvider().Tracer("noop"),
			config: config,
			logger: logger,
		}, nil
	}

	logger.LogServiceStart("tracing", map[string]interface{}{
		"service_name":     config.ServiceName,
		"service_version":  config.ServiceVersion,
		"jaeger_endpoint": config.JaegerEndpoint,
	})

	// Create Jaeger exporter
	exp, err := jaeger.New(jaeger.WithCollectorEndpoint(jaeger.WithEndpoint(config.JaegerEndpoint)))
	if err != nil {
		return nil, errors.NewConfigErrorWithCause("failed to create Jaeger exporter", err)
	}

	// Create resource with service information
	res, err := resource.New(context.Background(),
		resource.WithAttributes(
			semconv.ServiceName(config.ServiceName),
			semconv.ServiceVersion(config.ServiceVersion),
			semconv.DeploymentEnvironment("development"), // TODO: make configurable
		),
	)
	if err != nil {
		return nil, errors.NewConfigErrorWithCause("failed to create resource", err)
	}

	// Create trace provider
	tp := tracesdk.NewTracerProvider(
		tracesdk.WithBatcher(exp),
		tracesdk.WithResource(res),
		tracesdk.WithSampler(tracesdk.AlwaysSample()), // TODO: make configurable
	)

	// Set global trace provider
	otel.SetTracerProvider(tp)

	// Create tracer
	tracer := tp.Tracer(config.ServiceName)

	logger.Info("OpenTelemetry initialized successfully")

	return &TracingService{
		tracer:   tracer,
		provider: tp,
		logger:   logger,
		config:   config,
	}, nil
}

// GetTracer returns the tracer instance
func (ts *TracingService) GetTracer() trace.Tracer {
	return ts.tracer
}

// Shutdown gracefully shuts down the tracing service
func (ts *TracingService) Shutdown(ctx context.Context) error {
	if ts.provider == nil {
		return nil
	}

	ts.logger.LogServiceStop("tracing")

	shutdownCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	if err := ts.provider.Shutdown(shutdownCtx); err != nil {
		return errors.NewShutdownErrorWithCause("failed to shutdown tracer provider", err)
	}

	return nil
}

// TraceEmailJob creates a span for email job processing
func TraceEmailJob(tracer trace.Tracer, ctx context.Context, operation string, jobID string) (context.Context, trace.Span) {
	ctx, span := tracer.Start(ctx, operation)
	
	span.SetAttributes(
		attribute.String("email.job_id", jobID),
		attribute.String("email.operation", operation),
		attribute.String("service.name", "email-worker"),
	)
	
	return ctx, span
}

// TraceRedisOperation creates a span for Redis operations
func TraceRedisOperation(tracer trace.Tracer, parentCtx context.Context, operation, key string) (context.Context, trace.Span) {
	ctx, span := tracer.Start(parentCtx, fmt.Sprintf("redis_%s", operation))
	
	span.SetAttributes(
		attribute.String("redis.operation", operation),
		attribute.String("redis.key", key),
		attribute.String("db.system", "redis"),
	)
	
	return ctx, span
}

// TraceSMTPOperation creates a span for SMTP operations
func TraceSMTPOperation(tracer trace.Tracer, parentCtx context.Context, to, subject string) (context.Context, trace.Span) {
	ctx, span := tracer.Start(parentCtx, "smtp_send_email")
	
	span.SetAttributes(
		attribute.String("smtp.operation", "send"),
		attribute.String("email.to", to),
		attribute.String("email.subject", subject),
		attribute.String("smtp.protocol", "smtp"),
	)
	
	return ctx, span
}

// TraceRabbitMQOperation creates a span for RabbitMQ operations
func TraceRabbitMQOperation(tracer trace.Tracer, parentCtx context.Context, operation, queue string) (context.Context, trace.Span) {
	ctx, span := tracer.Start(parentCtx, fmt.Sprintf("rabbitmq_%s", operation))
	
	span.SetAttributes(
		attribute.String("messaging.system", "rabbitmq"),
		attribute.String("messaging.operation", operation),
		attribute.String("messaging.destination", queue),
	)
	
	return ctx, span
}