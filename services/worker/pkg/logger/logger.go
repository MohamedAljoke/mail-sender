package logger

import (
	"context"
	"log/slog"
	"os"

	"go.opentelemetry.io/otel/trace"
)

type Logger struct {
	slogger *slog.Logger
}

type Config struct {
	Level  string
	Format string
}

func NewLogger(config *Config) *Logger {
	var level slog.Level
	switch config.Level {
	case "debug":
		level = slog.LevelDebug
	case "info":
		level = slog.LevelInfo
	case "warn":
		level = slog.LevelWarn
	case "error":
		level = slog.LevelError
	default:
		level = slog.LevelInfo
	}

	var handler slog.Handler
	opts := &slog.HandlerOptions{
		Level: level,
	}

	switch config.Format {
	case "json":
		handler = slog.NewJSONHandler(os.Stdout, opts)
	case "text":
		handler = slog.NewTextHandler(os.Stdout, opts)
	default:
		handler = slog.NewJSONHandler(os.Stdout, opts)
	}

	return &Logger{
		slogger: slog.New(handler),
	}
}

func (l *Logger) WithTracing(ctx context.Context) *Logger {
	span := trace.SpanFromContext(ctx)
	if !span.IsRecording() {
		return l
	}

	spanContext := span.SpanContext()
	return &Logger{
		slogger: l.slogger.With(
			slog.String("trace_id", spanContext.TraceID().String()),
			slog.String("span_id", spanContext.SpanID().String()),
		),
	}
}

func (l *Logger) WithComponent(component string) *Logger {
	return &Logger{
		slogger: l.slogger.With(slog.String("component", component)),
	}
}

func (l *Logger) WithJobID(jobID string) *Logger {
	return &Logger{
		slogger: l.slogger.With(slog.String("job_id", jobID)),
	}
}

func (l *Logger) WithFields(fields map[string]interface{}) *Logger {
	args := make([]any, 0, len(fields)*2)
	for k, v := range fields {
		args = append(args, k, v)
	}
	return &Logger{
		slogger: l.slogger.With(args...),
	}
}

func (l *Logger) Debug(msg string, args ...interface{}) {
	l.slogger.Debug(msg, args...)
}

func (l *Logger) Info(msg string, args ...interface{}) {
	l.slogger.Info(msg, args...)
}

func (l *Logger) Warn(msg string, args ...interface{}) {
	l.slogger.Warn(msg, args...)
}

func (l *Logger) Error(msg string, args ...interface{}) {
	l.slogger.Error(msg, args...)
}

func (l *Logger) DebugContext(ctx context.Context, msg string, args ...interface{}) {
	l.WithTracing(ctx).Debug(msg, args...)
}

func (l *Logger) InfoContext(ctx context.Context, msg string, args ...interface{}) {
	l.WithTracing(ctx).Info(msg, args...)
}

func (l *Logger) WarnContext(ctx context.Context, msg string, args ...interface{}) {
	l.WithTracing(ctx).Warn(msg, args...)
}

func (l *Logger) ErrorContext(ctx context.Context, msg string, args ...interface{}) {
	l.WithTracing(ctx).Error(msg, args...)
}

func (l *Logger) LogJobStart(ctx context.Context, jobID, to, subject string, retryCount, maxRetries int) {
	l.WithTracing(ctx).WithJobID(jobID).Info("Starting job processing",
		slog.String("to", to),
		slog.String("subject", subject),
		slog.Int("retry_count", retryCount),
		slog.Int("max_retries", maxRetries),
	)
}

func (l *Logger) LogJobCompleted(ctx context.Context, jobID string) {
	l.WithTracing(ctx).WithJobID(jobID).Info("Job completed successfully")
}

func (l *Logger) LogJobFailed(ctx context.Context, jobID string, err error, retryCount int) {
	l.WithTracing(ctx).WithJobID(jobID).Error("Job failed",
		slog.String("error", err.Error()),
		slog.Int("retry_count", retryCount),
	)
}

func (l *Logger) LogJobRetry(ctx context.Context, jobID string, retryCount, maxRetries int, err error) {
	l.WithTracing(ctx).WithJobID(jobID).Warn("Job retrying",
		slog.Int("retry_count", retryCount),
		slog.Int("max_retries", maxRetries),
		slog.String("error", err.Error()),
	)
}

func (l *Logger) LogServiceStart(service string, config interface{}) {
	l.WithComponent(service).Info("Service starting", slog.Any("config", config))
}

func (l *Logger) LogServiceStop(service string) {
	l.WithComponent(service).Info("Service stopping")
}

func (l *Logger) LogHealthCheck(service string, healthy bool, latency string, err error) {
	logger := l.WithComponent("health").WithFields(map[string]interface{}{
		"service": service,
		"healthy": healthy,
		"latency": latency,
	})

	if err != nil {
		logger.Error("Health check failed", slog.String("error", err.Error()))
	} else {
		logger.Info("Health check passed")
	}
}
