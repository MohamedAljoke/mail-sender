import { Router, Request, Response } from "express";
import { HealthService } from "../shared/health.service";
import { IRedisService } from "../infrastructure/redis/redis.service";
import { IMessageBroker } from "../infrastructure/broker/interface";

export function createHealthRoutes(
  redisService?: IRedisService,
  messageBroker?: IMessageBroker
): Router {
  const router = Router();
  const healthService = new HealthService(redisService, messageBroker);

  // Health check endpoint with dependency checks
  router.get("/health", async (req: Request, res: Response) => {
    try {
      const healthResponse = await healthService.checkHealth();

      // Set status code based on health
      let statusCode = 200;
      if (healthResponse.status === "unhealthy") {
        statusCode = 503;
      } else if (healthResponse.status === "degraded") {
        statusCode = 200; // Still operational
      }

      res.status(statusCode).json(healthResponse);
    } catch (error) {
      res.status(503).json({
        status: "unhealthy",
        service: "api",
        timestamp: new Date(),
        error: error instanceof Error ? error.message : "Health check failed",
      });
    }
  });

  // Simple ready check endpoint
  router.get("/ready", (req: Request, res: Response) => {
    res.status(200).json({
      status: "ready",
      service: "api",
      timestamp: new Date(),
    });
  });

  return router;
}
