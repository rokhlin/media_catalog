import { Injectable, Logger, Inject, Optional } from '@nestjs/common';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';
import { AppConfigService, normalizeConfigPath } from '../config/config.service.js';
import { DatabaseService } from '../database/database.service.js';
import { MediaService } from '../media/media.service.js';
import { UserWorkspaceService } from '../workspace/user-workspace.service.js';

const execAsync = promisify(exec);

export { DEFAULT_VISION_PROMPT_TEMPLATE } from '../config/config.service.js';
import { DEFAULT_VISION_PROMPT_TEMPLATE } from '../config/config.service.js';

export interface DirectoryBrowseResult {
  current_path: string;
  parent_path: string | null;
  shortcuts: Array<{ label: string; path: string }>;
  directories: string[];
  files: string[];
  error?: string;
  user_workspace?: {
    userId: string;
    rootDir: string;
    mediaDir: string;
    catalogDir: string;
  } | null;
}

@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);

  constructor(
    @Inject(AppConfigService) private readonly config: AppConfigService,
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Optional() @Inject(MediaService) private readonly mediaService?: MediaService,
    @Optional() @Inject(UserWorkspaceService) private readonly workspaceService?: UserWorkspaceService,
  ) { }

  getSettings(user?: any) {
    const saved = this.config.getSavedSettings();
    const envInputs = (process.env.INPUT_FOLDERS || '')
      .split(',')
      .map(p => p.trim())
      .filter(Boolean);
    const defaultInputs = envInputs.length > 0
      ? envInputs.map(p => normalizeConfigPath(p, this.config.projectRoot, { isDev: this.config.isDev, fallbackType: 'input' }))
      : [this.config.isDev ? normalizeConfigPath('media_input', this.config.projectRoot, { isDev: true }) : '/app/media_input'];
    const defaultOutput = process.env.OUTPUT_FOLDER 
      ? normalizeConfigPath(process.env.OUTPUT_FOLDER, this.config.projectRoot, { isDev: this.config.isDev, fallbackType: 'output' })
      : (this.config.isDev ? normalizeConfigPath('media_output', this.config.projectRoot, { isDev: true }) : '/app/media_output');

    return {
      input_folders: this.config.inputFolders.map(p => String(p)),
      output_folder: String(this.config.outputFolder),
      default_input_folders: defaultInputs.map(p => String(p)),
      default_output_folder: String(defaultOutput),
      is_custom_input: Boolean(saved.INPUT_FOLDERS || saved.input_folders),
      is_custom_output: Boolean(saved.OUTPUT_FOLDER || saved.output_folder),
      is_dev: this.config.isDev,
      model_provider: saved.MODEL_PROVIDER || process.env.MODEL_PROVIDER || 'gemini',
      gemini_model: saved.GEMINI_MODEL || process.env.GEMINI_MODEL || 'gemini-3.6-flash',
      gemini_api_key: '',
      gemini_api_key_masked: this.config.geminiApiKeyMasked,
      is_gemini_api_key_set: Boolean(this.config.geminiApiKey),
      rpm_limit: this.config.geminiRpmLimit,
      local_model_name: saved.LOCAL_MODEL_NAME || process.env.LOCAL_MODEL_NAME || '',
      gemini_max_workers: saved.GEMINI_MAX_WORKERS ? Number(saved.GEMINI_MAX_WORKERS) : Number(process.env.GEMINI_MAX_WORKERS || 3),
      local_max_workers: saved.LOCAL_MAX_WORKERS ? Number(saved.LOCAL_MAX_WORKERS) : Number(process.env.LOCAL_MAX_WORKERS || 2),
      whisper_model: saved.WHISPER_MODEL || process.env.WHISPER_MODEL || 'large-v3-turbo',
      preserve_structure: saved.PRESERVE_STRUCTURE !== undefined ? Boolean(saved.PRESERVE_STRUCTURE) : true,
      vision_prompt_template: this.config.visionPromptTemplate,
      default_vision_prompt_template: DEFAULT_VISION_PROMPT_TEMPLATE,
      users_base_dir: this.config.usersBaseDir,
      user_workspace_root: (user?.sub && this.workspaceService)
        ? this.workspaceService.getUserWorkspace(user.sub, user.root_folder_path).rootPath
        : null,
      user_media_dir: (user?.sub && this.workspaceService)
        ? this.workspaceService.getUserWorkspace(user.sub, user.root_folder_path).mediaDir
        : null,
      user_catalog_dir: (user?.sub && this.workspaceService)
        ? this.workspaceService.getUserWorkspace(user.sub, user.root_folder_path).catalogDir
        : null,
    };
  }

  updateSettings(dto: Partial<import('./dto/settings.dto.js').SettingsUpdateRequestDto>) {
    const previousInputs = [...this.config.inputFolders];
    const cleanedInputs: string[] = [];
    if (dto.input_folders) {
      for (const inp of dto.input_folders) {
        if (inp.includes(',')) {
          cleanedInputs.push(...inp.split(',').map(p => p.trim()).filter(Boolean));
        } else if (inp.trim()) {
          cleanedInputs.push(inp.trim());
        }
      }
    }

    const cleanedOutput = dto.output_folder ? dto.output_folder.trim() : undefined;
    const additional: Record<string, any> = {};
    if (dto.model_provider !== undefined) additional.MODEL_PROVIDER = dto.model_provider;
    if (dto.gemini_model !== undefined) additional.GEMINI_MODEL = dto.gemini_model;
    if (dto.clear_gemini_api_key === true) {
      additional.GEMINI_API_KEY = '';
    } else if (dto.gemini_api_key !== undefined) {
      const keyVal = dto.gemini_api_key.trim();
      if (keyVal && !keyVal.includes('••••')) {
        additional.GEMINI_API_KEY = keyVal;
      }
    }
    if (dto.rpm_limit !== undefined) additional.RPM_LIMIT = Math.max(1, Number(dto.rpm_limit));
    if (dto.local_model_name !== undefined) additional.LOCAL_MODEL_NAME = dto.local_model_name;
    if (dto.gemini_max_workers !== undefined) additional.GEMINI_MAX_WORKERS = Number(dto.gemini_max_workers);
    if (dto.local_max_workers !== undefined) additional.LOCAL_MAX_WORKERS = Number(dto.local_max_workers);
    if (dto.whisper_model !== undefined) additional.WHISPER_MODEL = dto.whisper_model;
    if (dto.preserve_structure !== undefined) additional.PRESERVE_STRUCTURE = Boolean(dto.preserve_structure);
    if (dto.vision_prompt_template !== undefined) additional.VISION_PROMPT_TEMPLATE = dto.vision_prompt_template;

    // Identify removed or renamed folders for recalculating cache
    if (dto.input_folders && this.mediaService) {
      const normCleaned = new Set(cleanedInputs.map((p) => p.toLowerCase().replace(/\\/g, '/')));
      const removedFolders = previousInputs.filter((p) => !normCleaned.has(p.toLowerCase().replace(/\\/g, '/')));

      if (removedFolders.length > 0 || cleanedInputs.length < previousInputs.length) {
        this.logger.log(`Input folders changed (previous=${previousInputs.length}, current=${cleanedInputs.length}). Triggering cache pruning task.`);
        this.mediaService.pruneDisconnectedFolders(removedFolders.length > 0 ? removedFolders : undefined).catch((err) => {
          this.logger.warn(`Failed automatic folder pruning on settings update: ${err.message}`);
        });
      }
    }

    this.config.saveSettings(
      cleanedInputs.length > 0 ? cleanedInputs : undefined,
      cleanedOutput,
      additional
    );

    // Re-initialize database with new path
    this.db.initDb();

    return {
      status: 'success',
      message: 'Settings updated successfully.',
      ...this.getSettings(),
    };
  }

  getShortcuts(user?: any, targetUserId?: string): Array<{ label: string; path: string }> {
    const shortcuts: Array<{ label: string; path: string }> = [];

    // 1. User Workspace shortcuts (for target user or current user)
    const effectiveUserId = targetUserId || user?.sub || user?.id;
    if (effectiveUserId && this.workspaceService) {
      try {
        let customRoot: string | undefined = user?.root_folder_path;
        if (targetUserId) {
          const targetUserObj = this.db.getUserById(targetUserId);
          customRoot = targetUserObj?.root_folder_path || undefined;
        }
        const ws = this.workspaceService.getUserWorkspace(effectiveUserId, customRoot);
        if (ws) {
          if (fs.existsSync(ws.rootDir)) {
            shortcuts.push({ label: '👤 User Workspace', path: ws.rootDir });
          }
          if (fs.existsSync(ws.mediaDir)) {
            shortcuts.push({ label: '🖼️ User Media', path: ws.mediaDir });
          }
        }
      } catch (err) {
        this.logger.warn(`Could not resolve workspace shortcuts for ${effectiveUserId}: ${err}`);
      }
    }

    // 2. Active configured input folders
    if (this.config.inputFolders && this.config.inputFolders.length > 0) {
      for (const folder of this.config.inputFolders) {
        try {
          if (fs.existsSync(folder)) {
            shortcuts.push({ label: `📂 ${path.basename(folder) || folder}`, path: folder });
          }
        } catch {}
      }
    }

    // 3. Configured output folder
    if (this.config.outputFolder) {
      try {
        if (fs.existsSync(this.config.outputFolder)) {
          shortcuts.push({ label: `📦 Output Folder`, path: this.config.outputFolder });
        }
      } catch {}
    }

    // 4. Admin or Host storage drives
    const isAdmin = !user || user.role === 'admin' || (Array.isArray(user.permissions) && user.permissions.includes('admin_panel'));
    if (isAdmin) {
      if (this.config.usersBaseDir && fs.existsSync(this.config.usersBaseDir)) {
        shortcuts.push({ label: '👥 User Workspaces Base', path: this.config.usersBaseDir });
      }

      if (this.config.projectRoot && fs.existsSync(this.config.projectRoot)) {
        shortcuts.push({ label: 'Project Root', path: this.config.projectRoot });
      }

      if (process.platform === 'win32') {
        const driveLetters = ['C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z'];
        for (const letter of driveLetters) {
          const drive = `${letter}:\\`;
          try {
            if (fs.existsSync(drive)) {
              shortcuts.push({ label: `Drive (${drive})`, path: drive });
            }
          } catch {}
        }
      } else {
        const candidates = ['/app/media_input', '/app/media_output', '/app/data/config', '/shares', '/media', '/mnt', '/data', '/app', '/home', '/'];
        for (const cand of candidates) {
          try {
            if (fs.existsSync(cand)) {
              shortcuts.push({ label: cand, path: cand });
            }
          } catch {}
        }
      }
    }

    return shortcuts;
  }

  browseDirectory(
    targetPath?: string,
    mode: 'folder' | 'file' = 'folder',
    user?: any,
    targetUserId?: string,
  ): DirectoryBrowseResult {
    const shortcuts = this.getShortcuts(user, targetUserId);
    let current = targetPath ? targetPath.trim() : '';

    let userWs: any = null;
    const effectiveUserId = targetUserId || user?.sub || user?.id;
    if (effectiveUserId && this.workspaceService) {
      try {
        let customRoot: string | undefined = user?.root_folder_path;
        if (targetUserId) {
          const targetUserObj = this.db.getUserById(targetUserId);
          customRoot = targetUserObj?.root_folder_path || undefined;
        }
        userWs = this.workspaceService.getUserWorkspace(effectiveUserId, customRoot);
      } catch {}
    }

    if (!current) {
      // If target user specified or non-admin user: default to their workspace
      if (userWs && (targetUserId || (user && user.role !== 'admin'))) {
        current = userWs.rootDir;
      } else if (this.config.inputFolders && this.config.inputFolders.length > 0) {
        current = this.config.inputFolders[0];
      } else {
        current = this.config.projectRoot;
      }
    }

    // In non-dev builds (e.g. Docker container), map Windows UNC or drive paths to container volume mount points
    if (!this.config.isDev && current) {
      const isUnc = current.startsWith('\\') || current.startsWith('//');
      const isWinDrive = /^[a-zA-Z]:[/\\]/.test(current);
      if (isUnc || isWinDrive) {
        const lower = current.toLowerCase();
        current = (lower.includes('output') || lower.includes('cataloger') || lower.includes('sda1'))
          ? '/app/media_output'
          : '/app/media_input';
      }
    }

    // Windows UNC path or drive letter handling
    const isUnc = current.startsWith('\\') || current.startsWith('//');
    const isWinDrive = /^[a-zA-Z]:[/\\]/.test(current);

    if (!isUnc && !isWinDrive && !path.isAbsolute(current)) {
      current = path.resolve(this.config.projectRoot, current);
    }

    try {
      if (!fs.existsSync(current)) {
        return {
          current_path: current,
          parent_path: this.getParentPath(current),
          shortcuts,
          directories: [],
          files: [],
          error: `Path does not exist: ${current}`,
          user_workspace: userWs
            ? {
                userId: userWs.userId,
                rootDir: userWs.rootDir,
                mediaDir: userWs.mediaDir,
                catalogDir: userWs.catalogDir,
              }
            : null,
        };
      }

      const stat = fs.statSync(current);
      if (!stat.isDirectory()) {
        current = path.dirname(current);
      }

      const entries = fs.readdirSync(current, { withFileTypes: true });
      const directories: string[] = [];
      const files: string[] = [];

      for (const entry of entries) {
        if (entry.name.startsWith('.') && entry.name !== '.env') continue;
        if (entry.name === 'node_modules' || entry.name === '__pycache__') continue;

        if (entry.isDirectory()) {
          directories.push(entry.name);
        } else if (mode === 'file' && entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (this.config.supportedPhotoExts.has(ext) || this.config.supportedVideoExts.has(ext) || ext === '.json' || ext === '.db') {
            files.push(entry.name);
          }
        }
      }

      directories.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
      files.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));

      return {
        current_path: current,
        parent_path: this.getParentPath(current),
        shortcuts,
        directories,
        files,
        user_workspace: userWs
          ? {
              userId: userWs.userId,
              rootDir: userWs.rootDir,
              mediaDir: userWs.mediaDir,
              catalogDir: userWs.catalogDir,
            }
          : null,
      };
    } catch (err: any) {
      this.logger.warn(`Failed to browse directory ${current}: ${err.message}`);
      return {
        current_path: current,
        parent_path: this.getParentPath(current),
        shortcuts,
        directories: [],
        files: [],
        error: err.message || 'Cannot access directory',
        user_workspace: userWs
          ? {
              userId: userWs.userId,
              rootDir: userWs.rootDir,
              mediaDir: userWs.mediaDir,
              catalogDir: userWs.catalogDir,
            }
          : null,
      };
    }
  }

  private getParentPath(current: string): string | null {
    if (!current) return null;
    if (current === '/' || /^[a-zA-Z]:[/\\]?$/.test(current)) {
      return null;
    }
    const parent = path.dirname(current);
    return parent === current ? null : parent;
  }

  async selectFolder(): Promise<{ folder: string }> {
    if (os.platform() === 'win32') {
      try {
        const psCommand = `powershell -NoProfile -Command "& { Add-Type -AssemblyName System.Windows.Forms; $f = New-Object System.Windows.Forms.FolderBrowserDialog; $f.Description = 'Select Catalog Folder'; if ($f.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { Write-Output $f.SelectedPath } }"`;
        const { stdout } = await execAsync(psCommand);
        const folder = stdout.trim();
        return { folder: folder || '' };
      } catch (err) {
        this.logger.warn(`Folder picker failed: ${err}`);
      }
    }
    return { folder: '' };
  }

  async selectFile(): Promise<{ file: string }> {
    if (os.platform() === 'win32') {
      try {
        const psCommand = `powershell -NoProfile -Command "& { Add-Type -AssemblyName System.Windows.Forms; $f = New-Object System.Windows.Forms.OpenFileDialog; $f.Title = 'Select Media File'; $f.Filter = 'Media files (*.jpg;*.jpeg;*.png;*.webp;*.heic;*.heif;*.mp4;*.mov;*.avi;*.mkv)|*.jpg;*.jpeg;*.png;*.webp;*.heic;*.heif;*.mp4;*.mov;*.avi;*.mkv|All files (*.*)|*.*'; if ($f.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { Write-Output $f.FileName } }"`;
        const { stdout } = await execAsync(psCommand);
        const file = stdout.trim();
        return { file: file || '' };
      } catch (err) {
        this.logger.warn(`File picker failed: ${err}`);
      }
    }
    return { file: '' };
  }

  getFeatureFlags(): any[] {
    const filePath = this.config.ensureFeatureFlagsFile();
    if (fs.existsSync(filePath)) {
      try {
        const raw = fs.readFileSync(filePath, 'utf-8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          return parsed;
        }
      } catch (err: any) {
        this.logger.warn(`Failed to read feature flags from ${filePath}: ${err.message}`);
      }
    }
    return [];
  }

  saveFeatureFlags(flags: any[]): { status: string; count: number; file_path: string } {
    if (!Array.isArray(flags)) {
      throw new Error('Feature flags must be an array');
    }
    const filePath = this.config.featureFlagsFilePath;
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, JSON.stringify(flags, null, 2), 'utf-8');
    this.logger.log(`Saved ${flags.length} feature flags to ${filePath}`);
    return { status: 'success', count: flags.length, file_path: filePath };
  }

  /**
   * Query installed and available models from LM Studio CLI/REST API.
   */
  async getLocalModels(): Promise<{
    connected: boolean;
    models: Array<{
      id: string;
      name: string;
      isVision: boolean;
      isLoaded: boolean;
      arch?: string;
      size?: string;
      params?: string;
    }>;
    activeModel: string;
    error?: string;
  }> {
    const activeModel = this.config.getSavedSettings().LOCAL_MODEL_NAME || process.env.LOCAL_MODEL_NAME || '';
    const models: Array<{
      id: string;
      name: string;
      isVision: boolean;
      isLoaded: boolean;
      arch?: string;
      size?: string;
      params?: string;
    }> = [];

    // 1. Try lms CLI first (returns rich metadata including vision support & loaded state)
    try {
      const [{ stdout: lsOut }, { stdout: psOut }] = await Promise.all([
        execAsync('lms ls --json', { timeout: 4000 }),
        execAsync('lms ps --json', { timeout: 4000 }).catch(() => ({ stdout: '[]' })),
      ]);

      let loadedKeys = new Set<string>();
      try {
        const psParsed = JSON.parse(psOut);
        if (Array.isArray(psParsed)) {
          loadedKeys = new Set(psParsed.map((p: any) => p.modelKey || p.identifier || p.id).filter(Boolean));
        }
      } catch {}

      const lsParsed = JSON.parse(lsOut);
      if (Array.isArray(lsParsed)) {
        for (const item of lsParsed) {
          if (item.type === 'embedding') continue; // exclude embedding models from vision/LLM selector
          const key = item.modelKey || item.path || item.indexedModelIdentifier;
          if (!key) continue;
          const lowerKey = key.toLowerCase();
          if (lowerKey.includes('embed') || lowerKey.includes('whisper')) continue;

          const isVis = Boolean(
            item.vision ||
            lowerKey.includes('vl') ||
            lowerKey.includes('vision') ||
            lowerKey.includes('caption') ||
            lowerKey.includes('llava') ||
            lowerKey.includes('gemma-4') ||
            lowerKey.includes('olmocr')
          );

          models.push({
            id: key,
            name: item.displayName || key,
            isVision: isVis,
            isLoaded: loadedKeys.has(key),
            arch: item.architecture,
            size: item.sizeBytes ? `${(item.sizeBytes / (1024 * 1024 * 1024)).toFixed(1)} GB` : undefined,
            params: item.paramsString,
          });
        }
      }

      if (models.length > 0) {
        // Sort vision models first, then alphabetical
        models.sort((a, b) => {
          if (a.isVision && !b.isVision) return -1;
          if (!a.isVision && b.isVision) return 1;
          return a.name.localeCompare(b.name);
        });

        return {
          connected: true,
          models,
          activeModel,
        };
      }
    } catch (cliErr: any) {
      this.logger.debug(`lms CLI check failed (${cliErr.message}), trying HTTP API`);
    }

    // 2. Fallback: Query LM Studio REST API via HTTP /v1/models
    const candidateUrls = [
      this.config.localApiBase,
      'http://localhost:1234/v1',
      'http://127.0.0.1:1234/v1',
    ];

    let lastError = '';
    for (const rawBase of candidateUrls) {
      if (!rawBase) continue;
      const baseUrl = rawBase.replace(/\/+$/, '');
      const url = `${baseUrl}/models`;
      try {
        const headers: Record<string, string> = {};
        if (this.config.lmApiToken) {
          headers['Authorization'] = `Bearer ${this.config.lmApiToken}`;
        }
        const resp = await fetch(url, { headers, signal: AbortSignal.timeout(3000) });
        if (resp.ok) {
          const data: any = await resp.json();
          if (data && Array.isArray(data.data)) {
            for (const m of data.data) {
              const id = m.id || m.modelKey;
              if (!id) continue;
              const lowerId = id.toLowerCase();
              if (lowerId.includes('embed') || lowerId.includes('whisper')) continue;

              const isVis = Boolean(
                lowerId.includes('vl') ||
                lowerId.includes('vision') ||
                lowerId.includes('caption') ||
                lowerId.includes('llava') ||
                lowerId.includes('gemma-4') ||
                lowerId.includes('olmocr')
              );

              models.push({
                id,
                name: id,
                isVision: isVis,
                isLoaded: m.state === 'loaded',
              });
            }

            models.sort((a, b) => {
              if (a.isVision && !b.isVision) return -1;
              if (!a.isVision && b.isVision) return 1;
              return a.name.localeCompare(b.name);
            });

            return {
              connected: true,
              models,
              activeModel,
            };
          }
        } else if (resp.status === 401 || resp.status === 403) {
          lastError = 'LM Studio authentication required. Please set LM_API_TOKEN.';
        }
      } catch (httpErr: any) {
        lastError = httpErr.message;
      }
    }

    return {
      connected: false,
      models: [],
      activeModel,
      error: lastError || 'Could not connect to LM Studio service. Make sure LM Studio local server is running.',
    };
  }

  /**
   * Load the selected model into LM Studio memory automatically.
   */
  async loadLocalModel(modelId: string): Promise<{ success: boolean; message: string }> {
    if (!modelId || !modelId.trim()) {
      return { success: false, message: 'Model ID cannot be empty.' };
    }
    const cleanId = modelId.trim();
    this.logger.log(`Attempting to load model into LM Studio: ${cleanId}`);

    // 1. Delegate to Python AI engine if reachable (so it coordinates active tasks and idle drain)
    try {
      const pythonApiUrl = this.config.catalogerApiUrl.replace(/\/+$/, '');
      const res = await fetch(`${pythonApiUrl}/api/models/local/load`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model_id: cleanId }),
        signal: AbortSignal.timeout(65000),
      });
      if (res.ok) {
        const data = await res.json();
        return { success: true, message: data.message || `Successfully loaded model ${cleanId}` };
      }
    } catch (delegationErr: any) {
      this.logger.debug(`Direct Python AI engine model switch skipped/failed: ${delegationErr.message}, falling back to local CLI/API`);
    }

    // 2. Direct LM Studio CLI check and load
    try {
      // Check if already loaded
      const { stdout: psOut } = await execAsync('lms ps --json', { timeout: 5000 });
      if (psOut.trim()) {
        const psParsed = JSON.parse(psOut);
        const isAlreadyLoaded = psParsed.some((p: any) => {
          const key = (p.modelKey || p.identifier || p.id || '').toLowerCase();
          return key === cleanId.toLowerCase() || key.includes(cleanId.toLowerCase()) || cleanId.toLowerCase().includes(key);
        });
        if (isAlreadyLoaded) {
          const msg = `Model "${cleanId}" is already loaded in LM Studio memory. Reusing active instance.`;
          this.logger.log(msg);
          return { success: true, message: msg };
        }
      }

      // Unload all previous models first to avoid OOM
      this.logger.log(`Unloading previous models from LM Studio before loading ${cleanId}...`);
      try {
        await execAsync('lms unload -a', { timeout: 30000 });
      } catch (unloadErr: any) {
        this.logger.warn(`lms unload -a warning: ${unloadErr.message}`);
      }

      const { stdout } = await execAsync(`lms load "${cleanId}" -y`, { timeout: 60000 });
      this.logger.log(`lms load output for ${cleanId}: ${stdout.trim()}`);
      return {
        success: true,
        message: `Successfully loaded model ${cleanId} into LM Studio.`,
      };
    } catch (cliErr: any) {
      this.logger.warn(`lms load CLI failed: ${cliErr.message}, attempting API fallback`);
    }

    // 3. Try LM Studio HTTP API fallback
    try {
      const baseUrl = this.config.localApiBase.replace(/\/+$/, '');
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (this.config.lmApiToken) {
        headers['Authorization'] = `Bearer ${this.config.lmApiToken}`;
      }
      const res = await fetch(`${baseUrl}/models/load`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ model: cleanId }),
        signal: AbortSignal.timeout(30000),
      });
      if (res.ok) {
        return { success: true, message: `Loaded model ${cleanId} via LM Studio API.` };
      }
    } catch {}

    return {
      success: true,
      message: `Model ${cleanId} configured. Just-in-time loading will activate on first inference request.`,
    };
  }
}
