import { env } from "./env.validator";
import { ExpressHttpService } from "./server";
import { IMessageBroker, createMessageBroker } from "./infrastructure/broker";
import { RedisService, IRedisService } from "./infrastructure/redis";
import {
  WebSocketService,
  IWebSocketService,
} from "./infrastructure/websocket";
import { createEmailRoutes, createJobRoutes } from "./routes/email.routes";
import { createHealthRoutes } from "./routes/health.routes";
import { logger } from "./shared/logger";

class Application {
  private httpService: ExpressHttpService;
  private messageBroker: IMessageBroker;
  private redisService: IRedisService;
  private webSocketService: IWebSocketService;

  constructor() {
    this.httpService = new ExpressHttpService();
    this.messageBroker = createMessageBroker(env.MESSAGE_BROKER_TYPE);
    this.redisService = new RedisService(env.REDIS_URL);
    this.webSocketService = new WebSocketService();
  }

  async start(): Promise<void> {
    try {
      // Connect to external services
      await this.connectServices();

      // Setup routes
      this.setupRoutes();

      // Initialize WebSocket
      this.webSocketService.initialize(this.httpService.getServer());

      // Setup Redis pub/sub for real-time updates
      await this.setupRedisPubSub();

      // Start HTTP server
      await this.httpService.listen(env.PORT ?? 3000);

      logger.info({
        message: "🎉 Application started successfully",
        context: {
          port: env.PORT ?? 3000,
          broker: env.MESSAGE_BROKER_TYPE,
          webSocketClients: this.webSocketService.getConnectedClientsCount(),
        },
      });

      // Setup graceful shutdown
      this.setupGracefulShutdown();
    } catch (error) {
      logger.error({
        message: "Failed to start application",
        context: error,
      });
      process.exit(1);
    }
  }

  private async connectServices(): Promise<void> {
    logger.info({ message: "Connecting to external services..." });

    // Connect to message broker
    await this.messageBroker.connect();
    logger.info({
      message: `✅ ${env.MESSAGE_BROKER_TYPE.toUpperCase()} connected`,
    });

    // Connect to Redis
    await this.redisService.connect();
    logger.info({ message: "✅ Redis connected" });
  }

  private setupRoutes(): void {
    logger.info({ message: "Setting up routes..." });

    // Health endpoints
    this.httpService.addRoutes("/", createHealthRoutes());

    // Email API routes
    this.httpService.addRoutes(
      "/api/emails",
      createEmailRoutes(
        this.messageBroker,
        this.redisService,
        this.webSocketService
      )
    );

    // Job history routes
    this.httpService.addRoutes("/api/jobs", createJobRoutes(this.redisService));

    logger.info({ message: "✅ Routes configured" });
  }

  private async setupRedisPubSub(): Promise<void> {
    try {
      await this.redisService.subscribe("job_status_updates", (message) => {
        try {
          const jobUpdate = JSON.parse(message);
          logger.debug({
            message: "Received job status update via Redis pub/sub",
            context: { jobId: jobUpdate.job_id, status: jobUpdate.status },
          });

          // Broadcast to WebSocket clients
          this.webSocketService.broadcast({
            type: "job_status_update",
            data: jobUpdate,
          });
        } catch (error) {
          logger.error({
            message: "Error processing job status update from Redis",
            context: error,
          });
        }
      });

      logger.info({ message: "✅ Redis pub/sub configured" });
    } catch (error) {
      logger.error({
        message: "Failed to setup Redis pub/sub",
        context: error,
      });
      throw error;
    }
  }

  private setupGracefulShutdown(): void {
    const gracefulShutdown = async (signal: string) => {
      logger.info({
        message: `${signal} received, shutting down gracefully`,
      });

      try {
        // Close WebSocket server
        await this.webSocketService.close();

        // Close HTTP server
        await this.httpService.close();

        // Disconnect from message broker
        await this.messageBroker.disconnect();

        // Disconnect from Redis
        await this.redisService.disconnect();

        logger.info({ message: "✅ Graceful shutdown completed" });
        process.exit(0);
      } catch (error) {
        logger.error({
          message: "Error during graceful shutdown",
          context: error,
        });
        process.exit(1);
      }
    };

    process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
    process.on("SIGINT", () => gracefulShutdown("SIGINT"));
  }

  // Getters for testing or external access
  getMessageBroker(): IMessageBroker {
    return this.messageBroker;
  }

  getHttpService(): ExpressHttpService {
    return this.httpService;
  }

  getRedisService(): IRedisService {
    return this.redisService;
  }

  getWebSocketService(): IWebSocketService {
    return this.webSocketService;
  }
}

// Start the application
const app = new Application();
app.start().catch((error) => {
  logger.error({
    message: "Unhandled error during application startup",
    context: error,
  });
  process.exit(1);
});
