import { createServer, Server } from "node:http";
import cors from "cors";
import express, {
  Express,
  NextFunction,
  Response,
  Request,
  Router,
} from "express";
import { logger } from "./shared/logger";
import { DomainError } from "./shared/errors";

export class ExpressHttpService {
  private app: Express;
  private server: Server;

  constructor() {
    this.app = express();
    this.setupMiddleware();
    this.server = createServer(this.app);
  }

  private setupMiddleware(): void {
    this.app.use(express.json({ limit: "50mb" }));
    this.app.use(cors());

    this.app.use((req: Request, res: Response, next: NextFunction) => {
      logger.debug({
        message: "HTTP Request",
        context: {
          method: req.method,
          url: req.url,
          userAgent: req.get("User-Agent"),
        },
      });
      next();
    });
  }

  public addRoutes(path: string, router: Router): void {
    this.app.use(path, router);
  }

  public getApp(): Express {
    return this.app;
  }

  public getServer(): Server {
    return this.server;
  }

  public async listen(port: number, host: string = "0.0.0.0"): Promise<void> {
    this.app.use(this.globalErrorHandler);

    return new Promise((resolve) => {
      this.server.listen(port, host, () => {
        logger.info({
          message: `🚀 Express server running on http://${host}:${port}`,
        });
        resolve();
      });
    });
  }

  public async close(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.close((err) => {
        if (err) {
          logger.error({ message: "Error closing HTTP server", context: err });
          reject(err);
        } else {
          logger.info({ message: "HTTP server closed" });
          resolve();
        }
      });
    });
  }

  private globalErrorHandler(
    err: any,
    req: Request,
    res: Response,
    next: NextFunction
  ): void {
    if (err instanceof DomainError) {
      logger.error({
        message: "[DOMAIN-ERROR]",
        context: {
          statusCode: err.statusCode,
          message: err.message,
          url: req.url,
          method: req.method,
          tags: err.tags,
        },
      });

      res.status(err.statusCode).json({
        error: err.message,
        ...(err.tags && { tags: err.tags }),
      });
      return;
    }

    logger.error({
      message: "[INTERNAL-ERROR]",
      context: {
        error: {
          message: err.message,
          stack: err.stack,
          name: err.name,
        },
        url: req.url,
        method: req.method,
      },
    });

    res.status(500).json({
      error: "Internal Server Error",
    });
  }
}
