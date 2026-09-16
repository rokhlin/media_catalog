import { Injectable, Logger, Inject, BadRequestException, Optional } from '@nestjs/common';
import axios from 'axios';
import * as http from 'http';
import * as https from 'https';
import * as fs from 'fs';
import * as path from 'path';
import { AppConfigService } from '../config/config.service.js';
import { MediaService } from '../media/media.service.js';
import { DatabaseService } from '../database/database.service.js';
import { LogBufferService, LogLevel } from '../logging/log-buffer.service.js';
import { GeminiService } from '../gemini/gemini.service.js';

const noKeepAliveHttpAgent = new http.Agent({ keepAlive: false });
const noKeepAliveHttpsAgent = new https.Agent({ keepAlive: false });

@Injectable()
export class CatalogerClientService {
  private readonly logger = new Logger(CatalogerClientService.name);

  constructor(
    @Inject(AppConfigService) private readonly config: AppConfigService,
    @Inject(MediaService) private readonly mediaService: MediaService,
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(LogBufferService) @Optional() private readonly logBuffer?: LogBufferService,
    @Inject(GeminiService) @Optional() private readonly geminiService?: GeminiService,
  ) {}

  private get baseUrl(): string {
    let url = this.config.catalogerApiUrl.replace(/\/+$/, '');
    if (url && !/^https?:\/\//i.test(url)) {
      url = `http://${url}`;
    }
    return url;
  }

  async triggerRun(force: boolean = false, customPayload?: any, userId?: string, rootPath?: string): Promise<any> {
    const execConfig = this.config.getPipelineExecutionConfig();
    this.logBuffer?.info('Pipeline', `Initiating media catalog synchronization (force=${Boolean(force)})`);

    const scanned = await this.mediaService.scanInputFolders();
    this.logBuffer?.debug('Pipeline', `Found ${scanned.length} media file(s) across input sources`, {
      inputFolders: execConfig.input_folders,
      totalFiles: scanned.length,
    });

    const files = scanned.map(s => {
      let size = 0;
      let mtime = 0;
      try {
        const stat = fs.statSync(s.filePath);
        size = stat.size;
        mtime = stat.mtimeMs / 1000;
      } catch {
        // file stat error
      }
      return {
        file_path: s.filePath,
        folder: s.folder,
        filename: path.basename(s.filePath),
        file_size: size,
        mtime: mtime,
        stream_url: `${execConfig.ui_base_url}/api/media/file?path=${encodeURIComponent(s.filePath)}`,
      };
    });

    const payload = {
      force: Boolean(force),
      total_files: files.length,
      files: files,
      output_folder: execConfig.output_folder,
      settings: execConfig,
      ...(customPayload || {}),
    };

    const runHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
    if (userId) runHeaders['X-User-ID'] = userId;
    if (rootPath) runHeaders['X-User-Root-Path'] = rootPath;

    try {
      this.logger.log(`Triggering BE run: ${files.length} file(s) across input sources -> ${execConfig.output_folder}`);
      this.logBuffer?.debug('Pipeline', `Sending payload to cataloger service at ${this.baseUrl}/api/run`, {
        filesCount: files.length,
        outputFolder: execConfig.output_folder,
        modelProvider: execConfig.model_provider,
        geminiModel: execConfig.gemini_model,
      });

      let res;
      const modesQuery = payload.modes && Array.isArray(payload.modes) && payload.modes.length
        ? `&modes=${encodeURIComponent(payload.modes.join(','))}`
        : '';
      const runUrl = `${this.baseUrl}/api/run?force=${Boolean(force)}${modesQuery}`;
      try {
        res = await axios.post(runUrl, payload, {
          timeout: 20000,
          headers: runHeaders,
          httpAgent: noKeepAliveHttpAgent,
          httpsAgent: noKeepAliveHttpsAgent,
        });
      } catch (postErr: any) {
        if (postErr.message?.includes('socket hang up') || postErr.code === 'ECONNRESET') {
          this.logger.warn(`Initial triggerRun request had socket hang up, retrying on fresh socket: ${postErr.message}`);
          res = await axios.post(runUrl, payload, {
            timeout: 20000,
            headers: runHeaders,
            httpAgent: new http.Agent({ keepAlive: false }),
            httpsAgent: new https.Agent({ keepAlive: false }),
          });
        } else {
          throw postErr;
        }
      }

      this.logBuffer?.info('Pipeline', `Cataloger pipeline started successfully: ${res.data?.message || 'Processing in background'}`, res.data);

      return {
        ...res.data,
        provided_files_count: files.length,
      };
    } catch (err: any) {
      const detail = err.response?.data?.detail || err.response?.data?.error || err.message;
      const status = err.response?.status;
      const errorMsg = `Failed to trigger run on cataloger BE service (HTTP ${status || 'ERR'}): ${detail}`;
      this.logger.error(errorMsg);

      this.logBuffer?.error('Pipeline', errorMsg, {
        status: status || 502,
        endpoint: `POST ${this.baseUrl}/api/run`,
        cause: detail,
        suggestion: status === 502 || !status
          ? 'Check if the media_cataloger background daemon is running on port 8000.'
          : 'Verify execution settings and target folders.',
        stack: err.stack,
      });

      throw new Error(`Cataloger service error (${status || 'Network'}): ${detail}`);
    }
  }

