import { IRedisService, JobStatus } from "../../infrastructure/redis";
import { logger } from "../../shared/logger";
import { DomainError } from "../../shared/errors";
import { withSpan } from "../../shared/tracing";

export interface GetJobHistoryUseCaseResult {
  total: number;
  jobs: JobStatus[];
}

export class GetJobHistoryUseCase {
  constructor(private redisService: IRedisService) {}

  async execute(): Promise<GetJobHistoryUseCaseResult> {
    return withSpan(
      "email.getJobHistory",
      async (span) => {
        if (!this.redisService.isConnected()) {
          throw new DomainError({
            message: "Redis service unavailable",
            statusCode: 503,
          });
        }

        const jobs = await withSpan(
          "redis.getAllJobs",
          async () => {
            return await this.redisService.getAllJobs();
          },
          {
            "redis.operation": "getAllJobs",
          }
        );

        logger.debug({
          message: "Job history retrieved",
          context: { totalJobs: jobs.length },
        });

        span.setAttributes({
          "jobs.total": jobs.length,
        });

        return {
          total: jobs.length,
          jobs,
        };
      },
      {
        operation: "getJobHistory",
      }
    );
  }
}
