import { createServer, Server } from "node:http";

import cors from "cors";
import express, { Express, NextFunction, Response, Request } from "express";

import { logger } from "./shared/logger";
import { DomainError } from "./shared/errors";

export class ExpressHttpService {
  private app: Express;
  private server: Server;

  constructor() {
    this.app = express();
    this.app.use(express.json({ limit: "50mb" }));
    this.app.use(cors());
    this.server = createServer(this.app);
  }

  public getApp(): Express {
    return this.app;
  }

  public getServer(): Server {
    return this.server;
  }

  public async listen(port: number): Promise<void> {
    this.app.use(this.globalErrorHandler);
    this.server.listen(port, () => {
      logger.info({
        message: `🚀 Express server running at http://localhost:${port}`,
      });
    });
  }

  private globalErrorHandler(
    err: any,
    _: Request,
    res: Response,
    next: NextFunction
  ) {
    if (err instanceof DomainError) {
      logger.error({
        message: "[DOMAIN-ERROR]",
        context: {
          statusCode: err.code,
          err,
        },
      });
      res.status(err.statusCode).json({
        message: err.message,
        ...(err.tags && { tags: err.tags }),
      });
      return next(err);
    }
    logger.error({
      message: "[INTERNAL-ERROR]",
      context: {
        error: {
          message: err.message,
          stack: err.stack,
          name: err.name,
        },
      },
    });
    res.status(500).json({ message: "Internal Server Error" });
  }
}