  async triggerAnalyzeFile(file: string, customPayload?: any, userId?: string, rootPath?: string): Promise<any> {
    if (!file || !file.trim()) {
      this.logBuffer?.warn('Pipeline', 'Single file analysis requested with empty file path');
      throw new BadRequestException('File parameter cannot be empty');
    }

    const trimmed = file.trim();
    this.logBuffer?.info('Pipeline', `Initiating single file analysis for: ${trimmed}`);

    const accessCheck = this.mediaService.verifyFileAccess(trimmed);
    if (!accessCheck.accessible || !accessCheck.resolvedPath) {
      const accessErr = `Cannot analyze file: ${accessCheck.error}`;
      this.logger.warn(accessErr);
      this.logBuffer?.error('Pipeline', accessErr, {
        status: 400,
        cause: accessCheck.error,
        suggestion: 'Verify that the file path exists and is inside an approved input directory.',
      });
      throw new BadRequestException(`File access error: ${accessCheck.error}`);
    }

    const resolvedPath = accessCheck.resolvedPath;
    let size = 0;
    let mtime = 0;
    try {
      const stat = fs.statSync(resolvedPath);
      size = stat.size;
      mtime = stat.mtimeMs / 1000;
    } catch (err: any) {
      this.logBuffer?.error('Pipeline', `Failed to read file stat: ${err.message}`, {
        file: resolvedPath,
        cause: err.message,
        stack: err.stack,
      });
      throw new BadRequestException(`Unable to read file stat for '${resolvedPath}': ${err.message}`);
    }

    const execConfig = this.config.getPipelineExecutionConfig();
    const isGeminiProvider = execConfig.model_provider === 'gemini' || (!execConfig.model_provider && Boolean(this.config.geminiApiKey));

    // When Gemini provider is selected, use the Gemini configuration and functionality on the web backend!
    if (isGeminiProvider && this.geminiService && this.config.geminiApiKey) {
      try {
        this.logger.log(`Executing single file analysis via Backend Gemini service: ${resolvedPath}`);
        this.logBuffer?.info('Pipeline', `Executing analysis using Backend Gemini configuration for '${path.basename(resolvedPath)}'`);
        const result = await this.geminiService.analyzeMediaFile(resolvedPath, {
          ...customPayload,
          vision_prompt_template: customPayload?.vision_prompt_template || execConfig.vision_prompt_template,
        });
        return {
          status: 'completed',
          message: `Analysis completed for ${path.basename(resolvedPath)} via backend Gemini service`,
          file: resolvedPath,
          data: result,
        };
      } catch (geminiErr: any) {
        this.logger.warn(`Backend Gemini analysis failed, falling back to AI engine daemon: ${geminiErr.message}`);
        this.logBuffer?.warn('Pipeline', `Backend Gemini analysis failed (${geminiErr.message}), falling back to AI engine daemon...`);
      }
    }

    const payload = {
      file: resolvedPath,
      filename: path.basename(resolvedPath),
      folder: path.dirname(resolvedPath),
      file_size: size,
      mtime: mtime,
      output_folder: execConfig.output_folder,
      settings: execConfig,
      vision_prompt_template: execConfig.vision_prompt_template,
      stream_url: `${execConfig.ui_base_url}/api/media/file?path=${encodeURIComponent(resolvedPath)}`,
      ...(customPayload || {}),
    };

    let requestData: any = payload;
    let requestHeaders: Record<string, string> = { 'Content-Type': 'application/json' };

    // Provide mediafile directly via API upload so AI engine does not require local filesystem mounts or reverse streaming
    if (fs.existsSync(resolvedPath)) {
      try {
        const fileBuffer = await fs.promises.readFile(resolvedPath);
        const formData = new FormData();
        formData.append('file_upload', new Blob([fileBuffer]), path.basename(resolvedPath));
        formData.append('file', resolvedPath);
        formData.append('payload', JSON.stringify(payload));
        requestData = formData;
        requestHeaders = {};
      } catch (readErr: any) {
        this.logger.warn(`Could not load file buffer for direct upload, falling back to JSON payload: ${readErr.message}`);
      }
    }

    if (userId) requestHeaders['X-User-ID'] = userId;
    if (rootPath) requestHeaders['X-User-Root-Path'] = rootPath;

    try {
      this.logger.log(`Triggering single file analysis on BE: ${resolvedPath}`);
      this.logBuffer?.debug('Pipeline', `Sending single-file analysis request to ${this.baseUrl}/api/analyze-file`, {
        file: resolvedPath,
        size,
        directUpload: requestData instanceof FormData,
      });

      let res;
      try {
        res = await axios.post(
          `${this.baseUrl}/api/analyze-file?file=${encodeURIComponent(resolvedPath)}`,
          requestData,
          {
            timeout: 60000,
            headers: requestHeaders,
            httpAgent: noKeepAliveHttpAgent,
            httpsAgent: noKeepAliveHttpsAgent,
            maxContentLength: Infinity,
            maxBodyLength: Infinity,
          }
        );
      } catch (postErr: any) {
        if (postErr.message?.includes('socket hang up') || postErr.code === 'ECONNRESET') {
          this.logger.warn(`Initial analyze-file request had socket hang up, retrying on fresh socket: ${postErr.message}`);
          res = await axios.post(
            `${this.baseUrl}/api/analyze-file?file=${encodeURIComponent(resolvedPath)}`,
            requestData,
            {
              timeout: 60000,
              headers: requestHeaders,
              httpAgent: new http.Agent({ keepAlive: false }),
              httpsAgent: new https.Agent({ keepAlive: false }),
              maxContentLength: Infinity,
              maxBodyLength: Infinity,
            }
          );
        } else {
          throw postErr;
        }
      }

      this.logBuffer?.info('Pipeline', `Single file analysis successfully queued for '${path.basename(resolvedPath)}'`, res.data);

      // Start background watcher to track completion, sync results to local DB, and log found faces + metadata
      this.watchSingleFileAnalysis(resolvedPath, path.basename(resolvedPath), size, mtime);

      return res.data;
    } catch (err: any) {
      const detail = err.response?.data?.detail || err.response?.data?.error || err.message;
      const status = err.response?.status;
      const errMsg = `Failed to trigger file analysis on BE (HTTP ${status || 'ERR'}): ${detail}`;
      this.logger.error(errMsg);

      this.logBuffer?.error('Pipeline', errMsg, {
        status: status || 502,
        endpoint: `POST ${this.baseUrl}/api/analyze-file`,
        targetFile: resolvedPath,
        cause: detail,
        suggestion: 'Verify cataloger daemon is running and file format is supported.',
        stack: err.stack,
      });

      throw new Error(`Cataloger service error (${status || 'Network'}): ${detail}`);
    }
  }

