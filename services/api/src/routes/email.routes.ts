import { Router } from "express";
import { EmailController } from "../controllers/email.controller";
import { IMessageBroker } from "../infrastructure/broker";
import { IRedisService } from "../infrastructure/redis";
import { IWebSocketService } from "../infrastructure/websocket";
import validate from "../middleware/validator.middleware";
import { emailJobSchema } from "../schemas/email.schema";

export function createEmailRoutes(
  messageBroker: IMessageBroker,
  redisService: IRedisService,
  webSocketService: IWebSocketService
): Router {
  const router = Router();
  const emailController = new EmailController(
    messageBroker,
    redisService,
    webSocketService
  );

  router.post("/", validate(emailJobSchema), emailController.submitEmail.bind(emailController));

  return router;
}

export function createJobRoutes(redisService: IRedisService): Router {
  const router = Router();
  const emailController = new EmailController(
    null as any,
    redisService,
    null as any
  );

  router.get("/history", emailController.getJobHistory.bind(emailController));

  return router;
}
