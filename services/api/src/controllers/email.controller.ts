import { Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { trace, SpanStatusCode } from "@opentelemetry/api";
import { IMessageBroker, IMessage } from "../infrastructure/broker";
import { IRedisService, JobStatus } from "../infrastructure/redis";
import { IWebSocketService } from "../infrastructure/websocket";
import { logger } from "../shared/logger";
import { DomainError } from "../shared/errors";
import { EmailJobRequest } from "../schemas/email.schema";

const tracer = trace.getTracer("email-controller", "1.0.0");

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
    return tracer.startActiveSpan("email.submit", async (span) => {
      try {
        const { to, subject, body } = req.body;
        const jobId = uuidv4();
        const createdAt = new Date().toISOString();

        span.setAttributes({
          "email.to": to,
          "email.subject": subject,
          "email.job_id": jobId,
          "email.created_at": createdAt,
        });

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

        // Store job status in Redis with tracing
        await tracer.startActiveSpan(
          "redis.setJobStatus",
          async (redisSpan) => {
            redisSpan.setAttributes({
              "redis.operation": "setJobStatus",
              "job.id": jobId,
            });
            await this.redisService.setJobStatus(jobId, jobStatus);
            redisSpan.setStatus({ code: SpanStatusCode.OK });
            redisSpan.end();
          }
        );

        // Send message to broker with tracing
        await tracer.startActiveSpan(
          "broker.sendMessage",
          async (brokerSpan) => {
            brokerSpan.setAttributes({
              "broker.operation": "sendMessage",
              "broker.queue": "email_queue",
              "job.id": jobId,
            });
            await this.messageBroker.sendMessage("email_queue", emailMessage);
            brokerSpan.setStatus({ code: SpanStatusCode.OK });
            brokerSpan.end();
          }
        );

        // Broadcast WebSocket notification
        this.webSocketService.broadcast({
          type: "job_created",
          data: {
            job_id: jobId,
            status: "queued",
            to,
            subject,
            created_at: createdAt,
          },
        });

        logger.info({
          message: "Email job submitted successfully",
          context: {
            jobId,
            to,
            subject,
          },
        });

        span.setStatus({ code: SpanStatusCode.OK });
        span.end();

        res.status(201).json({
          message: "Email job submitted successfully",
          job_id: jobId,
          status: "queued",
        });
      } catch (error) {
        span.recordException(error as Error);
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: error instanceof Error ? error.message : "Unknown error",
        });
        span.end();
        this.handleError(error, res, "Error submitting email job");
      }
    });
  }

  async getJobHistory(_req: Request, res: Response): Promise<void> {
    return tracer.startActiveSpan("email.getJobHistory", async (span) => {
      try {
        span.setAttributes({
          operation: "getJobHistory",
        });

        // Check Redis connection
        if (!this.redisService.isConnected()) {
          throw new DomainError({
            message: "Redis service unavailable",
            statusCode: 503,
          });
        }

        // Get all jobs from Redis with tracing
        const jobs = await tracer.startActiveSpan(
          "redis.getAllJobs",
          async (redisSpan) => {
            redisSpan.setAttributes({
              "redis.operation": "getAllJobs",
            });
            const result = await this.redisService.getAllJobs();
            redisSpan.setAttributes({
              "jobs.count": result.length,
            });
            redisSpan.setStatus({ code: SpanStatusCode.OK });
            redisSpan.end();
            return result;
          }
        );

        logger.debug({
          message: "Job history retrieved",
          context: { totalJobs: jobs.length },
        });

        span.setAttributes({
          "jobs.total": jobs.length,
        });
        span.setStatus({ code: SpanStatusCode.OK });
        span.end();

        res.json({
          total: jobs.length,
          jobs,
        });
      } catch (error) {
        span.recordException(error as Error);
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: error instanceof Error ? error.message : "Unknown error",
        });
        span.end();
        this.handleError(error, res, "Error retrieving job history");
      }
    });
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