  /**
   * Watch single file analysis in the background, poll until completion,
   * then fetch metadata/faces from the remote engine and persist locally.
   */
  private watchSingleFileAnalysis(filePath: string, filename: string, size: number, mtime: number): void {
    const startTime = Date.now();
    const maxWaitMs = 180000; // 3 minutes timeout
    const pollIntervalMs = 1500;

    const checkLoop = async () => {
      if (Date.now() - startTime > maxWaitMs) {
        this.logger.warn(`Single file analysis watch timeout for '${filename}'`);
        return;
      }

      try {
        const statusRes = await axios.get(`${this.baseUrl}/api/status`, { timeout: 3000 });
        const st = statusRes.data;

        // If currently running this task, continue polling
        if (st.status === 'running' && st.current_task === 'analyze_file') {
          setTimeout(checkLoop, pollIntervalMs);
          return;
        }

        // If completed or idle, attempt to fetch the resulting sidecar and faces
        const synced = await this.syncRemoteFileAnalysis(filePath, size, mtime);
        if (synced) {
          const faces = synced.faces || [];
          const faceNames = faces.map((f: any) => f.name || f.person_name || f.face_id).filter(Boolean);
          const faceSummary = faceNames.length > 0 ? faceNames.join(', ') : 'No faces detected';
          const summary = synced.gemini_analysis?.summary || synced.summary || 'Metadata extracted';

          this.logger.log(`Single-file analysis completed for '${filename}': ${faces.length} face(s), summary: "${summary}"`);
          this.logBuffer?.info(
            'Pipeline',
            `Single file analysis completed for '${filename}': Found ${faces.length} face(s) (${faceSummary}). Summary: "${summary}"`,
            {
              file: filePath,
              filename,
              facesCount: faces.length,
              faces: faceNames,
              summary,
              description: synced.gemini_analysis?.description || synced.description,
              environment: synced.gemini_analysis?.environment || synced.environment,
              lighting: synced.gemini_analysis?.lighting || synced.lighting,
              sidecar_path: synced._local_sidecar_path,
            }
          );
          return;
        }

        // If not found yet and still within short window, retry
        if (Date.now() - startTime < 15000) {
          setTimeout(checkLoop, pollIntervalMs);
        }
      } catch (err: any) {
        this.logger.warn(`Error during single file analysis watch for '${filename}': ${err.message}`);
      }
    };

    setTimeout(checkLoop, pollIntervalMs);
  }

