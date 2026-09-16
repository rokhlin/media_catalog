import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Injectable,
  Inject,
  Optional,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { LogBufferService } from './log-buffer.service.js';

@Catch()
@Injectable()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(@Inject(LogBufferService) @Optional() private readonly logBuffer?: LogBufferService) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    let errorMessage = 'Internal server error';
    let errorDetail: any = null;
    let stack: string | undefined;

    if (exception instanceof HttpException) {
      const resp = exception.getResponse();
      if (typeof resp === 'string') {
        errorMessage = resp;
      } else if (typeof resp === 'object' && resp !== null) {
        errorMessage = (resp as any).message || (resp as any).error || exception.message;
        errorDetail = resp;
      }
      stack = exception.stack;
    } else if (exception instanceof Error) {
      errorMessage = exception.message;
      stack = exception.stack;
      errorDetail = {
        name: exception.name,
        cause: (exception as any).cause,
      };
    } else {
      errorMessage = String(exception);
    }

    const method = request?.method || 'UNKNOWN';
    const url = request?.originalUrl || request?.url || 'UNKNOWN';
    const ip = request?.ip || '127.0.0.1';

    const errorExplanation = {
      httpStatus: status,
      endpoint: `${method} ${url}`,
      clientIp: ip,
      message: errorMessage,
      details: errorDetail,
      suggestion: this.getSuggestion(status, url, errorMessage),
    };

    // Log intercepted error with detailed explanation to Live Pipeline Logs
    if (this.logBuffer) {
      this.logBuffer.error(
        'ErrorInterceptor',
        `Intercepted ${status} error on ${method} ${url}: ${errorMessage}`,
        {
          status,
          endpoint: `${method} ${url}`,
          cause: errorMessage,
          suggestion: errorExplanation.suggestion,
          payload: request?.body,
          stack,
        }
      );
    }

    if (response && typeof response.status === 'function') {
      response.status(status).json({
        statusCode: status,
        timestamp: new Date().toISOString(),
        path: url,
        method: method,
        message: errorMessage,
        error: errorDetail,
        suggestion: errorExplanation.suggestion,
      });
    }
  }

  private getSuggestion(status: number, _url: string, message: string): string {
    const lower = message.toLowerCase();
    if (status === 502 || lower.includes('econnrefused') || lower.includes('offline')) {
      return 'The media_cataloger background service appears to be offline. Verify it is running or start it via CLI.';
    }
    if (status === 404) {
      return 'The requested resource or file path could not be found. Check if the file still exists in the library.';
    }
    if (status === 400) {
      return 'Invalid request parameters. Please verify input data and file paths.';
    }
    if (status === 403 || lower.includes('permission') || lower.includes('eacces')) {
      return 'File system permission denied. Ensure the process has read/write permissions.';
    }
    return 'Check Live Pipeline Logs for full stack traces and debug diagnostics.';
  }
}
