import pino, { LoggerOptions } from "pino";
import pretty from "pino-pretty";

type LogParams = {
  message: string;
  context?: unknown | Error;
};

export interface Logger {
  info(params: LogParams): void;
  error(params: LogParams): void;
  warn(params: LogParams): void;
  debug(params: LogParams): void;
}

export class LoggerPino implements Logger {
  private logger: pino.Logger;

  constructor() {
    let transport: LoggerOptions["transport"];
    let level: LoggerOptions["level"];
    let formatters: LoggerOptions["formatters"];

    if (process.env["NODE_ENVIRONMENT"] === "local") {
      this.logger = pino({ level: "trace" }, pretty({ sync: true }));
      return;
    }

    switch (process.env["NODE_ENVIRONMENT"]) {
      case "production":
        level = "info";
        formatters = {
          level: (label: string) => {
            return { level: label.toUpperCase() };
          },
        };
        break;
      case "test":
        level = "silent";
        break;
      case "development":
        level = "trace";
        transport = {
          target: "pino-pretty",
          options: { colorize: true },
        };
        break;
      default:
        level = "info";
        break;
    }
    this.logger = pino({
      ...(formatters && { formatters }),
      ...(transport && { transport }),
      ...(level ? { level } : { level: "trace" }),
      transport: {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "HH:MM:ss.l",
          ignore: "pid,hostname",
        },
      },
    });
  }

  info(params: LogParams): void {
    const { message, context } = params;
    this.logger.info({ context }, message);
  }

  error(params: LogParams): void {
    const { message, context } = params;
    this.logger.error({ context }, message);
  }

  warn(params: LogParams): void {
    const { message, context } = params;
    this.logger.warn({ context }, message);
  }

  debug(params: LogParams): void {
    const { message, context } = params;
    this.logger.debug({ context }, message);
  }
}

export const logger = new LoggerPino();
