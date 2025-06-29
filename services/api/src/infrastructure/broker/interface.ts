export interface IMessage {
  content: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface IQueueOptions {
  durable?: boolean;
  exclusive?: boolean;
  autoDelete?: boolean;
}

export interface IMessageBroker {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
  sendMessage(queueName: string, message: IMessage): Promise<void>;
  consumeMessages(queueName: string, handler: (message: IMessage) => Promise<void>): Promise<void>;
  createQueue(queueName: string, options?: IQueueOptions): Promise<void>;
}
