import { Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { IMessageBroker, IMessage } from "../infrastructure/broker";
import { IRedisService, JobStatus } from "../infrastructure/redis";
import { IWebSocketService } from "../infrastructure/websocket";
import { logger } from "../shared/logger";
import { DomainError } from "../shared/errors";

export interface EmailJobRequest {
  to: string;
  subject: string;
  body: string;
}

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

  async submitEmail(req: Request, res: Response): Promise<void> {
    try {
      const { to, subject, body }: EmailJobRequest = req.body;

      // Validate input
      this.validateEmailRequest({ to, subject, body });

      // Create job
      const jobId = uuidv4();
      const timestamp = new Date().toISOString();

      const emailJob: EmailJobMessage = {
        content: {
          job_id: jobId,
          to,
          subject,
          body,
          created_at: timestamp,
        },
      };

      // Check Redis connection
      if (!this.redisService.isConnected()) {
        throw new DomainError({
          message: "Redis service unavailable",
          statusCode: 503,
        });
      }

      // Create initial job status
      const jobStatus = this.redisService.createJobStatus(jobId, to, subject, "queued");

      // Store job status in Redis (24 hours TTL)
      await this.redisService.setJobStatus(jobId, jobStatus, 86400);

      // Check message broker connection
      if (!this.messageBroker.isConnected()) {
        throw new DomainError({
          message: "Message broker unavailable",
          statusCode: 503,
        });
      }

      // Send to message queue
      await this.messageBroker.sendMessage("email_tasks", emailJob);

      logger.info({
        message: "Email job submitted successfully",
        context: { 
          jobId, 
          to, 
          subject: subject.substring(0, 50) + (subject.length > 50 ? "..." : "")
        }
      });

      // Broadcast new job creation to WebSocket clients
      this.webSocketService.broadcast({
        type: "job_created",
        data: {
          job_id: jobId,
          to,
          subject,
          status: "queued",
          created_at: timestamp,
        },
      });

      res.status(201).json({
        job_id: jobId,
        status: "queued",
        message: "Email job submitted successfully",
      });
    } catch (error) {
      this.handleError(error, res, "Error submitting email job");
    }
  }

  async getJobStatus(req: Request, res: Response): Promise<void> {
    try {
      const jobId = req.params.id;

      if (!jobId) {
        throw new DomainError({
          message: "Job ID is required",
          statusCode: 400,
        });
      }

      // Check Redis connection
      if (!this.redisService.isConnected()) {
        throw new DomainError({
          message: "Redis service unavailable",
          statusCode: 503,
        });
      }

      // Get job status from Redis
      const jobStatus = await this.redisService.getJobStatus(jobId);

      if (!jobStatus) {
        throw new DomainError({
          message: "Job not found",
          statusCode: 404,
          tags: { job_id: jobId },
        });
      }

      logger.debug({
        message: "Job status retrieved",
        context: { jobId, status: jobStatus.status }
      });

      res.json(jobStatus);
    } catch (error) {
      this.handleError(error, res, "Error retrieving job status");
    }
  }

  async getJobHistory(req: Request, res: Response): Promise<void> {
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
        context: { totalJobs: jobs.length }
      });

      res.json({
        total: jobs.length,
        jobs,
      });
    } catch (error) {
      this.handleError(error, res, "Error retrieving job history");
    }
  }

  // Utility method for updating job status (called by background workers)
  async updateJobStatus(
    jobId: string,
    newStatus: JobStatus["status"],
    message?: string
  ): Promise<void> {
    try {
      const currentStatus = await this.redisService.getJobStatus(jobId);
      
      if (!currentStatus) {
        logger.warn({
          message: "Attempted to update non-existent job",
          context: { jobId, newStatus }
        });
        return;
      }

      const updatedStatus = this.redisService.updateJobStatus(
        currentStatus,
        newStatus,
        message
      );

      // Update in Redis
      await this.redisService.setJobStatus(jobId, updatedStatus);

      // Publish to Redis pub/sub for real-time updates
      await this.redisService.publish(
        "job_status_updates",
        JSON.stringify(updatedStatus)
      );

      // Broadcast via WebSocket
      this.webSocketService.broadcastJobUpdate(jobId, updatedStatus);

      logger.info({
        message: "Job status updated",
        context: { jobId, newStatus, previousStatus: currentStatus.status }
      });
    } catch (error) {
      logger.error({
        message: "Failed to update job status",
        context: { jobId, newStatus, error }
      });
      throw error;
    }
  }

  private validateEmailRequest(request: EmailJobRequest): void {
    const { to, subject, body } = request;

    if (!to || typeof to !== "string" || to.trim().length === 0) {
      throw new DomainError({
        message: "Valid 'to' email address is required",
        statusCode: 400,
      });
    }

    if (!subject || typeof subject !== "string" || subject.trim().length === 0) {
      throw new DomainError({
        message: "Valid 'subject' is required",
        statusCode: 400,
      });
    }

    if (!body || typeof body !== "string" || body.trim().length === 0) {
      throw new DomainError({
        message: "Valid 'body' is required",
        statusCode: 400,
      });
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(to)) {
      throw new DomainError({
        message: "Invalid email address format",
        statusCode: 400,
      });
    }

    // Length validations
    if (subject.length > 200) {
      throw new DomainError({
        message: "Subject cannot exceed 200 characters",
        statusCode: 400,
      });
    }

    if (body.length > 10000) {
      throw new DomainError({
        message: "Body cannot exceed 10,000 characters",
        statusCode: 400,
      });
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
        error: error instanceof Error ? {
          message: error.message,
          stack: error.stack,
          name: error.name,
        } : error,
      },
    });

    res.status(500).json({
      error: "Internal server error",
    });
  }
}