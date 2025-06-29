package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"net/smtp"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gorilla/mux"
	amqp "github.com/rabbitmq/amqp091-go"
	"github.com/redis/go-redis/v9"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/codes"
	"go.opentelemetry.io/otel/trace"
)

type HealthResponse struct {
	Status        string    `json:"status"`
	Service       string    `json:"service"`
	IsRunning     bool      `json:"isRunning"`
	JobsProcessed int       `json:"jobsProcessed"`
	Timestamp     time.Time `json:"timestamp"`
}

type EmailJob struct {
	JobID       string `json:"job_id"`
	To          string `json:"to"`
	Subject     string `json:"subject"`
	Body        string `json:"body"`
	CreatedAt   string `json:"created_at"`
	RetryCount  int    `json:"retry_count,omitempty"`
	MaxRetries  int    `json:"max_retries,omitempty"`
	LastError   string `json:"last_error,omitempty"`
}

type Worker struct {
	isRunning     bool
	jobsProcessed int
	rabbitConn    *amqp.Connection
	rabbitCh      *amqp.Channel
	redisClient   *redis.Client
	tracer        trace.Tracer
}

func NewWorker() *Worker {
	return &Worker{
		isRunning:     true,
		jobsProcessed: 0,
	}
}

func (w *Worker) connectToRedis() error {
	redisURL := os.Getenv("REDIS_URL")
	if redisURL == "" {
		redisURL = "redis://localhost:6379"
	}

	log.Printf("Connecting to Redis at: %s", redisURL)
	
	opt, err := redis.ParseURL(redisURL)
	if err != nil {
		return fmt.Errorf("failed to parse Redis URL: %v", err)
	}

	w.redisClient = redis.NewClient(opt)
	
	// Test the connection
	ctx := context.Background()
	_, err = w.redisClient.Ping(ctx).Result()
	if err != nil {
		return fmt.Errorf("failed to ping Redis: %v", err)
	}

	log.Println("Connected to Redis successfully")
	return nil
}

func (w *Worker) connectToRabbitMQ() error {
	rabbitURL := os.Getenv("RABBITMQ_URL")
	if rabbitURL == "" {
		rabbitURL = "amqp://admin:password@localhost:5672"
	}

	log.Printf("Connecting to RabbitMQ at: %s", rabbitURL)

	var err error
	w.rabbitConn, err = amqp.Dial(rabbitURL)
	if err != nil {
		return err
	}

	w.rabbitCh, err = w.rabbitConn.Channel()
	if err != nil {
		return err
	}

	// Declare the main email_tasks queue
	_, err = w.rabbitCh.QueueDeclare(
		"email_tasks", // name
		true,          // durable
		false,         // delete when unused
		false,         // exclusive
		false,         // no-wait
		nil,           // arguments
	)
	if err != nil {
		return err
	}

	// Declare the retry queue with delay
	_, err = w.rabbitCh.QueueDeclare(
		"email_tasks_retry", // name
		true,               // durable
		false,              // delete when unused
		false,              // exclusive
		false,              // no-wait
		amqp.Table{
			"x-message-ttl":             180000, // 3 minutes TTL
			"x-dead-letter-exchange":    "",
			"x-dead-letter-routing-key": "email_tasks",
		},
	)
	if err != nil {
		return err
	}

	// Declare the dead letter queue for final failures
	_, err = w.rabbitCh.QueueDeclare(
		"email_tasks_failed", // name
		true,                 // durable
		false,                // delete when unused
		false,                // exclusive
		false,                // no-wait
		nil,                  // arguments
	)
	if err != nil {
		return err
	}

	log.Println("Connected to RabbitMQ successfully")
	return nil
}

func (w *Worker) sendEmail(job EmailJob) error {
	return w.sendEmailWithContext(context.Background(), job)
}

