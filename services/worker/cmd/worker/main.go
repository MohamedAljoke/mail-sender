package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"sync"
	"syscall"

	"task-scheduler-worker/internal/worker"
	"task-scheduler-worker/pkg/server"
)

func main() {
	// Create dependency container
	container, err := worker.NewContainer()
	if err != nil {
		log.Fatalf("Failed to create container: %v", err)
	}

	// Create context for graceful shutdown
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Connect to infrastructure services with retries
	if err := container.ConnectInfrastructure(ctx); err != nil {
		log.Fatalf("Failed to connect to infrastructure: %v", err)
	}

	// Create worker service
	workerService := worker.NewWorkerService(container)

	// Create HTTP server
	httpServer := server.NewHTTPServer(container.Config.Port, container.HealthHandler, container.Logger)

	// Setup graceful shutdown
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)

	// Start services
	var wg sync.WaitGroup

	// Start worker service
	wg.Add(1)
	go func() {
		defer wg.Done()
		if err := workerService.Start(ctx); err != nil {
			container.Logger.Error("Worker service failed", "error", err)
			cancel() // Cancel context to trigger shutdown
		}
	}()

	// Start HTTP server
	wg.Add(1)
	go func() {
		defer wg.Done()
		if err := httpServer.Start(container.Config.Port); err != nil {
			container.Logger.Error("HTTP server failed", "error", err)
			cancel() // Cancel context to trigger shutdown
		}
	}()

	container.Logger.Info("All services started successfully")

	// Wait for shutdown signal or context cancellation
	select {
	case <-quit:
		container.Logger.Info("Shutdown signal received")
	case <-ctx.Done():
		container.Logger.Info("Context cancelled, shutting down")
	}

	// Graceful shutdown
	container.Logger.Info("Starting graceful shutdown...")

	// Stop worker service
	workerService.Stop()

	// Shutdown HTTP server
	shutdownCtx := context.Background()
	if err := httpServer.Shutdown(shutdownCtx); err != nil {
		container.Logger.Error("Failed to shutdown HTTP server", "error", err)
	}

	// Shutdown container services
	if err := container.Shutdown(shutdownCtx); err != nil {
		container.Logger.Error("Failed to shutdown container", "error", err)
	}

	// Wait for all goroutines to finish
	wg.Wait()

	container.Logger.Info("Application shut down successfully")
}
