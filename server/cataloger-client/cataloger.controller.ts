import { Controller, Get, Post, Delete, Query, Body, HttpException, HttpStatus, Inject, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { CatalogerClientService } from './cataloger.service.js';
import { LogLevel } from '../logging/log-buffer.service.js';
import { JwtAuthGuard } from '../auth/auth.guard.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { PathValidationGuard } from '../auth/guards/path-validation.guard.js';
import { Public, RequirePermissions } from '../auth/auth.decorators.js';

@ApiTags('pipeline')
@Controller('api')
@UseGuards(JwtAuthGuard, RolesGuard, PathValidationGuard)
export class CatalogerController {
  constructor(@Inject(CatalogerClientService) private readonly catalogerService: CatalogerClientService) {}

  @Post('run')
  @RequirePermissions('admin_panel')
  @ApiOperation({ summary: 'Trigger full cataloging sync' })
  @ApiQuery({ name: 'force', required: false, type: Boolean, description: 'Force re-processing of already synced items' })
  @ApiQuery({ name: 'mode', required: false, type: String, description: 'Single pipeline mode' })
  @ApiQuery({ name: 'modes', required: false, type: String, description: 'Comma-separated pipeline modes' })
  async triggerRun(
    @Req() req: any,
    @Query('force') force?: string,
    @Query('mode') mode?: string,
    @Query('modes') modes?: string,
    @Body() customPayload?: any
  ) {
    try {
      const forceBool = force === 'true' || force === '1';
      const userId = req?.user?.sub;
      const rootPath = req?.user?.root_folder_path;
      let resolvedModes: string[] | undefined = undefined;
      if (customPayload?.modes && Array.isArray(customPayload.modes)) {
        resolvedModes = customPayload.modes;
      } else if (modes) {
        resolvedModes = modes.split(',').map(m => m.trim()).filter(Boolean);
      } else if (mode) {
        resolvedModes = [mode.trim()];
      } else if (customPayload?.mode) {
        resolvedModes = [customPayload.mode];
      }

      const mergedPayload = {
        ...(customPayload || {}),
        ...(resolvedModes ? { modes: resolvedModes } : {}),
      };

      return await this.catalogerService.triggerRun(forceBool, mergedPayload, userId, rootPath);
    } catch (err: any) {
      if (err instanceof HttpException) {
        throw err;
      }
      throw new HttpException(err.message, HttpStatus.BAD_GATEWAY);
    }
  }

  @Post('analyze-file')
  @RequirePermissions('admin_panel', 'edit_metadata')
  @ApiOperation({ summary: 'Analyze a single media file immediately' })
  @ApiQuery({ name: 'file', required: false, description: 'Filename or path to the media file' })
  async triggerAnalyzeFile(@Req() req: any, @Query('file') file?: string, @Body() body?: any) {
    const targetFile = file || body?.file;
    if (!targetFile || !String(targetFile).trim()) {
      throw new HttpException('File parameter cannot be empty.', HttpStatus.BAD_REQUEST);
    }
    try {
      const userId = req?.user?.sub;
      const rootPath = req?.user?.root_folder_path;
      return await this.catalogerService.triggerAnalyzeFile(String(targetFile).trim(), body, userId, rootPath);
    } catch (err: any) {
      if (err instanceof HttpException) {
        throw err;
      }
      throw new HttpException(err.message, HttpStatus.BAD_GATEWAY);
    }
  }

  @Post('pause')
  @RequirePermissions('admin_panel')
  @ApiOperation({ summary: 'Pause current pipeline execution' })
  async pause() {
    try {
      return await this.catalogerService.pause();
    } catch (err: any) {
      throw new HttpException(err.message, HttpStatus.BAD_GATEWAY);
    }
  }

  @Post('resume')
  @RequirePermissions('admin_panel')
  @ApiOperation({ summary: 'Resume paused execution' })
  async resume() {
    try {
      return await this.catalogerService.resume();
    } catch (err: any) {
      throw new HttpException(err.message, HttpStatus.BAD_GATEWAY);
    }
  }

  @Post('stop')
  @RequirePermissions('admin_panel')
  @ApiOperation({ summary: 'Stop and cancel current execution' })
  async stop() {
    try {
      return await this.catalogerService.stop();
    } catch (err: any) {
      throw new HttpException(err.message, HttpStatus.BAD_GATEWAY);
    }
  }

  @Public()
  @Get('status')
  @ApiOperation({ summary: 'Get current cataloging pipeline execution status and progress' })
  @ApiResponse({ status: 200, description: 'Current worker status and progress' })
  async getStatus() {
    return this.catalogerService.getStatus();
  }

  @Public()
  @Get('validate-connection')
  @ApiOperation({ summary: 'Validate HTTP connection to media_cataloger AI service' })
  @ApiResponse({ status: 200, description: 'Connection status and latency details' })
  async validateConnection() {
    return this.catalogerService.validateConnection();
  }

  @Public()
  @Get('health')
  @ApiOperation({ summary: 'Health check and connection validation for cataloger AI service' })
  async getHealth() {
    return this.catalogerService.validateConnection();
  }

  @Public()
  @Get('logs')
  @ApiOperation({ summary: 'Get real-time execution logs from cataloging worker' })
  @ApiQuery({ name: 'level', required: false, enum: ['DEBUG', 'INFO', 'WARN', 'ERROR', 'ALL'], description: 'Filter logs by level' })
  async getLogs(@Query('level') level?: string) {
    const validLevels = ['DEBUG', 'INFO', 'WARN', 'ERROR', 'ALL'];
    const selectedLevel = level && validLevels.includes(level.toUpperCase()) ? (level.toUpperCase() as LogLevel | 'ALL') : undefined;
    return this.catalogerService.getLogs(selectedLevel);
  }

  @Post('logs/clear')
  @Delete('logs')
  @RequirePermissions('admin_panel')
  @ApiOperation({ summary: 'Clear execution logs' })
  async clearLogs() {
    return this.catalogerService.clearLogs();
  }
}
