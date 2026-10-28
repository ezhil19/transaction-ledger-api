import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { AppException, ErrorCode } from '../errors/app.exception';

interface ErrorBody {
  statusCode: number;
  error: string;
  message: string;
  details?: unknown;
  path: string;
  timestamp: string;
}

/** Turns every error into the same JSON shape, and never leaks internals on a 500. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request>();
    const res = ctx.getResponse<Response>();

    const { statusCode, error, message, details } = this.describe(exception);
    if (statusCode >= 500) {
      this.logger.error(`${req.method} ${req.originalUrl}`, (exception as Error)?.stack);
    }

    const body: ErrorBody = {
      statusCode,
      error,
      message,
      ...(details !== undefined && { details }),
      path: req.originalUrl,
      timestamp: new Date().toISOString(),
    };
    res.status(statusCode).json(body);
  }

  private describe(exception: unknown): Omit<ErrorBody, 'path' | 'timestamp'> {
    if (exception instanceof AppException) {
      return {
        statusCode: exception.getStatus(),
        error: exception.code,
        message: exception.message,
        details: exception.details,
      };
    }

    if (exception instanceof NotFoundException) {
      return {
        statusCode: HttpStatus.NOT_FOUND,
        error: ErrorCode.ROUTE_NOT_FOUND,
        message: exception.message,
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      return {
        statusCode: status,
        error: HttpStatus[status] ?? 'HTTP_ERROR',
        message: exception.message,
      };
    }

    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      error: ErrorCode.INTERNAL_ERROR,
      message: 'An unexpected error occurred',
    };
  }
}
