export class DomainError extends Error {
  statusCode: number;
  code?: number;
  traceCode?: string;
  isReportable?: boolean;
  tags?: { [key: string]: string };

  constructor({
    message,
    statusCode,
    code,
    traceCode,
    isReportable,
    tags,
  }: {
    message: string;
    code?: number;
    statusCode?: number;
    traceCode?: string;
    isReportable?: boolean;
    tags?: { [key: string]: string };
  }) {
    super(message);
    this.statusCode = statusCode ?? 500;
    this.code = code;
    this.traceCode = traceCode;
    this.isReportable = isReportable;
    this.tags = tags;
  }
}