  /**
   * Directly analyze a media file via Python AI Engine with structured tag formatting and target tag criteria.
   */
  async analyzeWithTags(
    file: string,
    options?: { target_tags?: string[]; tag_format?: 'categorized' | 'flat' | 'prefixed'; settings?: any }
  ): Promise<any> {
    if (!file || !file.trim()) {
      throw new BadRequestException('File parameter cannot be empty');
    }

    const accessCheck = this.mediaService.verifyFileAccess(file.trim());
    if (!accessCheck.accessible || !accessCheck.resolvedPath) {
      throw new BadRequestException(`File access error: ${accessCheck.error}`);
    }

    const resolvedPath = accessCheck.resolvedPath;
    const execConfig = this.config.getPipelineExecutionConfig();
    const isGeminiProvider = execConfig.model_provider === 'gemini' || (!execConfig.model_provider && Boolean(this.config.geminiApiKey));

    if (isGeminiProvider && this.geminiService && this.config.geminiApiKey) {
      try {
        this.logger.log(`Executing AI tag recognition via Backend Gemini service for '${path.basename(resolvedPath)}'`);
        const photoAnalysis = await this.geminiService.analyzePhoto(
          resolvedPath,
          null,
          options?.target_tags,
          options?.tag_format || 'categorized'
        );
        return {
          status: 'success',
          file: resolvedPath,
          tags: photoAnalysis.tags,
          analysis: photoAnalysis,
        };
      } catch (err: any) {
        this.logger.warn(`Backend Gemini tag analysis failed, falling back to AI engine daemon: ${err.message}`);
      }
    }

    const payload = {
      file: resolvedPath,
      target_tags: options?.target_tags,
      tag_format: options?.tag_format || 'categorized',
      output_folder: execConfig.output_folder,
      vision_prompt_template: execConfig.vision_prompt_template,
      settings: { ...execConfig, ...(options?.settings || {}) },
    };

    try {
      this.logger.log(`Executing AI tag recognition for '${path.basename(resolvedPath)}' with format '${payload.tag_format}'`);
      const res = await axios.post(`${this.baseUrl}/api/ai/analyze-with-tags`, payload, {
        timeout: 60000,
        headers: { 'Content-Type': 'application/json' },
      });
      return res.data;
    } catch (err: any) {
      const detail = err.response?.data?.detail || err.response?.data?.error || err.message;
      this.logger.error(`AI tag recognition failed for '${resolvedPath}': ${detail}`);
      throw new Error(`AI tag analysis failed: ${detail}`);
    }
  }

