import { HealthStatus, HealthResponseBuilder } from "./health.types";
import { IRedisService } from "../infrastructure/redis/redis.service";
import { IMessageBroker } from "../infrastructure/broker/interface";
import { logger } from "./logger";

export class HealthService {
  private redisService?: IRedisService;
  private messageBroker?: IMessageBroker;

  constructor(redisService?: IRedisService, messageBroker?: IMessageBroker) {
    this.redisService = redisService;
    this.messageBroker = messageBroker;
  }

  async checkHealth(): Promise<any> {
    const builder = new HealthResponseBuilder("api", true);

    // Check Redis
    if (this.redisService) {
      await this.checkRedis(builder);
    }

    // Check Message Broker (RabbitMQ/SQS)
    if (this.messageBroker) {
      await this.checkMessageBroker(builder);
    }

    const response = builder.build();

    logger.info({
      message: "Health check completed",
      context: {
        status: response.status,
        dependencies: Object.keys(response.dependencies || {}).length,
      },
    });

    return response;
  }

  private async checkRedis(builder: HealthResponseBuilder): Promise<void> {
    const start = Date.now();

    try {
      if (!this.redisService?.isConnected()) {
        builder.addDependencyCheck(
          "redis",
          HealthStatus.UNHEALTHY,
          "Not connected",
          `${Date.now() - start}ms`
        );
        return;
      }

      // Simple ping test
      await this.redisService.get("health:ping");
      const latency = `${Date.now() - start}ms`;

      builder.addDependencyCheck(
        "redis",
        HealthStatus.HEALTHY,
        "Connected",
        latency
      );
      logger.debug({
        message: "Redis health check passed",
        context: {
          latency,
        },
      });
    } catch (error) {
      const latency = `${Date.now() - start}ms`;
      const message = error instanceof Error ? error.message : "Unknown error";

      builder.addDependencyCheck(
        "redis",
        HealthStatus.UNHEALTHY,
        message,
        latency
      );

      logger.error({
        message: "Redis health check failed",
        context: { error: message, latency },
      });
    }
  }

  private async checkMessageBroker(
    builder: HealthResponseBuilder
  ): Promise<void> {
    const start = Date.now();

    try {
      if (!this.messageBroker?.isConnected()) {
        builder.addDependencyCheck(
          "message_broker",
          HealthStatus.UNHEALTHY,
          "Not connected",
          `${Date.now() - start}ms`
        );
        return;
      }

      // For message brokers, we just check connection status
      const latency = `${Date.now() - start}ms`;

      builder.addDependencyCheck(
        "message_broker",
        HealthStatus.HEALTHY,
        "Connected",
        latency
      );
      logger.debug({
        message: "Message broker health check passed",
        context: {
          latency,
        },
      });
    } catch (error) {
      const latency = `${Date.now() - start}ms`;
      const message = error instanceof Error ? error.message : "Unknown error";

      builder.addDependencyCheck(
        "message_broker",
        HealthStatus.UNHEALTHY,
        message,
        latency
      );
      logger.error({
        message: "Message broker health check failed",
        context: {
          error: message,
          latency,
        },
      });
    }
  }
}
