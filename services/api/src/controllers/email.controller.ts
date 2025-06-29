import { Request, Response } from "express";
import { IMessageBroker, IMessage } from "../infrastructure/broker";
import { IRedisService } from "../infrastructure/redis";
import { IWebSocketService } from "../infrastructure/websocket";
import { EmailJobRequest } from "../schemas/email.schema";
import { SubmitEmailUseCase } from "../usecases/email/submit-email.usecase";
import { GetJobHistoryUseCase } from "../usecases/email/get-job-history.usecase";

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
  private submitEmailUseCase: SubmitEmailUseCase;
  private getJobHistoryUseCase: GetJobHistoryUseCase;

  constructor(
    messageBroker: IMessageBroker,
    redisService: IRedisService,
    webSocketService: IWebSocketService
  ) {
    this.submitEmailUseCase = new SubmitEmailUseCase(
      messageBroker,
      redisService,
      webSocketService
    );
    this.getJobHistoryUseCase = new GetJobHistoryUseCase(redisService);
  }

  async submitEmail(
    req: Request<{}, {}, EmailJobRequest>,
    res: Response
  ): Promise<void> {
    const result = await this.submitEmailUseCase.execute(req.body);

    res.status(201).json({
      message: "Email job submitted successfully",
      job_id: result.jobId,
      status: result.status,
    });
  }

  async getJobHistory(_req: Request, res: Response): Promise<void> {
    const result = await this.getJobHistoryUseCase.execute();

    res.json({
      total: result.total,
      jobs: result.jobs,
    });
  }
}
