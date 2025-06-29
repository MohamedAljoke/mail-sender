package config

import (
	"fmt"
	"os"
	"strconv"
	"time"
)

// Config holds all configuration for the worker service
type Config struct {
	// Server configuration
	Port string `json:"port"`

	// Redis configuration
	RedisURL string `json:"redis_url"`

	// RabbitMQ configuration
	RabbitMQURL string `json:"rabbitmq_url"`

	// SMTP configuration
	SMTPHost string `json:"smtp_host"`
	SMTPPort string `json:"smtp_port"`

	// Worker configuration
	MaxRetries       int           `json:"max_retries"`
	RetryDelay       time.Duration `json:"retry_delay"`
	ProcessingDelay  time.Duration `json:"processing_delay"`
	CompletionDelay  time.Duration `json:"completion_delay"`
	JobTTL           time.Duration `json:"job_ttl"`

	// OpenTelemetry configuration
	ServiceName         string `json:"service_name"`
	ServiceVersion      string `json:"service_version"`
	JaegerEndpoint      string `json:"jaeger_endpoint"`
	TracingEnabled      bool   `json:"tracing_enabled"`

	// Logging configuration
	LogLevel string `json:"log_level"`
	LogFormat string `json:"log_format"`
}

// Load loads configuration from environment variables with validation
func Load() (*Config, error) {
	config := &Config{
		// Server defaults
		Port: getEnvWithDefault("PORT", "3002"),

		// Redis defaults
		RedisURL: getEnvWithDefault("REDIS_URL", "redis://localhost:6379"),

		// RabbitMQ defaults
		RabbitMQURL: getEnvWithDefault("RABBITMQ_URL", "amqp://admin:password@localhost:5672"),

		// SMTP defaults
		SMTPHost: getEnvWithDefault("SMTP_HOST", "mailhog"),
		SMTPPort: getEnvWithDefault("SMTP_PORT", "1025"),

		// Worker defaults
		MaxRetries:      getEnvAsIntWithDefault("MAX_RETRIES", 3),
		RetryDelay:      getEnvAsDurationWithDefault("RETRY_DELAY", 3*time.Minute),
		ProcessingDelay: getEnvAsDurationWithDefault("PROCESSING_DELAY", 2*time.Second),
		CompletionDelay: getEnvAsDurationWithDefault("COMPLETION_DELAY", 1*time.Second),
		JobTTL:          getEnvAsDurationWithDefault("JOB_TTL", 24*time.Hour),

		// OpenTelemetry defaults
		ServiceName:    getEnvWithDefault("OTEL_SERVICE_NAME", "email-worker"),
		ServiceVersion: getEnvWithDefault("OTEL_SERVICE_VERSION", "1.0.0"),
		JaegerEndpoint: getEnvWithDefault("OTEL_EXPORTER_JAEGER_ENDPOINT", "http://localhost:14268/api/traces"),
		TracingEnabled: getEnvAsBoolWithDefault("TRACING_ENABLED", true),

		// Logging defaults
		LogLevel:  getEnvWithDefault("LOG_LEVEL", "info"),
		LogFormat: getEnvWithDefault("LOG_FORMAT", "json"),
	}

	// Validate configuration
	if err := config.validate(); err != nil {
		return nil, fmt.Errorf("invalid configuration: %w", err)
	}

	return config, nil
}

// validate checks if the configuration is valid
func (c *Config) validate() error {
	if c.Port == "" {
		return fmt.Errorf("PORT is required")
	}

	if c.RedisURL == "" {
		return fmt.Errorf("REDIS_URL is required")
	}

	if c.RabbitMQURL == "" {
		return fmt.Errorf("RABBITMQ_URL is required")
	}

	if c.SMTPHost == "" {
		return fmt.Errorf("SMTP_HOST is required")
	}

	if c.SMTPPort == "" {
		return fmt.Errorf("SMTP_PORT is required")
	}

	if c.MaxRetries < 0 {
		return fmt.Errorf("MAX_RETRIES must be >= 0")
	}

	if c.RetryDelay < 0 {
		return fmt.Errorf("RETRY_DELAY must be >= 0")
	}

	if c.ServiceName == "" {
		return fmt.Errorf("SERVICE_NAME is required")
	}

	validLogLevels := map[string]bool{
		"debug": true,
		"info":  true,
		"warn":  true,
		"error": true,
	}
	if !validLogLevels[c.LogLevel] {
		return fmt.Errorf("LOG_LEVEL must be one of: debug, info, warn, error")
	}

	validLogFormats := map[string]bool{
		"json": true,
		"text": true,
	}
	if !validLogFormats[c.LogFormat] {
		return fmt.Errorf("LOG_FORMAT must be one of: json, text")
	}

	return nil
}

// Helper functions for environment variable parsing
func getEnvWithDefault(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

func getEnvAsIntWithDefault(key string, defaultValue int) int {
	if value := os.Getenv(key); value != "" {
		if intValue, err := strconv.Atoi(value); err == nil {
			return intValue
		}
	}
	return defaultValue
}

func getEnvAsDurationWithDefault(key string, defaultValue time.Duration) time.Duration {
	if value := os.Getenv(key); value != "" {
		if duration, err := time.ParseDuration(value); err == nil {
			return duration
		}
	}
	return defaultValue
}

func getEnvAsBoolWithDefault(key string, defaultValue bool) bool {
	if value := os.Getenv(key); value != "" {
		if boolValue, err := strconv.ParseBool(value); err == nil {
			return boolValue
		}
	}
	return defaultValue
}