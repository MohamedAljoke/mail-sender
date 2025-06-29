import {
  SQSClient,
  CreateQueueCommand,
  SendMessageCommand,
  ReceiveMessageCommand,
  DeleteMessageCommand,
  GetQueueAttributesCommand,
  SetQueueAttributesCommand,
  DeleteQueueCommand,
} from "@aws-sdk/client-sqs";
import { IMessageBroker, IMessage, IQueueOptions } from "../interface";
import { logger } from "../../../shared/logger";

export interface SQSConfig {
  region: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  endpoint?: string;
}

interface SQSQueue {
  QueueUrl: string;
  QueueName: string;
}

export class SQSService implements IMessageBroker {
  private sqsClient: SQSClient;
  private connected: boolean = false;
  private queues: Map<string, SQSQueue> = new Map();
  private pollingIntervals: Map<string, NodeJS.Timeout> = new Map();
  private readonly config: SQSConfig;

  constructor(config: SQSConfig) {
    this.config = config;
    this.sqsClient = new SQSClient({
      region: config.region,
      ...(config.endpoint && { endpoint: config.endpoint }),
      ...(config.accessKeyId &&
        config.secretAccessKey && {
          credentials: {
            accessKeyId: config.accessKeyId,
            secretAccessKey: config.secretAccessKey,
          },
        }),
    });
  }

  async connect(): Promise<void> {
    try {
      logger.info({ message: "Connecting to AWS SQS..." });

      try {
        await this.sqsClient.send(
          new CreateQueueCommand({ QueueName: "health-check-queue" })
        );
        this.connected = true;
        logger.info({ message: "✅ Successfully connected to AWS SQS" });
      } catch (error: any) {
        if (error.name === "QueueAlreadyExists") {
          this.connected = true;
          logger.info({ message: "✅ Successfully connected to AWS SQS" });
        } else {
          throw error;
        }
      }
    } catch (error) {
      logger.error({ message: "Failed to connect to SQS", context: error });
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    try {
      for (const [queueName, interval] of this.pollingIntervals) {
        clearInterval(interval);
        logger.info({ message: `Stopped polling for queue: ${queueName}` });
      }
      this.pollingIntervals.clear();

      this.connected = false;
      this.queues.clear();
      logger.info({ message: "Disconnected from AWS SQS" });
    } catch (error) {
      logger.error({ message: "Error disconnecting from SQS", context: error });
      throw error;
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  async sendMessage(queueName: string, message: IMessage): Promise<void> {
    try {
      if (!this.connected) {
        throw new Error("SQS connection not established");
      }

      await this.createQueue(queueName);
      const queue = this.queues.get(queueName);
      if (!queue) {
        throw new Error(`Queue ${queueName} not found`);
      }

      const messageBody = JSON.stringify(message);
      const command = new SendMessageCommand({
        QueueUrl: queue.QueueUrl,
        MessageBody: messageBody,
        ...(message.metadata && {
          MessageAttributes: this.convertMetadataToAttributes(message.metadata),
        }),
      });

      const result = await this.sqsClient.send(command);

      logger.info({
        message: "Message sent to SQS queue",
        context: {
          queueName,
          queueUrl: queue.QueueUrl,
          messageId: result.MessageId,
          messageSize: messageBody.length,
        },
      });
    } catch (error) {
      logger.error({
        message: "Failed to send message to SQS queue",
        context: { queueName, error },
      });
      throw error;
    }
  }

  async consumeMessages(
    queueName: string,
    handler: (message: IMessage) => Promise<void>
  ): Promise<void> {
    try {
      if (!this.connected) {
        throw new Error("SQS connection not established");
      }

      await this.createQueue(queueName);
      const queue = this.queues.get(queueName);
      if (!queue) {
        throw new Error(`Queue ${queueName} not found`);
      }

      const existingInterval = this.pollingIntervals.get(queueName);
      if (existingInterval) {
        clearInterval(existingInterval);
      }

      this.startPolling(queue, handler);

      logger.info({
        message: "Started consuming messages from SQS queue",
        context: { queueName, queueUrl: queue.QueueUrl },
      });
    } catch (error) {
      logger.error({
        message: "Failed to start consuming SQS messages",
        context: { queueName, error },
      });
      throw error;
    }
  }

  async createQueue(
    queueName: string,
    options: IQueueOptions = {}
  ): Promise<void> {
    try {
      if (!this.connected) {
        throw new Error("SQS connection not established");
      }

      if (this.queues.has(queueName)) {
        logger.debug({ message: `SQS queue ${queueName} already exists` });
        return;
      }

      const attributes: Record<string, string> = {};

      if (options.durable !== undefined) {
        attributes.MessageRetentionPeriod = options.durable ? "1209600" : "60"; // 14 days vs 1 minute
      }

      const command = new CreateQueueCommand({
        QueueName: queueName,
        ...(Object.keys(attributes).length > 0 && { Attributes: attributes }),
      });

      const result = await this.sqsClient.send(command);

      if (!result.QueueUrl) {
        throw new Error(
          `Failed to create queue ${queueName}: No QueueUrl returned`
        );
      }

      this.queues.set(queueName, {
        QueueUrl: result.QueueUrl,
        QueueName: queueName,
      });

      logger.debug({
        message: "SQS queue created/verified",
        context: {
          queueName,
          queueUrl: result.QueueUrl,
          attributes,
        },
      });
    } catch (error: any) {
      if (error.name === "QueueAlreadyExists") {
        logger.debug({ message: `SQS queue ${queueName} already exists` });
        return;
      }

      logger.error({
        message: "Failed to create/verify SQS queue",
        context: { queueName, error },
      });
      throw error;
    }
  }

  async getQueueAttributes(queueName: string): Promise<Record<string, string>> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }

    const command = new GetQueueAttributesCommand({
      QueueUrl: queue.QueueUrl,
      AttributeNames: ["All"],
    });

    const result = await this.sqsClient.send(command);
    return result.Attributes || {};
  }

  async setQueueAttributes(
    queueName: string,
    attributes: Record<string, string>
  ): Promise<void> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }

