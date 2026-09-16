import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as http from 'node:http';
import { CatalogerClientService } from '../cataloger.service.js';

describe('CatalogerClientService', () => {
  let catalogerService: CatalogerClientService;
  let offlineService: CatalogerClientService;
  let server: http.Server;
  let serverUrl: string;
  let tmpDir: string;
  let logFile: string;

  before(async () => {
    tmpDir = path.join(process.cwd(), 'media_output', `test_cataloger_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`);
    fs.mkdirSync(tmpDir, { recursive: true });
    logFile = path.join(tmpDir, 'cataloger_run.log');

    // Create local mock HTTP server for Cataloger service API
    server = http.createServer((req, res) => {
      res.setHeader('Content-Type', 'application/json');
      if (req.url?.startsWith('/api/run')) {
        res.writeHead(200);
        res.end(JSON.stringify({ status: 'started', message: 'Sync started' }));
      } else if (req.url?.startsWith('/api/analyze-file')) {
        res.writeHead(200);
        res.end(JSON.stringify({ status: 'analyzing', file: 'test.jpg' }));
      } else if (req.url === '/api/pause') {
        res.writeHead(200);
        res.end(JSON.stringify({ status: 'paused' }));
      } else if (req.url === '/api/resume') {
        res.writeHead(200);
        res.end(JSON.stringify({ status: 'resumed' }));
      } else if (req.url === '/api/stop') {
        res.writeHead(200);
        res.end(JSON.stringify({ status: 'stopped' }));
      } else if (req.url === '/api/status') {
        res.writeHead(200);
        res.end(JSON.stringify({
          status: 'running',
          current_task: 'sync',
          started_at: '2026-08-29T20:00:00Z',
          finished_at: null,
          error: null,
          target_file: 'photo.jpg',
          progress: { current: 5, total: 10, percent: 50, current_file: 'photo.jpg', stage: 'processing' }
        }));
      } else if (req.url === '/api/logs') {
        res.writeHead(200);
        res.end(JSON.stringify({ logs: 'Server log line 1\nServer log line 2' }));
      } else if (req.url === '/api/logs/clear') {
        res.writeHead(200);
        res.end(JSON.stringify({ status: 'success', message: 'Server logs cleared' }));
      } else {
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'Not found' }));
      }
    });

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address() as { port: number; address: string };
        serverUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });

    // Create test image in tmpDir
    fs.writeFileSync(path.join(tmpDir, 'test.jpg'), 'fake image content');

    const mockConfig = {
      catalogerApiUrl: serverUrl,
      outputFolder: tmpDir,
      getPipelineExecutionConfig: () => ({
        output_folder: tmpDir,
        model_provider: 'gemini',
        gemini_model: 'gemini-3.6-flash',
        ui_base_url: 'http://localhost:8000',
      }),
    } as any;

    const mockMediaService = {
      scanInputFolders: () => [
        { filePath: path.join(tmpDir, 'test.jpg'), folder: tmpDir },
      ],
      verifyFileAccess: (target: string) => {
        if (target.includes('nonexistent')) {
          return { accessible: false, error: `File '${target}' is not accessible or not found` };
        }
        return { accessible: true, resolvedPath: path.join(tmpDir, 'test.jpg') };
      },
    } as any;

    const offlineConfig = {
      catalogerApiUrl: 'http://127.0.0.1:1', // dummy offline endpoint for fallback testing
      outputFolder: tmpDir,
      getPipelineExecutionConfig: () => ({ output_folder: tmpDir }),
    } as any;

    const mockDbService = {
      initDb: () => {},
      saveSyncRecord: () => {},
      saveMediaMetadata: () => {},
      saveMediaFaces: () => {},
    } as any;

    catalogerService = new CatalogerClientService(mockConfig, mockMediaService, mockDbService);
    offlineService = new CatalogerClientService(offlineConfig, mockMediaService, mockDbService);
  });

  after(async () => {
    try {
      if (server) {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
      if (fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    } catch {
      // ignore
    }
  });

  it('should get status from mock cataloger service', async () => {
    const status = await catalogerService.getStatus();
    assert.strictEqual(status.status, 'running');
    assert.strictEqual(status.current_task, 'sync');
    assert.strictEqual(status.progress.percent, 50);
  });

  it('should trigger run on mock cataloger service with media files payload', async () => {
    const res = await catalogerService.triggerRun(true);
    assert.strictEqual(res.status, 'started');
    assert.strictEqual(res.message, 'Sync started');
    assert.strictEqual(res.provided_files_count, 1);
  });

  it('should trigger file analysis on mock cataloger service', async () => {
    const res = await catalogerService.triggerAnalyzeFile('test.jpg');
    assert.strictEqual(res.status, 'analyzing');
  });

  it('should reject file analysis with BadRequestException if file is not accessible', async () => {
    await assert.rejects(
      async () => {
        await catalogerService.triggerAnalyzeFile('nonexistent_image.png');
      },
      (err: any) => {
        assert.ok(err.message.includes('File access error') || err.message.includes('not accessible'));
        return true;
      }
    );
  });

  it('should handle pause, resume, and stop controls', async () => {
    const pauseRes = await catalogerService.pause();
    assert.strictEqual(pauseRes.status, 'paused');

    const resumeRes = await catalogerService.resume();
    assert.strictEqual(resumeRes.status, 'resumed');

    const stopRes = await catalogerService.stop();
    assert.strictEqual(stopRes.status, 'stopped');
  });

  it('should fetch remote logs and clear remote logs from mock service', async () => {
    const logsRes = await catalogerService.getLogs();
    assert.ok(logsRes.logs.includes('Server log line 1'));

    const clearRes = await catalogerService.clearLogs();
    assert.strictEqual(clearRes.status, 'success');
  });

  it('should return idle fallback structure when cataloger service is offline', async () => {
    const status = await offlineService.getStatus();
    assert.strictEqual(status.status, 'idle');
    assert.strictEqual(status.current_task, null);
    assert.ok(status.progress, 'progress object should exist');
    assert.strictEqual(status.progress.current, 0);
    assert.ok(status.progress.stage.includes('offline') || status.progress.stage.includes('idle'));
  });

  it('should read fallback logs from local file if remote service is offline', async () => {
    fs.writeFileSync(logFile, 'Line 1: Starting sync\nLine 2: Processed item_1\nLine 3: Complete');

    const logRes = await offlineService.getLogs();
    assert.ok(logRes.logs.includes('Starting sync'));
    assert.ok(logRes.logs.includes('Processed item_1'));
  });

  it('should validate connection successfully when cataloger service is online', async () => {
    const val = await catalogerService.validateConnection();
    assert.strictEqual(val.connected, true);
    assert.ok(val.cataloger_url);
    assert.ok(val.message.includes('Successfully connected'));
    assert.ok(typeof val.latency_ms === 'number');
  });

  it('should report failure gracefully when validating connection to offline cataloger service', async () => {
    const val = await offlineService.validateConnection();
    assert.strictEqual(val.connected, false);
    assert.ok(val.message.includes('Unable to reach'));
  });

  it('should clear local logs file if remote service is offline', async () => {
    fs.writeFileSync(logFile, 'Some old logs to clear');
    assert.ok(fs.readFileSync(logFile, 'utf-8').length > 0);

    const clearRes = await offlineService.clearLogs();
    assert.strictEqual(clearRes.status, 'success');
    assert.strictEqual(fs.readFileSync(logFile, 'utf-8'), '');
  });
});
