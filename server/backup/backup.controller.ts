import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Res,
  Inject,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiConsumes } from '@nestjs/swagger';
import type { Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { FileInterceptor } from '@nestjs/platform-express';
import { BackupService } from './backup.service.js';
import { BackupSchedulerService } from './backup-scheduler.service.js';
import { JwtAuthGuard } from '../auth/auth.guard.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { RequirePermissions } from '../auth/auth.decorators.js';
import type { RestoreOptions } from './backup.interface.js';

@ApiTags('backup')
@Controller('api/backup')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BackupController {
  constructor(
    @Inject(BackupService) private readonly backupService: BackupService,
    @Inject(BackupSchedulerService) private readonly schedulerService: BackupSchedulerService,
  ) {}

  @Get()
  @RequirePermissions('admin_panel')
  @ApiOperation({ summary: 'List all available system backups (Admin)' })
  @ApiResponse({ status: 200, description: 'List of backup items with metadata' })
  async listBackups() {
    return this.backupService.listBackups();
  }

  @Post()
  @RequirePermissions('admin_panel')
  @ApiOperation({ summary: 'Create a new on-demand system backup (Admin)' })
  @ApiResponse({ status: 201, description: 'Created backup metadata' })
  async createBackup(@Body() body: { description?: string; includeFaces?: boolean }) {
    return this.backupService.createBackup({
      trigger: 'manual',
      description: body?.description,
      includeFaces: body?.includeFaces,
    });
  }

  @Get('config')
  @RequirePermissions('admin_panel')
  @ApiOperation({ summary: 'Get backup scheduling and retention configuration' })
  async getBackupConfig() {
    const nextRun = this.schedulerService.getNextRunDate();
    return this.backupService.getBackupConfig(nextRun);
  }

  @Post('config')
  @RequirePermissions('admin_panel')
  @ApiOperation({ summary: 'Update backup scheduling and retention configuration' })
  async updateBackupConfig(
    @Body()
    body: {
      cron?: string;
      retentionCount?: number;
      enabled?: boolean;
      backupPath?: string;
    },
  ) {
    const updated = await this.backupService.updateBackupConfig(body);
    if (body.cron !== undefined || body.enabled !== undefined) {
      this.schedulerService.updateSchedule(updated.cron, updated.enabled);
    }
    const nextRun = this.schedulerService.getNextRunDate();
    return {
      ...updated,
      nextRunDate: nextRun,
    };
  }

  @Get(':filename/download')
  @RequirePermissions('admin_panel')
  @ApiOperation({ summary: 'Download a backup archive file' })
  downloadBackup(@Param('filename') filename: string, @Res() res: Response) {
    try {
      const safeFilename = path.basename(filename);
      const filePath = this.backupService.getBackupFilePath(safeFilename);

      if (!fs.existsSync(filePath)) {
        if (!res.headersSent) {
          res.status(404).json({ error: 'file_not_found', message: `Backup file not found: ${safeFilename}` });
        }
        return;
      }

      const stat = fs.statSync(filePath);
      res.status(200);
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
      res.setHeader('Content-Length', stat.size);

      const stream = fs.createReadStream(filePath);
      stream.on('error', (err) => {
        if (!res.headersSent) {
          res.status(500).json({ error: 'stream_error', message: err.message });
        }
      });
      stream.pipe(res);
    } catch (err: any) {
      if (!res.headersSent) {
        res.status(err.message?.includes('not found') ? 404 : 500).json({
          error: 'download_failed',
          message: err.message,
        });
      }
    }
  }

  @Post('upload')
  @RequirePermissions('admin_panel')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Upload an existing backup archive file' })
  @ApiConsumes('multipart/form-data')
  async uploadBackup(@UploadedFile() file: any) {
    if (!file || !file.buffer) {
      throw new BadRequestException('No file uploaded or file buffer is empty');
    }
    return this.backupService.importBackupFromBuffer(file.buffer, file.originalname);
  }

  @Post(':filename/restore')
  @RequirePermissions('admin_panel')
  @ApiOperation({ summary: 'Restore system from a backup archive' })
  async restoreBackup(
    @Param('filename') filename: string,
    @Body() options?: RestoreOptions,
  ) {
    const safeFilename = path.basename(filename);
    return this.backupService.restoreBackup(safeFilename, options);
  }

  @Delete(':filename')
  @RequirePermissions('admin_panel')
  @ApiOperation({ summary: 'Delete a backup archive file' })
  async deleteBackup(@Param('filename') filename: string) {
    const safeFilename = path.basename(filename);
    const success = await this.backupService.deleteBackup(safeFilename);
    return { success, filename: safeFilename };
  }
}