    const command = new SetQueueAttributesCommand({
      QueueUrl: queue.QueueUrl,
      Attributes: attributes,
    });

    await this.sqsClient.send(command);

    logger.info({
      message: "SQS queue attributes updated",
      context: { queueName, attributes },
    });
  }

  async deleteQueue(queueName: string): Promise<void> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      logger.warn({ message: `SQS queue ${queueName} not found for deletion` });
      return;
    }

    const interval = this.pollingIntervals.get(queueName);
    if (interval) {
      clearInterval(interval);
      this.pollingIntervals.delete(queueName);
    }

    const command = new DeleteQueueCommand({
      QueueUrl: queue.QueueUrl,
    });

    await this.sqsClient.send(command);
    this.queues.delete(queueName);

    logger.info({
      message: "SQS queue deleted",
      context: { queueName, queueUrl: queue.QueueUrl },
    });
  }

  // Private helper methods

  private convertMetadataToAttributes(
    metadata: Record<string, unknown>
  ): Record<string, any> {
    const attributes: Record<string, any> = {};

    for (const [key, value] of Object.entries(metadata)) {
      attributes[key] = {
        StringValue: String(value),
        DataType: "String",
      };
    }

    return attributes;
  }

  private convertAttributesToMetadata(
    attributes?: Record<string, any>
  ): Record<string, unknown> {
    if (!attributes) return {};

    const metadata: Record<string, unknown> = {};

    for (const [key, attribute] of Object.entries(attributes)) {
      if (attribute.StringValue) {
        metadata[key] = attribute.StringValue;
      }
    }

    return metadata;
  }

  private startPolling(
    queue: SQSQueue,
    handler: (message: IMessage) => Promise<void>
  ): void {
    const poll = async () => {
      try {
        const command = new ReceiveMessageCommand({
          QueueUrl: queue.QueueUrl,
          MaxNumberOfMessages: 10,
          WaitTimeSeconds: 20,
          MessageAttributeNames: ["All"],
        });

        const result = await this.sqsClient.send(command);
        const messages = result.Messages || [];

        for (const sqsMessage of messages) {
          try {
            if (!sqsMessage.Body || !sqsMessage.ReceiptHandle) {
              continue;
            }

            const messageContent = JSON.parse(sqsMessage.Body);
            const metadata = this.convertAttributesToMetadata(
              sqsMessage.MessageAttributes
            );

            const message: IMessage = {
              content: messageContent.content || messageContent,
              ...(Object.keys(metadata).length > 0 && { metadata }),
            };

            await handler(message);

            const deleteCommand = new DeleteMessageCommand({
              QueueUrl: queue.QueueUrl,
              ReceiptHandle: sqsMessage.ReceiptHandle,
            });

            await this.sqsClient.send(deleteCommand);

            logger.debug({
              message: "SQS message processed successfully",
              context: {
                queueName: queue.QueueName,
                messageId: sqsMessage.MessageId,
              },
            });
          } catch (error) {
            logger.error({
              message: "Error processing SQS message",
              context: {
                queueName: queue.QueueName,
                messageId: sqsMessage.MessageId,
                error,
              },
            });
          }
        }
      } catch (error) {
        logger.error({
          message: "Error polling SQS queue",
          context: { queueName: queue.QueueName, error },
        });
      }

      if (this.connected && this.pollingIntervals.has(queue.QueueName)) {
        setTimeout(poll, 1000);
      }
    };

    const intervalId = setTimeout(poll, 0) as NodeJS.Timeout;
    this.pollingIntervals.set(queue.QueueName, intervalId);
  }
}