  /**
   * Sync sidecar JSON, face records, and thumbnails from remote cataloger backend to local disk and SQLite DB.
   */
  async syncRemoteFileAnalysis(filePath: string, fileSize?: number, mtime?: number): Promise<any> {
    const filename = path.basename(filePath);
    try {
      const sidecarRes = await axios.get(
        `${this.baseUrl}/api/media/sidecar?file=${encodeURIComponent(filePath)}`,
        { timeout: 5000 }
      );

      if (!sidecarRes.data || typeof sidecarRes.data !== 'object') {
        return null;
      }

      const sidecarData = sidecarRes.data;
      const resolvedSize = fileSize || sidecarData.file_size || 0;
      const resolvedMtime = mtime || sidecarData.mtime || Date.now() / 1000;

      // 1. Ensure output folder exists and write local sidecar JSON
      const outFolder = this.config.outputFolder;
      if (!fs.existsSync(outFolder)) {
        fs.mkdirSync(outFolder, { recursive: true });
      }
      const localSidecarPath = path.join(outFolder, `${filename}.json`);
      try {
        fs.writeFileSync(localSidecarPath, JSON.stringify(sidecarData, null, 2), 'utf-8');
      } catch (err: any) {
        this.logger.warn(`Failed to write local sidecar file '${localSidecarPath}': ${err.message}`);
      }

      // 2. Fetch face detections from remote backend
      let facesList = Array.isArray(sidecarData.faces) ? sidecarData.faces : [];
      try {
        const facesRes = await axios.get(
          `${this.baseUrl}/api/media/faces-for-file?file=${encodeURIComponent(filePath)}`,
          { timeout: 4000 }
        );
        if (Array.isArray(facesRes.data) && facesRes.data.length > 0) {
          facesList = facesRes.data;
        }
      } catch {
        // use sidecarData.faces fallback
      }

      // 3. Download/sync face crop images to local faces directory
      const facesFolder = this.config.facesFolder;
      if (!fs.existsSync(facesFolder)) {
        fs.mkdirSync(facesFolder, { recursive: true });
      }

      for (const face of facesList) {
        const faceImgName = path.basename(face.image_path || `${face.face_id || face.id}.jpg`);
        if (faceImgName && !fs.existsSync(path.join(facesFolder, faceImgName))) {
          try {
            const imgRes = await axios.get(
              `${this.baseUrl}/api/faces/image/${encodeURIComponent(faceImgName)}`,
              { responseType: 'arraybuffer', timeout: 4000 }
            );
            if (imgRes.data && imgRes.data.length > 0) {
              fs.writeFileSync(path.join(facesFolder, faceImgName), Buffer.from(imgRes.data));
            }
          } catch {
            // ignore individual image download errors
          }
        }
      }

      // 4. Ingest into local SQLite Database
      this.db.initDb();
      this.db.saveSyncRecord({
        filePath: filePath,
        fileSize: resolvedSize,
        mtime: resolvedMtime,
        status: 'PROCESSED',
        sidecarPath: localSidecarPath,
      });

      const ga = sidecarData.gemini_analysis || sidecarData.analysis || sidecarData.metadata || {};
      this.db.saveMediaMetadata(filePath, {
        summary: ga.summary || sidecarData.summary,
        summary_ru: ga.summary_ru || sidecarData.summary_ru,
        description: ga.description || sidecarData.description,
        description_ru: ga.description_ru || sidecarData.description_ru,
        environment: ga.environment || sidecarData.environment,
        lighting: ga.lighting || sidecarData.lighting,
        lighting_ru: ga.lighting_ru || sidecarData.lighting_ru,
        weather: ga.weather || sidecarData.weather,
        weather_ru: ga.weather_ru || sidecarData.weather_ru,
        time_of_day: ga.time_of_day || sidecarData.time_of_day,
        time_of_day_ru: ga.time_of_day_ru || sidecarData.time_of_day_ru,
        ocr_text: ga.ocr_text || sidecarData.ocr_text,
        exif_analysis: ga.exif_analysis || sidecarData.exif_analysis,
        exif_analysis_ru: ga.exif_analysis_ru || sidecarData.exif_analysis_ru,
        transcription: ga.transcription || sidecarData.transcription,
        transcription_ru: ga.transcription_ru || sidecarData.transcription_ru,
        timeline_events: ga.timeline_events || sidecarData.timeline_events,
        camera_make: sidecarData.exif?.camera_make || null,
        camera_model: sidecarData.exif?.camera_model || null,
        location_name: ga.location_name || null,
        media_type: sidecarData.media_type || 'image',
        file_size: resolvedSize,
        mtime: resolvedMtime,
      });

      if (facesList && facesList.length > 0) {
        this.db.saveMediaFaces(filePath, facesList);
      }

      const tagsList = Array.isArray(sidecarData.tags)
        ? sidecarData.tags
        : Array.isArray(ga.tags)
        ? ga.tags
        : [];
      if (tagsList && tagsList.length > 0) {
        this.db.saveMediaTags(filePath, tagsList);
      }

      // Invalidate media scan cache and update single item in MediaService
      this.mediaService.invalidateCache();
      try {
        await this.mediaService.getMediaFileInfo(filePath);
      } catch {}

      return {
        ...sidecarData,
        faces: facesList,
        _local_sidecar_path: localSidecarPath,
      };
    } catch (err: any) {
      this.logger.debug(`Could not sync remote sidecar for '${filePath}': ${err.message}`);
      return null;
    }
  }

