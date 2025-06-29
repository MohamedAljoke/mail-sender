import { Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { trace, SpanStatusCode } from "@opentelemetry/api";
import { IMessageBroker, IMessage } from "../infrastructure/broker";
import { IRedisService, JobStatus } from "../infrastructure/redis";
import { IWebSocketService } from "../infrastructure/websocket";
import { logger } from "../shared/logger";
import { DomainError } from "../shared/errors";
import { EmailJobRequest } from "../schemas/email.schema";

const tracer = trace.getTracer('email-controller', '1.0.0');

export interface EmailJobMessage extends IMessage {
  content: {
    job_id: string;
    to: string;
    subject: string;
    body: string;
    created_at: string;
  };
}

export class EmailController {
  constructor(
    private messageBroker: IMessageBroker,
    private redisService: IRedisService,
    private webSocketService: IWebSocketService
  ) {}

  async submitEmail(
    req: Request<{}, {}, EmailJobRequest>,
    res: Response
  ): Promise<void> {
    try {
      const { to, subject, body } = req.body;
      const jobId = uuidv4();
      const createdAt = new Date().toISOString();

      // Create email job message
      const emailMessage: EmailJobMessage = {
        content: {
          job_id: jobId,
          to,
          subject,
          body,
          created_at: createdAt,
        },
      };

      // Create job status object
      const jobStatus: JobStatus = {
        job_id: jobId,
        status: "queued",
        to,
        subject,
        created_at: createdAt,
        updated_at: createdAt,
        retry_count: 0,
        history: [
          {
            status: "queued",
            timestamp: createdAt,
            message: "Job queued",
          },
        ],
      };

      await this.redisService.setJobStatus(jobId, jobStatus);

      await this.messageBroker.sendMessage("email_queue", emailMessage);

      this.webSocketService.broadcast({
        type: "job_created",
        data: {
          job_id: jobId,
          status: "queued",
          to,
          subject,
          created_at: createdAt,
        }
      });

      logger.info({
        message: "Email job submitted successfully",
        context: {
          jobId,
          to,
          subject,
        },
      });

      res.status(201).json({
        message: "Email job submitted successfully",
        job_id: jobId,
        status: "queued",
      });
    } catch (error) {
      this.handleError(error, res, "Error submitting email job");
    }
  }

  async getJobHistory(_req: Request, res: Response): Promise<void> {
    try {
      // Check Redis connection
      if (!this.redisService.isConnected()) {
        throw new DomainError({
          message: "Redis service unavailable",
          statusCode: 503,
        });
      }

      // Get all jobs from Redis
      const jobs = await this.redisService.getAllJobs();

      logger.debug({
        message: "Job history retrieved",
        context: { totalJobs: jobs.length },
      });

      res.json({
        total: jobs.length,
        jobs,
      });
    } catch (error) {
      this.handleError(error, res, "Error retrieving job history");
    }
  }

  private handleError(error: unknown, res: Response, context: string): void {
    if (error instanceof DomainError) {
      logger.error({
        message: context,
        context: {
          statusCode: error.statusCode,
          message: error.message,
          tags: error.tags,
        },
      });

      res.status(error.statusCode).json({
        error: error.message,
        ...(error.tags && { tags: error.tags }),
      });
      return;
    }

    // Handle unexpected errors
    logger.error({
      message: context,
      context: {
        error:
          error instanceof Error
            ? {
                message: error.message,
                stack: error.stack,
                name: error.name,
              }
            : error,
      },
    });

    res.status(500).json({
      error: "Internal server error",
    });
  }
}