func (w *Worker) sendEmailWithContext(ctx context.Context, job EmailJob) error {
	// MailHog SMTP configuration
	smtpHost := os.Getenv("SMTP_HOST")
	if smtpHost == "" {
		smtpHost = "mailhog"
	}
	smtpPort := os.Getenv("SMTP_PORT")
	if smtpPort == "" {
		smtpPort = "1025"
	}

	// Create message
	from := "noreply@distributed-scheduler.com"
	message := fmt.Sprintf("From: %s\r\n", from) +
		fmt.Sprintf("To: %s\r\n", job.To) +
		fmt.Sprintf("Subject: %s\r\n", job.Subject) +
		"\r\n" +
		job.Body + "\r\n"

	// Connect to SMTP server
	addr := fmt.Sprintf("%s:%s", smtpHost, smtpPort)

	// MailHog doesn't require authentication
	err := smtp.SendMail(addr, nil, from, []string{job.To}, []byte(message))
	if err != nil {
		return fmt.Errorf("failed to send email: %v", err)
	}

	return nil
}

func (w *Worker) updateJobStatus(jobID, status string) error {
	return w.updateJobStatusWithDetails(jobID, status, "", 0)
}

func (w *Worker) updateJobStatusWithDetails(jobID, status, errorMsg string, retryCount int) error {
	ctx := context.Background()
	
	// Get existing job data
	jobKey := fmt.Sprintf("job:%s", jobID)
	jobData, err := w.redisClient.Get(ctx, jobKey).Result()
	if err != nil {
		return fmt.Errorf("failed to get job data: %v", err)
	}
	
	// Parse existing data
	var jobStatus map[string]interface{}
	if err := json.Unmarshal([]byte(jobData), &jobStatus); err != nil {
		return fmt.Errorf("failed to parse job data: %v", err)
	}
	
	// Update status and timestamp
	jobStatus["status"] = status
	jobStatus["updated_at"] = time.Now().Format(time.RFC3339)
	
	// Add retry information if provided
	if retryCount > 0 {
		jobStatus["retry_count"] = retryCount
	}
	if errorMsg != "" {
		jobStatus["last_error"] = errorMsg
	}
	
	// Add history entry to array instead of map to maintain all steps
	if jobStatus["history"] == nil {
		jobStatus["history"] = make([]interface{}, 0)
	}
	history := jobStatus["history"].([]interface{})
	
	historyEntry := map[string]interface{}{
		"status":    status,
		"timestamp": time.Now().Format(time.RFC3339),
	}
	if errorMsg != "" {
		historyEntry["error"] = errorMsg
	}
	
	// Append new entry to history array
	jobStatus["history"] = append(history, historyEntry)
	
	// Save back to Redis with 24 hour TTL
	updatedData, err := json.Marshal(jobStatus)
	if err != nil {
		return fmt.Errorf("failed to marshal job data: %v", err)
	}
	
	err = w.redisClient.SetEx(ctx, jobKey, string(updatedData), 24*time.Hour).Err()
	if err != nil {
		return fmt.Errorf("failed to update job status: %v", err)
	}
	
	// Publish status update to Redis pub/sub for real-time WebSocket updates
	statusUpdate := map[string]interface{}{
		"job_id":     jobID,
		"status":     status,
		"timestamp":  time.Now().Format(time.RFC3339),
		"history":    jobStatus["history"],
		"to":         jobStatus["to"],
		"subject":    jobStatus["subject"],
		"updated_at": jobStatus["updated_at"],
	}
	if errorMsg != "" {
		statusUpdate["last_error"] = errorMsg
	}
	if retryCount > 0 {
		statusUpdate["retry_count"] = retryCount
	}
	
	statusUpdateJSON, err := json.Marshal(statusUpdate)
	if err != nil {
		log.Printf("Failed to marshal status update for pub/sub: %v", err)
	} else {
		err = w.redisClient.Publish(ctx, "job_status_updates", string(statusUpdateJSON)).Err()
		if err != nil {
			log.Printf("Failed to publish status update: %v", err)
		} else {
			log.Printf("Published status update for job %s: %s", jobID, status)
		}
	}
	
	return nil
}