  async pause(): Promise<any> {
    this.logBuffer?.info('Pipeline', 'Pausing pipeline execution');
    try {
      const res = await axios.post(`${this.baseUrl}/api/pause`, {}, { timeout: 10000 });
      this.logBuffer?.info('Pipeline', 'Pipeline paused successfully');
      return res.data;
    } catch (err: any) {
      const msg = err.response?.data?.detail || err.message;
      this.logBuffer?.error('Pipeline', `Failed to pause pipeline: ${msg}`, { cause: msg, stack: err.stack });
      throw new Error(`Cataloger service error: ${msg}`);
    }
  }

  async resume(): Promise<any> {
    this.logBuffer?.info('Pipeline', 'Resuming pipeline execution');
    try {
      const res = await axios.post(`${this.baseUrl}/api/resume`, {}, { timeout: 10000 });
      this.logBuffer?.info('Pipeline', 'Pipeline resumed successfully');
      return res.data;
    } catch (err: any) {
      const msg = err.response?.data?.detail || err.message;
      this.logBuffer?.error('Pipeline', `Failed to resume pipeline: ${msg}`, { cause: msg, stack: err.stack });
      throw new Error(`Cataloger service error: ${msg}`);
    }
  }

  async stop(): Promise<any> {
    this.logBuffer?.info('Pipeline', 'Stopping pipeline execution');
    try {
      const res = await axios.post(`${this.baseUrl}/api/stop`, {}, { timeout: 10000 });
      this.logBuffer?.info('Pipeline', 'Pipeline stopped successfully');
      return res.data;
    } catch (err: any) {
      const msg = err.response?.data?.detail || err.message;
      this.logBuffer?.error('Pipeline', `Failed to stop pipeline: ${msg}`, { cause: msg, stack: err.stack });
      throw new Error(`Cataloger service error: ${msg}`);
    }
  }

