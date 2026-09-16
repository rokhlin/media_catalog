import { Injectable, Inject, Optional } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { AppConfigService } from '../config/config.service.js';

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

export interface LogEntry {
  id: string;
  timestamp: string;
  level: LogLevel;
  context: string;
  message: string;
  details?: string | Record<string, any>;
  stack?: string;
  raw: string;
}

export interface DetailedErrorOptions {
  status?: number | string;
  context?: string;
  endpoint?: string;
  cause?: string;
  suggestion?: string;
  stack?: string;
  payload?: any;
  [key: string]: any;
}

@Injectable()
export class LogBufferService {
  private readonly buffer: LogEntry[] = [];
  private readonly maxBufferSize = 2000;
  private logFilePath: string | null = null;

  constructor(@Inject(AppConfigService) @Optional() private readonly config?: AppConfigService) {
    if (this.config?.outputFolder) {
      try {
        if (!fs.existsSync(this.config.outputFolder)) {
          fs.mkdirSync(this.config.outputFolder, { recursive: true });
        }
        this.logFilePath = path.join(this.config.outputFolder, 'cataloger_run.log');
      } catch {
        this.logFilePath = null;
      }
    }
  }

  private formatTimestamp(date: Date = new Date()): string {
    const pad = (n: number) => n.toString().padStart(2, '0');
    const yyyy = date.getFullYear();
    const mm = pad(date.getMonth() + 1);
    const dd = pad(date.getDate());
    const hh = pad(date.getHours());
    const min = pad(date.getMinutes());
    const ss = pad(date.getSeconds());
    return `${yyyy}-${mm}-${dd} ${hh}:${min}:${ss}`;
  }

  private appendToFile(line: string) {
    if (!this.logFilePath) return;
    try {
      fs.appendFileSync(this.logFilePath, line + '\n', 'utf-8');
    } catch {
      // Ignore file write errors
    }
  }

  public log(level: LogLevel, context: string, message: string, details?: string | Record<string, any>, stack?: string): LogEntry {
    const timestamp = this.formatTimestamp();
    const contextTag = context ? `[${context}]` : '[Server]';
    let formattedDetails = '';

    if (details) {
      if (typeof details === 'string') {
        formattedDetails = `\n  Details: ${details}`;
      } else {
        try {
          formattedDetails = `\n  Details: ${JSON.stringify(details, null, 2).replace(/\n/g, '\n  ')}`;
        } catch {
          formattedDetails = `\n  Details: [Object]`;
        }
      }
    }

    let formattedStack = '';
    if (stack) {
      formattedStack = `\n  Stack Trace:\n    ${stack.split('\n').map(s => s.trim()).filter(Boolean).join('\n    ')}`;
    }

    const raw = `[${timestamp}] [${level}] ${contextTag} ${message}${formattedDetails}${formattedStack}`;

    const entry: LogEntry = {
      id: `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      timestamp,
      level,
      context,
      message,
      details,
      stack,
      raw,
    };

    this.buffer.push(entry);
    if (this.buffer.length > this.maxBufferSize) {
      this.buffer.splice(0, this.buffer.length - this.maxBufferSize);
    }

    this.appendToFile(raw);
    return entry;
  }

  public debug(context: string, message: string, details?: any): LogEntry {
    return this.log('DEBUG', context, message, details);
  }

  public info(context: string, message: string, details?: any): LogEntry {
    return this.log('INFO', context, message, details);
  }

  public warn(context: string, message: string, details?: any): LogEntry {
    return this.log('WARN', context, message, details);
  }

  public error(
    context: string,
    message: string,
    errorOrOptions?: Error | DetailedErrorOptions | string,
    extraDetails?: any
  ): LogEntry {
    let stack: string | undefined;
    let details: Record<string, any> | string | undefined;

    if (errorOrOptions instanceof Error) {
      stack = errorOrOptions.stack;
      details = {
        name: errorOrOptions.name,
        message: errorOrOptions.message,
        cause: (errorOrOptions as any).cause || extraDetails,
      };
    } else if (typeof errorOrOptions === 'object' && errorOrOptions !== null) {
      stack = errorOrOptions.stack;
      details = {
        status: errorOrOptions.status,
        endpoint: errorOrOptions.endpoint,
        cause: errorOrOptions.cause,
        suggestion: errorOrOptions.suggestion,
        payload: errorOrOptions.payload,
        ...extraDetails,
      };
    } else if (typeof errorOrOptions === 'string') {
      details = errorOrOptions;
    }

    return this.log('ERROR', context, message, details, stack);
  }

  public getLogs(filterLevel?: LogLevel | 'ALL', limit: number = 500): { logs: string; entries: LogEntry[] } {
    let filtered = this.buffer;
    if (filterLevel && filterLevel !== 'ALL') {
      filtered = this.buffer.filter(e => e.level === filterLevel);
    }

    const sliced = filtered.slice(-limit);
    const text = sliced.map(e => e.raw).join('\n');

    return {
      logs: text || (this.buffer.length === 0 ? 'No logs recorded yet.' : ''),
      entries: sliced,
    };
  }

  public clearLogs(): { status: string; message: string } {
    this.buffer.length = 0;
    if (this.logFilePath && fs.existsSync(this.logFilePath)) {
      try {
        fs.writeFileSync(this.logFilePath, '', 'utf-8');
      } catch {
        // Ignore file errors
      }
    }
    return { status: 'success', message: 'Logs cleared successfully' };
  }

  public setLogFilePath(filePath: string) {
    this.logFilePath = filePath;
  }
}