func (w *Worker) requeueForRetry(job EmailJob, errorMsg string) error {
	// Increment retry count
	job.RetryCount++
	job.LastError = errorMsg
	
	// Set max retries if not set
	if job.MaxRetries == 0 {
		job.MaxRetries = 3
	}
	
	// Update job status in Redis
	err := w.updateJobStatusWithDetails(job.JobID, "retrying", errorMsg, job.RetryCount)
	if err != nil {
		log.Printf("Error updating job status for retry: %v", err)
	}
	
	// Check if we've exceeded max retries
	if job.RetryCount >= job.MaxRetries {
		log.Printf("Job %s exceeded max retries (%d), sending to failed queue", job.JobID, job.MaxRetries)
		
		// Update final status to failed
		w.updateJobStatusWithDetails(job.JobID, "failed", fmt.Sprintf("Failed after %d retries: %s", job.RetryCount, errorMsg), job.RetryCount)
		
		// Send to failed queue
		jobData, _ := json.Marshal(job)
		return w.rabbitCh.Publish(
			"",                   // exchange
			"email_tasks_failed", // routing key
			false,                // mandatory
			false,                // immediate
			amqp.Publishing{
				ContentType:  "application/json",
				Body:         jobData,
				DeliveryMode: 2, // persistent
			},
		)
	}
	
	// Send to retry queue (will be redelivered after TTL expires)
	jobData, err := json.Marshal(job)
	if err != nil {
		return fmt.Errorf("failed to marshal job for retry: %v", err)
	}
	
	return w.rabbitCh.Publish(
		"",                  // exchange
		"email_tasks_retry", // routing key
		false,               // mandatory
		false,               // immediate
		amqp.Publishing{
			ContentType:  "application/json",
			Body:         jobData,
			DeliveryMode: 2, // persistent
		},
	)
}

func (w *Worker) processEmailJob(job EmailJob) {
	// Create span for job processing
	span, ctx := TraceEmailJob(w.tracer, "process_email_job", job.JobID)
	defer span.End()
	
	span.SetAttributes(
		attribute.String("email.to", job.To),
		attribute.String("email.subject", job.Subject),
		attribute.Int("email.retry_count", job.RetryCount),
		attribute.Int("email.max_retries", job.MaxRetries),
		attribute.Int("email.body_length", len(job.Body)),
	)

	log.Printf("Processing email job: %s (retry %d/%d)", job.JobID, job.RetryCount, job.MaxRetries)
	log.Printf("To: %s, Subject: %s", job.To, job.Subject)

	// Update status to processing with tracing
	redisSpan, _ := TraceRedisOperation(w.tracer, ctx, "update_status", fmt.Sprintf("job:%s", job.JobID))
	if err := w.updateJobStatus(job.JobID, "processing"); err != nil {
		log.Printf("Error updating job status to processing: %v", err)
		redisSpan.RecordError(err)
		redisSpan.SetStatus(codes.Error, err.Error())
	}
	redisSpan.End()

	// Add mock delay to make status transitions visible (2 seconds)
	log.Printf("Simulating email processing delay for job: %s", job.JobID)
	time.Sleep(2 * time.Second)

	// Send actual email via MailHog with tracing
	smtpSpan, smtpCtx := TraceSMTPOperation(w.tracer, ctx, job.To, job.Subject)
	err := w.sendEmailWithContext(smtpCtx, job)
	if err != nil {
		log.Printf("Error sending email for job %s: %v", job.JobID, err)
		smtpSpan.RecordError(err)
		smtpSpan.SetStatus(codes.Error, err.Error())
		span.RecordError(err)
		
		// Try to requeue for retry instead of immediate failure
		if retryErr := w.requeueForRetry(job, err.Error()); retryErr != nil {
			log.Printf("Error requeueing job for retry: %v", retryErr)
			// If requeue fails, mark as failed
			if statusErr := w.updateJobStatusWithDetails(job.JobID, "failed", err.Error(), job.RetryCount); statusErr != nil {
				log.Printf("Error updating job status to failed: %v", statusErr)
			}
			span.SetStatus(codes.Error, "Failed to requeue job")
		} else {
			log.Printf("Job %s requeued for retry %d/%d", job.JobID, job.RetryCount+1, job.MaxRetries)
			span.SetAttributes(attribute.String("email.status", "requeued"))
		}
		smtpSpan.End()
		return
	}
	smtpSpan.SetStatus(codes.Ok, "Email sent successfully")
	smtpSpan.End()

	// Add small delay before marking as completed to make transition visible
	log.Printf("Email sent successfully, finalizing job: %s", job.JobID)
	time.Sleep(1 * time.Second)

	// Update status to completed
	if err := w.updateJobStatus(job.JobID, "completed"); err != nil {
		log.Printf("Error updating job status to completed: %v", err)
		span.RecordError(err)
	} else {
		span.SetAttributes(attribute.String("email.status", "completed"))
		span.SetStatus(codes.Ok, "Email job completed successfully")
	}

	log.Printf("Email job completed successfully: %s", job.JobID)
	w.jobsProcessed++
}

