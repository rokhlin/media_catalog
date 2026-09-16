import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { LogBufferService } from '../log-buffer.service.js';
import { AllExceptionsFilter } from '../all-exceptions.filter.js';
import { HttpException, HttpStatus } from '@nestjs/common';

describe('LogBufferService & Error Interception', () => {
  let logBuffer: LogBufferService;
  let tmpDir: string;
  let logFilePath: string;

  beforeEach(() => {
    tmpDir = path.join(
      process.cwd(),
      'media_output',
      `test_logs_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`
    );
    fs.mkdirSync(tmpDir, { recursive: true });
    logFilePath = path.join(tmpDir, 'cataloger_run.log');

    const mockConfig = {
      outputFolder: tmpDir,
    } as any;

    logBuffer = new LogBufferService(mockConfig);
  });

  afterEach(() => {
    try {
      if (fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    } catch {
      // ignore
    }
  });

  it('should format and store INFO, DEBUG, WARN, and ERROR logs with proper tags and timestamps', () => {
    logBuffer.info('TestModule', 'Informational message');
    logBuffer.debug('TestModule', 'Debug diagnostic details', { param1: 'value1', count: 42 });
    logBuffer.warn('TestModule', 'Warning condition detected');
    logBuffer.error('TestModule', 'Error occurred during processing', new Error('Simulated failure'));

    const allLogs = logBuffer.getLogs('ALL');
    assert.strictEqual(allLogs.entries.length, 4);

    assert.strictEqual(allLogs.entries[0].level, 'INFO');
    assert.ok(allLogs.entries[0].raw.includes('[INFO]'));
    assert.ok(allLogs.entries[0].raw.includes('[TestModule] Informational message'));

    assert.strictEqual(allLogs.entries[1].level, 'DEBUG');
    assert.ok(allLogs.entries[1].raw.includes('[DEBUG]'));
    assert.ok(allLogs.entries[1].raw.includes('param1'));

    assert.strictEqual(allLogs.entries[2].level, 'WARN');
    assert.ok(allLogs.entries[2].raw.includes('[WARN]'));

    assert.strictEqual(allLogs.entries[3].level, 'ERROR');
    assert.ok(allLogs.entries[3].raw.includes('[ERROR]'));
    assert.ok(allLogs.entries[3].raw.includes('Simulated failure'));
  });

  it('should split logs by level (DEBUG vs INFO vs ERROR vs WARN)', () => {
    logBuffer.info('Sync', 'Starting sync task');
    logBuffer.debug('Sync', 'Enumerating file #1: photo1.jpg');
    logBuffer.debug('Sync', 'Enumerating file #2: photo2.jpg');
    logBuffer.warn('Sync', 'Skipping corrupt file: bad.xyz');
    logBuffer.error('Sync', 'Cataloger execution failed', { status: 502, cause: 'Backend offline' });

    const infoOnly = logBuffer.getLogs('INFO');
    assert.strictEqual(infoOnly.entries.length, 1);
    assert.strictEqual(infoOnly.entries[0].level, 'INFO');

    const debugOnly = logBuffer.getLogs('DEBUG');
    assert.strictEqual(debugOnly.entries.length, 2);
    assert.ok(debugOnly.entries.every((e) => e.level === 'DEBUG'));

    const errorOnly = logBuffer.getLogs('ERROR');
    assert.strictEqual(errorOnly.entries.length, 1);
    assert.strictEqual(errorOnly.entries[0].level, 'ERROR');
    assert.ok(errorOnly.entries[0].raw.includes('Backend offline'));

    const warnOnly = logBuffer.getLogs('WARN');
    assert.strictEqual(warnOnly.entries.length, 1);
    assert.strictEqual(warnOnly.entries[0].level, 'WARN');
  });

  it('should record detailed error explanations including HTTP status, suggestions, and stack traces', () => {
    const customErr = new Error('Database locked');
    logBuffer.error('Database', 'Failed to commit transaction', {
      status: 500,
      endpoint: 'POST /api/faces/assign',
      cause: 'SQLite DB busy during concurrent lock',
      suggestion: 'Retry with backoff or check if another write is active',
      stack: customErr.stack,
    });

    const errorLogs = logBuffer.getLogs('ERROR');
    const entry = errorLogs.entries[0];

    assert.ok(entry.raw.includes('Failed to commit transaction'));
    assert.ok(entry.raw.includes('Details:'));
    assert.ok(entry.raw.includes('SQLite DB busy during concurrent lock'));
    assert.ok(entry.raw.includes('Retry with backoff'));
    assert.ok(entry.raw.includes('Stack Trace:'));
  });

  it('should persist logs to cataloger_run.log on disk', () => {
    logBuffer.info('FileTest', 'Logging to persistent disk file');
    assert.ok(fs.existsSync(logFilePath), 'cataloger_run.log must be created');

    const fileContent = fs.readFileSync(logFilePath, 'utf-8');
    assert.ok(fileContent.includes('[INFO]'));
    assert.ok(fileContent.includes('Logging to persistent disk file'));
  });

  it('should clear in-memory buffer and truncate disk log file', () => {
    logBuffer.info('Test', 'Line 1');
    logBuffer.debug('Test', 'Line 2');
    assert.strictEqual(logBuffer.getLogs('ALL').entries.length, 2);

    const clearRes = logBuffer.clearLogs();
    assert.strictEqual(clearRes.status, 'success');
    assert.strictEqual(logBuffer.getLogs('ALL').entries.length, 0);

    if (fs.existsSync(logFilePath)) {
      assert.strictEqual(fs.readFileSync(logFilePath, 'utf-8'), '');
    }
  });

  it('should intercept exceptions and format detailed error explanations in AllExceptionsFilter', () => {
    const filter = new AllExceptionsFilter(logBuffer);

    let capturedStatus: number | null = null;
    let capturedResponse: any = null;

    const mockResponse = {
      status: (code: number) => {
        capturedStatus = code;
        return {
          json: (body: any) => {
            capturedResponse = body;
          },
        };
      },
    } as any;

    const mockRequest = {
      method: 'POST',
      url: '/api/run',
      originalUrl: '/api/run',
      ip: '127.0.0.1',
      body: { force: true },
    } as any;

    const mockHost = {
      switchToHttp: () => ({
        getRequest: () => mockRequest,
        getResponse: () => mockResponse,
      }),
    } as any;

    const exception = new HttpException('Cataloger service unreachable', HttpStatus.BAD_GATEWAY);
    filter.catch(exception, mockHost);

    assert.strictEqual(capturedStatus, 502);
    assert.strictEqual(capturedResponse.statusCode, 502);
    assert.strictEqual(capturedResponse.message, 'Cataloger service unreachable');
    assert.ok(capturedResponse.suggestion.includes('media_cataloger background service appears to be offline'));

    // Check that exception was intercepted and logged to Live Pipeline Logs
    const interceptedLogs = logBuffer.getLogs('ERROR');
    assert.strictEqual(interceptedLogs.entries.length, 1);
    assert.ok(interceptedLogs.entries[0].raw.includes('[ErrorInterceptor]'));
    assert.ok(interceptedLogs.entries[0].raw.includes('Intercepted 502 error on POST /api/run'));
    assert.ok(interceptedLogs.entries[0].raw.includes('media_cataloger background service appears to be offline'));
  });
});
