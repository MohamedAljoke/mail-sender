import { v4 as uuidv4 } from "uuid";
import { IMessageBroker } from "../../infrastructure/broker";
import { IRedisService, JobStatus } from "../../infrastructure/redis";
import { IWebSocketService } from "../../infrastructure/websocket";
import { logger } from "../../shared/logger";
import { withSpan } from "../../shared/tracing";
import { EmailJobRequest } from "../../schemas/email.schema";

export interface SubmitEmailUseCaseResult {
  jobId: string;
  status: string;
}

export class SubmitEmailUseCase {
  constructor(
    private messageBroker: IMessageBroker,
    private redisService: IRedisService,
    private webSocketService: IWebSocketService
  ) {}

  async execute(request: EmailJobRequest): Promise<SubmitEmailUseCaseResult> {
    return withSpan("email.submit", async (span) => {
      const { to, subject, body } = request;
      const jobId = uuidv4();
      const createdAt = new Date().toISOString();

      span.setAttributes({
        "email.to": to,
        "email.subject": subject,
        "email.job_id": jobId,
        "email.created_at": createdAt,
      });

      const emailMessage = {
        content: {
          job_id: jobId,
          to,
          subject,
          body,
          created_at: createdAt,
          status: "pending",
          retry_count: 0,
          max_retries: 3,
          history: [
            {
              status: "pending",
              timestamp: createdAt,
              message: "Job created",
            },
          ],
        },
      };

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

      await withSpan(
        "redis.setJobStatus",
        async () => {
          await this.redisService.setJobStatus(jobId, jobStatus);
        },
        {
          "redis.operation": "setJobStatus",
          "job.id": jobId,
        }
      );

      await withSpan(
        "broker.sendMessage",
        async () => {
          await this.messageBroker.sendMessage("email_tasks", emailMessage);
        },
        {
          "broker.operation": "sendMessage",
          "broker.queue": "email_queue",
          "job.id": jobId,
        }
      );

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

      return {
        jobId,
        status: "queued",
      };
    });
  }
}
