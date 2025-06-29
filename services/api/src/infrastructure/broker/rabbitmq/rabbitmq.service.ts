import * as amqp from "amqplib";
import { IMessageBroker, IMessage, IQueueOptions } from "../interface";
import { logger } from "../../../shared/logger";

export class RabbitMQService implements IMessageBroker {
  private connection: amqp.ChannelModel | null = null;
  private channels: Map<string, amqp.Channel> = new Map();
  private defaultChannel: amqp.Channel | null = null;
  private readonly url: string;

  constructor(url: string) {
    this.url = url;
  }

  async connect(): Promise<void> {
    const maxRetries = 10;
    const retryDelay = 5000; // 5 seconds
    let attempt = 0;

    while (attempt < maxRetries) {
      try {
        attempt++;
        logger.info({ 
          message: "Connecting to RabbitMQ...", 
          context: { attempt, maxRetries, url: this.url.replace(/:\/\/.*@/, '://***@') }
        });
        
        this.connection = await amqp.connect(this.url);
        this.defaultChannel = await this.connection.createChannel();
        
        this.connection.on("error", (err: Error) => {
          logger.error({ message: "RabbitMQ connection error", context: err });
        });

        this.connection.on("close", () => {
          logger.warn({ message: "RabbitMQ connection closed" });
          this.connection = null;
          this.defaultChannel = null;
          this.channels.clear();
        });

        logger.info({ message: "✅ Successfully connected to RabbitMQ" });
        return;
      } catch (error) {
        logger.error({
          message: `Failed to connect to RabbitMQ (attempt ${attempt}/${maxRetries})`,
          context: error,
        });

        if (attempt >= maxRetries) {
          throw new Error(`Failed to connect to RabbitMQ after ${maxRetries} attempts: ${error}`);
        }

        logger.info({ 
          message: `Retrying RabbitMQ connection in ${retryDelay}ms...`,
          context: { nextAttempt: attempt + 1, maxRetries }
        });
        
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }
  }

  async disconnect(): Promise<void> {
    try {
      // Close all named channels
      for (const [name, channel] of this.channels) {
        try {
          await channel.close();
        } catch (error) {
          logger.warn({ message: `Failed to close channel ${name}`, context: error });
        }
      }
      this.channels.clear();
      
      // Close default channel
      if (this.defaultChannel) {
        await this.defaultChannel.close();
        this.defaultChannel = null;
      }
      
      if (this.connection) {
        await this.connection.close();
        this.connection = null;
      }
      logger.info({ message: "Disconnected from RabbitMQ" });
    } catch (error) {
      logger.error({
        message: "Error disconnecting from RabbitMQ",
        context: error,
      });
      throw error;
    }
  }

  isConnected(): boolean {
    return this.connection !== null;
  }

  // Interface implementation (backward compatible)
  async sendMessage(queueName: string, message: IMessage): Promise<void>;
  async sendMessage(queueName: string, message: IMessage, channelName?: string): Promise<void>;
  async sendMessage(queueName: string, message: IMessage, channelName?: string): Promise<void> {
    return this.sendMessageToChannel(queueName, message, channelName);
  }

  async consumeMessages(queueName: string, handler: (message: IMessage) => Promise<void>): Promise<void>;
  async consumeMessages(queueName: string, handler: (message: IMessage) => Promise<void>, channelName?: string): Promise<void>;
  async consumeMessages(queueName: string, handler: (message: IMessage) => Promise<void>, channelName?: string): Promise<void> {
    return this.consumeMessagesFromChannel(queueName, handler, channelName);
  }

  async createQueue(queueName: string, options?: IQueueOptions): Promise<void>;
  async createQueue(queueName: string, options?: IQueueOptions, channelName?: string): Promise<void>;
  async createQueue(queueName: string, options: IQueueOptions = {}, channelName?: string): Promise<void> {
    return this.createQueueOnChannel(queueName, options, channelName);
  }

  // RabbitMQ-specific channel management methods
  async createChannel(channelName: string): Promise<void> {
    if (!this.connection) {
      throw new Error("RabbitMQ connection not established");
    }
    
    if (this.channels.has(channelName)) {
      logger.warn({ message: `Channel ${channelName} already exists` });
      return;
    }

    try {
      const channel = await this.connection.createChannel();
      this.channels.set(channelName, channel);
      logger.info({ message: `Created channel: ${channelName}` });
    } catch (error) {
      logger.error({ message: `Failed to create channel ${channelName}`, context: error });
      throw error;
    }
  }

  async closeChannel(channelName: string): Promise<void> {
    const channel = this.channels.get(channelName);
    if (!channel) {
      logger.warn({ message: `Channel ${channelName} not found` });
      return;
    }

    try {
      await channel.close();
      this.channels.delete(channelName);
      logger.info({ message: `Closed channel: ${channelName}` });
    } catch (error) {
      logger.error({ message: `Failed to close channel ${channelName}`, context: error });
      throw error;
    }
  }

  private getChannel(channelName?: string): amqp.Channel {
    if (channelName) {
      const channel = this.channels.get(channelName);
      if (!channel) {
        throw new Error(`Channel ${channelName} not found. Create it first using createChannel()`);
      }
      return channel;
    }
    
    if (!this.defaultChannel) {
      throw new Error("Default channel not available. Ensure connection is established.");
    }
    return this.defaultChannel;
  }

  private async sendMessageToChannel(queueName: string, message: IMessage, channelName?: string): Promise<void> {
    try {
      if (!this.connection) {
        throw new Error("RabbitMQ connection not established");
      }

      await this.createQueueOnChannel(queueName, {}, channelName);

      const channel = this.getChannel(channelName);
      const messageBuffer = Buffer.from(JSON.stringify(message));
      const sent = channel.sendToQueue(queueName, messageBuffer, {
        persistent: true,
      });

      if (!sent) {
        throw new Error(`Failed to send message to queue: ${queueName}`);
      }

      logger.info({
        message: "Message sent to queue",
        context: { queueName, channelName: channelName || 'default', messageSize: messageBuffer.length },
      });
    } catch (error) {
      logger.error({
        message: "Failed to send message to queue",
        context: { queueName, channelName, error },
      });
      throw error;
    }
  }

  private async consumeMessagesFromChannel(
    queueName: string,
    handler: (message: IMessage) => Promise<void>,
    channelName?: string
  ): Promise<void> {
    try {
      if (!this.connection) {
        throw new Error("RabbitMQ connection not established");
      }

      await this.createQueueOnChannel(queueName, {}, channelName);

      const channel = this.getChannel(channelName);
      await channel.consume(
        queueName,
        async (msg: amqp.ConsumeMessage | null) => {
          if (msg) {
            try {
              const messageContent = JSON.parse(
                msg.content.toString()
              ) as IMessage;
              await handler(messageContent);
              channel.ack(msg);

              logger.debug({
                message: "Message processed successfully",
                context: { queueName, channelName: channelName || 'default' },
              });
            } catch (error) {
              logger.error({
                message: "Error processing message",
                context: { queueName, channelName, error },
              });
              channel.nack(msg, false, false);
            }
          }
        }
      );

      logger.info({
        message: "Started consuming messages from queue",
        context: { queueName, channelName: channelName || 'default' },
      });
    } catch (error) {
      logger.error({
        message: "Failed to start consuming messages",
        context: { queueName, channelName, error },
      });
      throw error;
    }
  }

  private async createQueueOnChannel(
    queueName: string,
    options: IQueueOptions = {},
    channelName?: string
  ): Promise<void> {
    try {
      if (!this.connection) {
        throw new Error("RabbitMQ connection not established");
      }

      const { durable = true, exclusive = false, autoDelete = false } = options;
      const channel = this.getChannel(channelName);

      await channel.assertQueue(queueName, {
        durable,
        exclusive,
        autoDelete,
      });

      logger.debug({
        message: "Queue created/verified",
        context: { queueName, channelName: channelName || 'default', durable, exclusive, autoDelete },
      });
    } catch (error) {
      logger.error({
        message: "Failed to create/verify queue",
        context: { queueName, channelName, error },
      });
      throw error;
    }
  }
}
