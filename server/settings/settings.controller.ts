import { Controller, Get, Post, Body, Query, Inject, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { SettingsService } from './settings.service.js';
import { SettingsUpdateRequestDto } from './dto/settings.dto.js';
import { JwtAuthGuard } from '../auth/auth.guard.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { PathValidationGuard } from '../auth/guards/path-validation.guard.js';
import { Public, RequirePermissions } from '../auth/auth.decorators.js';

@ApiTags('settings')
@Controller('api')
@UseGuards(JwtAuthGuard, RolesGuard, PathValidationGuard)
export class SettingsController {
  constructor(@Inject(SettingsService) private readonly settingsService: SettingsService) {}

  @Public()
  @Get('settings')
  @ApiOperation({ summary: 'Get current path configurations and defaults' })
  @ApiResponse({ status: 200, description: 'Current configuration' })
  getSettings(@Req() req: any) {
    return this.settingsService.getSettings(req?.user);
  }

  @Post('settings')
  @RequirePermissions('admin_panel')
  @ApiOperation({ summary: 'Update input, output, and model configurations (Admin)' })
  updateSettings(@Body() body: SettingsUpdateRequestDto) {
    return this.settingsService.updateSettings(body);
  }

  @Public()
  @Get('fs/browse')
  @ApiOperation({ summary: 'Browse host filesystem directories and files for selection' })
  @ApiQuery({ name: 'path', required: false, type: String })
  @ApiQuery({ name: 'mode', required: false, enum: ['folder', 'file'] })
  @ApiQuery({ name: 'userId', required: false, type: String })
  browseDirectoryGet(
    @Req() req: any,
    @Query('path') targetPath?: string,
    @Query('mode') mode?: 'folder' | 'file',
    @Query('userId') targetUserId?: string,
  ) {
    return this.settingsService.browseDirectory(targetPath, mode, req?.user, targetUserId);
  }

  @Public()
  @Post('fs/browse')
  @ApiOperation({ summary: 'Browse host filesystem directories and files via POST' })
  browseDirectoryPost(
    @Req() req: any,
    @Body() body: { path?: string; mode?: 'folder' | 'file'; userId?: string },
  ) {
    return this.settingsService.browseDirectory(body?.path, body?.mode, req?.user, body?.userId);
  }

  @Post('select-folder')
  @RequirePermissions('admin_panel')
  @ApiOperation({ summary: 'Open native folder picker on the host system' })
  async selectFolder() {
    return this.settingsService.selectFolder();
  }

  @Post('select-file')
  @RequirePermissions('admin_panel')
  @ApiOperation({ summary: 'Open native media file picker on the host system' })
  async selectFile() {
    return this.settingsService.selectFile();
  }

  @Public()
  @Get('feature-flags')
  @ApiOperation({ summary: 'Get feature flags stored in /data/feature_flags.json' })
  @ApiResponse({ status: 200, description: 'List of feature flags' })
  getFeatureFlags() {
    return this.settingsService.getFeatureFlags();
  }

  @Public()
  @Post('feature-flags')
  @ApiOperation({ summary: 'Save feature flags to /data/feature_flags.json' })
  @ApiResponse({ status: 200, description: 'Saved feature flags response' })
  saveFeatureFlags(@Body() body: any) {
    const flags = Array.isArray(body) ? body : body?.flags;
    return this.settingsService.saveFeatureFlags(flags);
  }

  @Public()
  @Get('models/local')
  @ApiOperation({ summary: 'Get list of installed and available models in LM Studio' })
  @ApiResponse({ status: 200, description: 'List of LM Studio local models' })
  getLocalModels() {
    return this.settingsService.getLocalModels();
  }

  @Public()
  @Post('models/local/load')
  @ApiOperation({ summary: 'Load selected local model into LM Studio memory' })
  @ApiResponse({ status: 200, description: 'Model loading response' })
  loadLocalModel(@Body() body: { modelId?: string; model?: string; model_id?: string }) {
    const targetModel = body.modelId || body.model || body.model_id || '';
    return this.settingsService.loadLocalModel(targetModel);
  }
}

