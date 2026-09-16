import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import type { Request, Response } from "express";

export interface ApiErrorBody {
  success: false;
  message: string;
  code: string;
  errors?: Array<{ field?: string; message: string }>;
}

// Maps every thrown error (HttpException or unexpected) into one stable
// envelope. Never leaks stack traces or internal error messages to clients —
// unexpected errors are logged server-side and returned as a generic 500.
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger("ExceptionFilter");

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      const { message, code, errors } = this.normalize(body, exception);

      this.logger.warn(
        `HTTP ${status} ${request.method} ${request.url}: ${message}`,
        JSON.stringify({ requestId: (request as { id?: string }).id }),
      );

      response.status(status).json({ success: false, message, code, errors } satisfies ApiErrorBody);
      return;
    }

    this.logger.error(
      `Unhandled exception on ${request.method} ${request.url}: ${
        exception instanceof Error ? exception.stack ?? exception.message : String(exception)
      }`,
    );

    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "An unexpected error occurred",
      code: "INTERNAL_ERROR",
    } satisfies ApiErrorBody);
  }

  private normalize(
    body: unknown,
    exception: HttpException,
  ): { message: string; code: string; errors?: Array<{ field?: string; message: string }> } {
    if (typeof body === "string") {
      return { message: body, code: exception.name };
    }
    if (typeof body === "object" && body !== null) {
      const b = body as Record<string, unknown>;
      const rawMessage = b.message;
      let errors: Array<{ field?: string; message: string }> | undefined;
      let message: string;

      if (Array.isArray(rawMessage)) {
        // class-validator ValidationPipe error array (strings like "email must be an email")
        errors = rawMessage.map((m) => ({ message: String(m) }));
        message = "Validation failed";
      } else {
        message = typeof rawMessage === "string" ? rawMessage : exception.message;
      }

      const code = typeof b.code === "string" ? b.code : exception.name;
      return { message, code, errors };
    }
    return { message: exception.message, code: exception.name };
  }
}
