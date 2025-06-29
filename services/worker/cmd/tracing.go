package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"time"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/exporters/jaeger"
	"go.opentelemetry.io/otel/sdk/resource"
	tracesdk "go.opentelemetry.io/otel/sdk/trace"
	semconv "go.opentelemetry.io/otel/semconv/v1.24.0"
	"go.opentelemetry.io/otel/trace"
)

// TracingSetup initializes OpenTelemetry tracing
func TracingSetup() (trace.Tracer, func(), error) {
	serviceName := getEnv("OTEL_SERVICE_NAME", "email-worker")
	serviceVersion := getEnv("OTEL_SERVICE_VERSION", "1.0.0")
	jaegerEndpoint := getEnv("OTEL_EXPORTER_JAEGER_ENDPOINT", "http://localhost:14268/api/traces")

	log.Printf("🔍 Initializing OpenTelemetry for service: %s", serviceName)
	log.Printf("📡 Jaeger endpoint: %s", jaegerEndpoint)

	// Create Jaeger exporter
	exp, err := jaeger.New(jaeger.WithCollectorEndpoint(jaeger.WithEndpoint(jaegerEndpoint)))
	if err != nil {
		return nil, nil, fmt.Errorf("failed to create Jaeger exporter: %w", err)
	}

	// Create resource with service information
	res, err := resource.New(context.Background(),
		resource.WithAttributes(
			semconv.ServiceName(serviceName),
			semconv.ServiceVersion(serviceVersion),
		),
	)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to create resource: %w", err)
	}

	// Create trace provider
	tp := tracesdk.NewTracerProvider(
		tracesdk.WithBatcher(exp),
		tracesdk.WithResource(res),
	)

	// Set global trace provider
	otel.SetTracerProvider(tp)

	// Create tracer
	tracer := tp.Tracer(serviceName)

	// Cleanup function
	cleanup := func() {
		log.Println("🧹 Shutting down OpenTelemetry...")
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := tp.Shutdown(ctx); err != nil {
			log.Printf("Error shutting down tracer provider: %v", err)
		}
	}

	log.Println("✅ OpenTelemetry initialized successfully")
	return tracer, cleanup, nil
}

// Helper function to get environment variables with defaults
func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

// TraceEmailJob creates a span for email job processing
func TraceEmailJob(tracer trace.Tracer, operation string, jobID string) (trace.Span, context.Context) {
	ctx := context.Background()
	ctx, span := tracer.Start(ctx, operation)
	
	span.SetAttributes(
		attribute.String("email.job_id", jobID),
		attribute.String("email.operation", operation),
		attribute.String("service.name", "email-worker"),
	)
	
	return span, ctx
}

// TraceRedisOperation creates a span for Redis operations
func TraceRedisOperation(tracer trace.Tracer, parentCtx context.Context, operation, key string) (trace.Span, context.Context) {
	ctx, span := tracer.Start(parentCtx, fmt.Sprintf("redis_%s", operation))
	
	span.SetAttributes(
		attribute.String("redis.operation", operation),
		attribute.String("redis.key", key),
		attribute.String("db.system", "redis"),
	)
	
	return span, ctx
}

// TraceSMTPOperation creates a span for SMTP operations
func TraceSMTPOperation(tracer trace.Tracer, parentCtx context.Context, to, subject string) (trace.Span, context.Context) {
	ctx, span := tracer.Start(parentCtx, "smtp_send_email")
	
	span.SetAttributes(
		attribute.String("smtp.operation", "send"),
		attribute.String("email.to", to),
		attribute.String("email.subject", subject),
		attribute.String("smtp.protocol", "smtp"),
	)
	
	return span, ctx
}