  async validateConnection(): Promise<{
    connected: boolean;
    cataloger_url: string;
    message: string;
    details?: any;
    latency_ms?: number;
  }> {
    const startTime = Date.now();
    try {
      const res = await axios.get(`${this.baseUrl}/api/status`, { timeout: 4000 });
      const latencyMs = Date.now() - startTime;
      return {
        connected: true,
        cataloger_url: this.baseUrl,
        message: `Successfully connected to media_cataloger service (${latencyMs}ms)`,
        details: res.data,
        latency_ms: latencyMs,
      };
    } catch (err: any) {
      return {
        connected: false,
        cataloger_url: this.baseUrl,
        message: `Unable to reach media_cataloger service at ${this.baseUrl}: ${err.message}`,
      };
    }
  }

  async getStatus(): Promise<any> {
    try {
      const res = await axios.get(`${this.baseUrl}/api/status`, { timeout: 4000 });
      return {
        ...res.data,
        connected: true,
        cataloger_url: this.baseUrl,
      };
    } catch (err: any) {
      // Return idle fallback if cataloger service is offline or starting
      return {
        status: 'idle',
        connected: false,
        cataloger_url: this.baseUrl,
        current_task: null,
        started_at: null,
        finished_at: null,
        error: null,
        target_file: null,
        progress: {
          current: 0,
          total: 0,
          percent: 0,
          current_file: '',
          stage: 'Cataloger service offline or idle',
        },
      };
    }
  }

  async getLogs(level?: LogLevel | 'ALL'): Promise<{ logs: string; entries?: any[] }> {
    // If we have buffer entries in LogBufferService, combine with remote/file logs
    const bufferResult = this.logBuffer ? this.logBuffer.getLogs(level) : null;

    let remoteLogsText = '';
    // Try cataloger service endpoint first
    try {
      const res = await axios.get(`${this.baseUrl}/api/logs`, { timeout: 4000 });
      if (res.data && typeof res.data.logs === 'string') {
        remoteLogsText = res.data.logs;
      }
    } catch {
      // Fallback to local log file in media_output
      const logPath = path.join(this.config.outputFolder, 'cataloger_run.log');
      if (fs.existsSync(logPath)) {
        try {
          const content = fs.readFileSync(logPath, 'utf-8');
          const lines = content.split('\n');
          remoteLogsText = lines.slice(-300).join('\n');
        } catch {
          // ignore
        }
      }
    }

    const cleanRemote = (remoteLogsText || '').trim();
    const hasValidRemote = cleanRemote && !cleanRemote.includes('Log file not found');

    if (bufferResult && bufferResult.entries.length > 0) {
      if (hasValidRemote) {
        // Merge in-memory request logs and remote worker engine logs seamlessly
        const mergedText = `${bufferResult.logs}\n\n--- Cataloger Worker Engine Logs ---\n${cleanRemote}`;
        return {
          logs: mergedText,
          entries: bufferResult.entries,
        };
      }
      return {
        logs: bufferResult.logs,
        entries: bufferResult.entries,
      };
    }

    if (hasValidRemote) {
      return { logs: cleanRemote };
    }

    return { logs: bufferResult?.logs || 'No active cataloger logs found.' };
  }

  async clearLogs(): Promise<{ status: string; message: string }> {
    if (this.logBuffer) {
      this.logBuffer.clearLogs();
    }

    try {
      const res = await axios.post(`${this.baseUrl}/api/logs/clear`, {}, { timeout: 4000 });
      if (res.data) {
        return res.data;
      }
    } catch {
      // Fallback to local log file in media_output
    }

    const logPath = path.join(this.config.outputFolder, 'cataloger_run.log');
    if (fs.existsSync(logPath)) {
      try {
        fs.writeFileSync(logPath, '', 'utf-8');
        return { status: 'success', message: 'Local logs cleared' };
      } catch (err) {
        return { status: 'error', message: `Error clearing local log file: ${err}` };
      }
    }

    return { status: 'success', message: 'Logs cleared' };
  }
}

