import { Router, Request, Response } from "express";

export function createHealthRoutes(): Router {
  const router = Router();

  // Health check endpoint for ECS
  router.get("/health", (req: Request, res: Response) => {
    res.status(200).json({
      status: "healthy",
      service: "api",
      timestamp: new Date().toISOString(),
    });
  });

  // Ready check endpoint for ECS
  router.get("/ready", (req: Request, res: Response) => {
    res.status(200).json({
      status: "ready",
      service: "api",
      timestamp: new Date().toISOString(),
    });
  });

  return router;
}