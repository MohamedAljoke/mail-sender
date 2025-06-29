import { createClient, RedisClientType } from "redis";
import { logger } from "../../shared/logger";

export interface JobStatus {
  job_id: string;
  status: "queued" | "processing" | "sent" | "failed";
  to: string;
  subject: string;
  created_at: string;
  updated_at: string;
  retry_count?: number;
  error_message?: string;
  history: Array<{
    status: string;
    timestamp: string;
    message?: string;
  }>;
}

export interface IRedisService {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;

  setJobStatus(
    jobId: string,
    status: JobStatus,
    ttlSeconds?: number
  ): Promise<void>;
  getJobStatus(jobId: string): Promise<JobStatus | null>;
  getAllJobs(): Promise<JobStatus[]>;
  deleteJob(jobId: string): Promise<void>;

  subscribe(
    channel: string,
    callback: (message: string) => void
  ): Promise<void>;
  publish(channel: string, message: string): Promise<void>;
  unsubscribe(channel: string): Promise<void>;

  set(key: string, value: string, ttlSeconds?: number): Promise<void>;
  get(key: string): Promise<string | null>;
  delete(key: string): Promise<void>;
  keys(pattern: string): Promise<string[]>;
}

export class RedisService implements IRedisService {
  private client: RedisClientType | null = null;
  private subscriber: RedisClientType | null = null;
  private readonly url: string;
  private connected: boolean = false;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;
  private reconnectDelay: number = 5000;

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
          message: "Connecting to Redis...", 
          context: { attempt, maxRetries, url: this.url.replace(/:\/\/.*@/, '://***@') }
        });

        this.client = createClient({ url: this.url });

        this.client.on("error", (err) => {
          logger.error({ message: "Redis Client Error", context: err });
          this.connected = false;
        });

        this.client.on("connect", () => {
          logger.info({ message: "Redis client connected" });
          this.connected = true;
          this.reconnectAttempts = 0;
        });

        this.client.on("disconnect", () => {
          logger.warn({ message: "Redis client disconnected" });
          this.connected = false;
          this.handleReconnection();
        });

        await this.client.connect();

        this.subscriber = this.client.duplicate();
        await this.subscriber.connect();

        logger.info({ message: "✅ Successfully connected to Redis" });
        return;
      } catch (error) {
        logger.error({
          message: `Failed to connect to Redis (attempt ${attempt}/${maxRetries})`,
          context: error,
        });

        if (attempt >= maxRetries) {
          throw new Error(`Failed to connect to Redis after ${maxRetries} attempts: ${error}`);
        }

        logger.info({ 
          message: `Retrying Redis connection in ${retryDelay}ms...`,
          context: { nextAttempt: attempt + 1, maxRetries }
        });
        
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }
  }

  async disconnect(): Promise<void> {
    try {
      if (this.subscriber) {
        await this.subscriber.disconnect();
        this.subscriber = null;
      }

      if (this.client) {
        await this.client.disconnect();
        this.client = null;
      }

      this.connected = false;
      logger.info({ message: "Disconnected from Redis" });
    } catch (error) {
      logger.error({
        message: "Error disconnecting from Redis",
        context: error,
      });
      throw error;
    }
  }

  isConnected(): boolean {
    return this.connected && this.client !== null;
  }

  async setJobStatus(
    jobId: string,
    status: JobStatus,
    ttlSeconds: number = 86400
  ): Promise<void> {
    if (!this.client) {
      throw new Error("Redis client not connected");
    }

    try {
      const key = `job:${jobId}`;
      const value = JSON.stringify(status);

      await this.client.setEx(key, ttlSeconds, value);

      logger.debug({
        message: "Job status updated",
        context: { jobId, status: status.status },
      });
    } catch (error) {
      logger.error({
        message: "Failed to set job status",
        context: { jobId, error },
      });
      throw error;
    }
  }

  async getJobStatus(jobId: string): Promise<JobStatus | null> {
    if (!this.client) {
      throw new Error("Redis client not connected");
    }

    try {
      const key = `job:${jobId}`;
      const value = await this.client.get(key);

      if (!value) {
        return null;
      }

      return JSON.parse(value) as JobStatus;
    } catch (error) {
      logger.error({
        message: "Failed to get job status",
        context: { jobId, error },
      });
      throw error;
    }
  }

  async getAllJobs(): Promise<JobStatus[]> {
    if (!this.client) {
      throw new Error("Redis client not connected");
    }

    try {
      const jobKeys = await this.client.keys("job:*");
      const jobs: JobStatus[] = [];

      for (const key of jobKeys) {
        try {
          const jobData = await this.client.get(key);
          if (jobData) {
            const parsedJob = JSON.parse(jobData) as JobStatus;
            jobs.push(parsedJob);
          }
        } catch (parseError) {
          logger.error({
            message: "Error parsing job data",
            context: { key, error: parseError },
          });
        }
      }

      jobs.sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

      return jobs;
    } catch (error) {
      logger.error({
        message: "Failed to get all jobs",
        context: { error },
      });
      throw error;
    }
  }

  async deleteJob(jobId: string): Promise<void> {
    if (!this.client) {
      throw new Error("Redis client not connected");
    }

    try {
      const key = `job:${jobId}`;
      await this.client.del(key);

      logger.debug({
        message: "Job deleted",
        context: { jobId },
      });
    } catch (error) {
      logger.error({
        message: "Failed to delete job",
        context: { jobId, error },
      });
      throw error;
    }
  }

  async subscribe(
    channel: string,
    callback: (message: string) => void
  ): Promise<void> {
    if (!this.subscriber) {
      throw new Error("Redis subscriber not connected");
    }

    try {
      await this.subscriber.subscribe(channel, callback);

      logger.info({
        message: "Subscribed to Redis channel",
        context: { channel },
      });
    } catch (error) {
      logger.error({
        message: "Failed to subscribe to channel",
        context: { channel, error },
      });
      throw error;
    }
  }

  async publish(channel: string, message: string): Promise<void> {
    if (!this.client) {
      throw new Error("Redis client not connected");
    }

    try {
      await this.client.publish(channel, message);

      logger.debug({
        message: "Message published to Redis channel",
        context: { channel, messageLength: message.length },
      });
    } catch (error) {
      logger.error({
        message: "Failed to publish message",
        context: { channel, error },
      });
      throw error;
    }
  }

  async unsubscribe(channel: string): Promise<void> {
    if (!this.subscriber) {
      throw new Error("Redis subscriber not connected");
    }

    try {
      await this.subscriber.unsubscribe(channel);

      logger.info({
        message: "Unsubscribed from Redis channel",
        context: { channel },
      });
    } catch (error) {
      logger.error({
        message: "Failed to unsubscribe from channel",
        context: { channel, error },
      });
      throw error;
    }
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (!this.client) {
      throw new Error("Redis client not connected");
    }

    try {
      if (ttlSeconds) {
        await this.client.setEx(key, ttlSeconds, value);
      } else {
        await this.client.set(key, value);
      }
    } catch (error) {
      logger.error({
        message: "Failed to set key",
        context: { key, error },
      });
      throw error;
    }
  }

  async get(key: string): Promise<string | null> {
    if (!this.client) {
      throw new Error("Redis client not connected");
    }

    try {
      return await this.client.get(key);
    } catch (error) {
      logger.error({
        message: "Failed to get key",
        context: { key, error },
      });
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    if (!this.client) {
      throw new Error("Redis client not connected");
    }

    try {
      await this.client.del(key);
    } catch (error) {
      logger.error({
        message: "Failed to delete key",
        context: { key, error },
      });
      throw error;
    }
  }

  async keys(pattern: string): Promise<string[]> {
    if (!this.client) {
      throw new Error("Redis client not connected");
    }

    try {
      return await this.client.keys(pattern);
    } catch (error) {
      logger.error({
        message: "Failed to get keys",
        context: { pattern, error },
      });
      throw error;
    }
  }

  private async handleReconnection(): Promise<void> {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.error({
        message: "Max reconnection attempts reached",
        context: { attempts: this.reconnectAttempts },
      });
      return;
    }

    this.reconnectAttempts++;

    logger.info({
      message: "Attempting to reconnect to Redis",
      context: {
        attempt: this.reconnectAttempts,
        maxAttempts: this.maxReconnectAttempts,
        delay: this.reconnectDelay,
      },
    });

    setTimeout(async () => {
      try {
        await this.connect();
      } catch (error) {
        logger.error({
          message: "Reconnection attempt failed",
          context: { attempt: this.reconnectAttempts, error },
        });
      }
    }, this.reconnectDelay);
  }

  createJobStatus(
    jobId: string,
    to: string,
    subject: string,
    status: JobStatus["status"] = "queued"
  ): JobStatus {
    const timestamp = new Date().toISOString();

    return {
      job_id: jobId,
      status,
      to,
      subject,
      created_at: timestamp,
      updated_at: timestamp,
      retry_count: 0,
      history: [
        {
          status,
          timestamp,
          message: `Job ${status}`,
        },
      ],
    };
  }

  updateJobStatus(
    currentStatus: JobStatus,
    newStatus: JobStatus["status"],
    message?: string
  ): JobStatus {
    const timestamp = new Date().toISOString();

    return {
      ...currentStatus,
      status: newStatus,
      updated_at: timestamp,
      ...(newStatus === "failed" && message && { error_message: message }),
      history: [
        ...currentStatus.history,
        {
          status: newStatus,
          timestamp,
          ...(message && { message }),
        },
      ],
    };
  }
}
