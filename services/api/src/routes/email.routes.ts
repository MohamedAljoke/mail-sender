import { Router } from "express";
import { EmailController } from "../controllers/email.controller";
import { IMessageBroker } from "../infrastructure/broker";
import { IRedisService } from "../infrastructure/redis";
import { IWebSocketService } from "../infrastructure/websocket";

export function createEmailRoutes(
  messageBroker: IMessageBroker,
  redisService: IRedisService,
  webSocketService: IWebSocketService
): Router {
  const router = Router();
  const emailController = new EmailController(messageBroker, redisService, webSocketService);

  // Submit email job
  router.post("/", emailController.submitEmail.bind(emailController));
  
  // Get specific job status
  router.get("/:id", emailController.getJobStatus.bind(emailController));
  
  return router;
}

export function createJobRoutes(redisService: IRedisService): Router {
  const router = Router();
  const emailController = new EmailController(null as any, redisService, null as any);

  // Get job history
  router.get("/history", emailController.getJobHistory.bind(emailController));
  
  return router;
}