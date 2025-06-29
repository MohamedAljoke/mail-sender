import { IMessageBroker } from "./interface";
import { RabbitMQService } from "./rabbitmq";
import { SQSService } from "./sqs";

export type BrokerType = "rabbitmq" | "sqs";

export interface BrokerConfig {
  type: BrokerType;
  rabbitmq?: {
    url: string;
  };
  sqs?: {
    region: string;
    accessKeyId?: string;
    secretAccessKey?: string;
  };
}

export class BrokerFactory {
  static create(config: BrokerConfig): IMessageBroker {
    switch (config.type) {
      case "rabbitmq":
        if (!config.rabbitmq) {
          throw new Error("RabbitMQ configuration is required");
        }
        return new RabbitMQService(config.rabbitmq.url);

      case "sqs":
        if (!config.sqs) {
          throw new Error("SQS configuration is required");
        }
        return new SQSService(config.sqs);

      default:
        throw new Error(`Unsupported broker type: ${config.type}`);
    }
  }
}

export const createMessageBroker = (
  brokerType?: BrokerType
): IMessageBroker => {
  const type =
    brokerType || (process.env.MESSAGE_BROKER_TYPE as BrokerType) || "rabbitmq";

  const config: BrokerConfig = {
    type,
    rabbitmq: {
      url: process.env.RABBITMQ_URL || "amqp://localhost:5672",
    },
    sqs: {
      region: process.env.AWS_REGION || "us-east-1",
      ...(process.env.AWS_ACCESS_KEY_ID && {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      }),
      ...(process.env.AWS_SECRET_ACCESS_KEY && {
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      }),
      ...(process.env.AWS_SQS_ENDPOINT && {
        endpoint: process.env.AWS_SQS_ENDPOINT,
      }),
    },
  };

  return BrokerFactory.create(config);
};
