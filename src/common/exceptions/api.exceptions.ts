import { HttpException, HttpStatus } from "@nestjs/common";

// Thin helpers so services can throw with a stable `code` field that survives
// through AllExceptionsFilter without inventing ad-hoc response shapes.
export class ApiException extends HttpException {
  constructor(message: string, status: HttpStatus, code: string) {
    super({ message, code }, status);
  }
}

export class NotFoundApiException extends ApiException {
  constructor(resource: string) {
    super(`${resource} not found`, HttpStatus.NOT_FOUND, "NOT_FOUND");
  }
}

export class ConflictApiException extends ApiException {
  constructor(message: string) {
    super(message, HttpStatus.CONFLICT, "CONFLICT");
  }
}

export class ForbiddenApiException extends ApiException {
  constructor(message = "Forbidden") {
    super(message, HttpStatus.FORBIDDEN, "FORBIDDEN");
  }
}

export class UnauthorizedApiException extends ApiException {
  constructor(message = "Unauthorized") {
    super(message, HttpStatus.UNAUTHORIZED, "UNAUTHORIZED");
  }
}

export class BadRequestApiException extends ApiException {
  constructor(message: string) {
    super(message, HttpStatus.BAD_REQUEST, "BAD_REQUEST");
  }
}
