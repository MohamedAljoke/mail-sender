package server

import (
	"context"
	"fmt"
	"net/http"
	"time"

	"github.com/gorilla/mux"

	"task-scheduler-worker/internal/handlers"
	"task-scheduler-worker/pkg/logger"
)

type HTTPServer struct {
	server        *http.Server
	logger        *logger.Logger
	healthHandler *handlers.HealthHandler
}

func NewHTTPServer(port string, healthHandler *handlers.HealthHandler, logger *logger.Logger) *HTTPServer {
	return &HTTPServer{
		logger:        logger,
		healthHandler: healthHandler,
	}
}

func (s *HTTPServer) Start(port string) error {
	router := s.setupRoutes()

	s.server = &http.Server{
		Addr:         ":" + port,
		Handler:      router,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	s.logger.Info("Starting HTTP server", "port", port)

	if err := s.server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		return fmt.Errorf("failed to start server: %w", err)
	}

	return nil
}

func (s *HTTPServer) Shutdown(ctx context.Context) error {
	s.logger.Info("Shutting down HTTP server...")

	shutdownCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	if err := s.server.Shutdown(shutdownCtx); err != nil {
		return fmt.Errorf("failed to shutdown server: %w", err)
	}

	s.logger.Info("HTTP server shut down successfully")
	return nil
}

func (s *HTTPServer) setupRoutes() *mux.Router {
	router := mux.NewRouter()

	// Health endpoints - support both root and /worker/ prefix for ALB compatibility
	router.HandleFunc("/health", s.healthHandler.HealthCheck).Methods("GET")
	router.HandleFunc("/ready", s.healthHandler.ReadinessCheck).Methods("GET")
	router.HandleFunc("/worker/health", s.healthHandler.HealthCheck).Methods("GET")
	router.HandleFunc("/worker/ready", s.healthHandler.ReadinessCheck).Methods("GET")

	router.Use(s.loggingMiddleware)

	return router
}

func (s *HTTPServer) loggingMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()

		recorder := &responseRecorder{
			ResponseWriter: w,
			statusCode:     http.StatusOK,
		}

		next.ServeHTTP(recorder, r)

		duration := time.Since(start)

		s.logger.WithFields(map[string]interface{}{
			"method":     r.Method,
			"path":       r.URL.Path,
			"status":     recorder.statusCode,
			"duration":   duration.String(),
			"user_agent": r.UserAgent(),
			"remote_ip":  r.RemoteAddr,
		}).Info("HTTP request processed")
	})
}

type responseRecorder struct {
	http.ResponseWriter
	statusCode int
}

func (r *responseRecorder) WriteHeader(statusCode int) {
	r.statusCode = statusCode
	r.ResponseWriter.WriteHeader(statusCode)
}