func (w *Worker) healthHandler(rw http.ResponseWriter, r *http.Request) {
	response := HealthResponse{
		Status:        "healthy",
		Service:       "worker-go",
		IsRunning:     w.isRunning,
		JobsProcessed: w.jobsProcessed,
		Timestamp:     time.Now(),
	}

	rw.Header().Set("Content-Type", "application/json")
	json.NewEncoder(rw).Encode(response)
}

func (w *Worker) readyHandler(rw http.ResponseWriter, r *http.Request) {
	response := HealthResponse{
		Status:    "ready",
		Service:   "worker-go",
		Timestamp: time.Now(),
	}

	rw.Header().Set("Content-Type", "application/json")
	json.NewEncoder(rw).Encode(response)
}

func (w *Worker) processJobs(ctx context.Context) {
	log.Println("Starting email job consumer...")

	// Set up consumer
	msgs, err := w.rabbitCh.Consume(
		"email_tasks", // queue
		"",            // consumer
		true,          // auto-ack
		false,         // exclusive
		false,         // no-local
		false,         // no-wait
		nil,           // args
	)
	if err != nil {
		log.Printf("Failed to register consumer: %v", err)
		return
	}

	log.Println("Email worker ready to process jobs")

	for {
		select {
		case <-ctx.Done():
			log.Println("Job processing stopped")
			return
		case msg := <-msgs:
			if len(msg.Body) == 0 {
				continue
			}

			var emailJob EmailJob
			if err := json.Unmarshal(msg.Body, &emailJob); err != nil {
				log.Printf("Error unmarshaling job: %v", err)
				continue
			}

			if w.isRunning {
				w.processEmailJob(emailJob)
			}
		}
	}
}

func (w *Worker) shutdown() {
	log.Println("Shutting down worker gracefully...")
	w.isRunning = false

	if w.rabbitCh != nil {
		w.rabbitCh.Close()
	}
	if w.rabbitConn != nil {
		w.rabbitConn.Close()
	}
	if w.redisClient != nil {
		w.redisClient.Close()
	}
}

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "3002"
	}

	// Initialize tracing
	tracer, tracingCleanup, err := TracingSetup()
	if err != nil {
		log.Fatalf("Failed to initialize tracing: %v", err)
	}
	defer tracingCleanup()

	worker := NewWorker()
	worker.tracer = tracer

	// Connect to Redis
	for {
		err := worker.connectToRedis()
		if err != nil {
			log.Printf("Failed to connect to Redis: %v. Retrying in 5 seconds...", err)
			time.Sleep(5 * time.Second)
			continue
		}
		break
	}

	// Connect to RabbitMQ
	for {
		err := worker.connectToRabbitMQ()
		if err != nil {
			log.Printf("Failed to connect to RabbitMQ: %v. Retrying in 5 seconds...", err)
			time.Sleep(5 * time.Second)
			continue
		}
		break
	}

	// Setup HTTP server for health checks
	router := mux.NewRouter()
	router.HandleFunc("/health", worker.healthHandler).Methods("GET")
	router.HandleFunc("/ready", worker.readyHandler).Methods("GET")

	server := &http.Server{
		Addr:    ":" + port,
		Handler: router,
	}

	// Start job processing in background
	ctx, cancel := context.WithCancel(context.Background())
	go worker.processJobs(ctx)

	// Start HTTP server in background
	go func() {
		log.Printf("Go Worker health server starting on port %s", port)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Could not start server: %v\n", err)
		}
	}()

	// Wait for interrupt signal to gracefully shutdown
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("Shutdown signal received")

	// Shutdown worker
	worker.shutdown()
	cancel()

	// Shutdown HTTP server
	ctx, cancel = context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := server.Shutdown(ctx); err != nil {
		log.Fatal("Server forced to shutdown:", err)
	}

	log.Println("Go Worker exited")
}
