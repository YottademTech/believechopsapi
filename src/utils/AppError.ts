export class AppError extends Error {
  readonly statusCode: number;
  readonly code?: string;
  readonly retryAfterSeconds?: number;

  constructor(message: string, statusCode = 400, code?: string, retryAfterSeconds?: number) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}
