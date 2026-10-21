import { Controller, Get, Post, Body, Inject, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { DuplicatesService } from './duplicates.service.js';

@ApiTags('Duplicates')
@Controller('api/duplicates')
export class DuplicatesController {
  constructor(@Inject(DuplicatesService) private readonly duplicatesService: DuplicatesService) {}

  @Get('scan-status')
  @ApiOperation({ summary: 'Get current background duplicate scan progress and status' })
  getScanStatus() {
    return this.duplicatesService.getScanStatus();
  }

  @Post('scan')
  @ApiOperation({ summary: 'Trigger background duplicate and similarity scan' })
  startScan(
    @Body()
    body?: {
      engine?: 'cpu' | 'gpu' | 'auto';
      mode?: 'exact' | 'visual' | 'burst' | 'all';
      similarity_threshold?: number;
      similarityThreshold?: number;
      burst_window_seconds?: number;
      burstWindowSeconds?: number;
      folders?: string[];
      force_rehash?: boolean;
      forceRehash?: boolean;
    },
  ) {
    const threshold = body?.similarity_threshold ?? body?.similarityThreshold;
    const burstWindow = body?.burst_window_seconds ?? body?.burstWindowSeconds;
    const forceRehash = body?.force_rehash ?? body?.forceRehash;

    return this.duplicatesService.startScan({
      engine: body?.engine,
      mode: body?.mode,
      similarityThreshold: threshold,
      burstWindowSeconds: burstWindow,
      folders: body?.folders,
      forceRehash: forceRehash,
    });
  }

  @Post('stop-scan')
  @ApiOperation({ summary: 'Stop or cancel ongoing background duplicate scan' })
  stopScan() {
    return this.duplicatesService.stopScan();
  }

  @Get('groups')
  @ApiOperation({ summary: 'Get list of detected duplicate and similarity groups with optional on-demand clustering' })
  @ApiQuery({ name: 'mode', required: false, enum: ['all', 'exact', 'visual', 'burst'] })
  @ApiQuery({ name: 'similarity_threshold', required: false, type: Number })
  @ApiQuery({ name: 'burst_window_seconds', required: false, type: Number })
  @ApiQuery({ name: 'folder', required: false, type: String })
  @ApiQuery({ name: 'keep_strategy', required: false, type: String })
  async getGroups(
    @Query('mode') mode?: 'all' | 'exact' | 'similar' | 'visual' | 'burst',
    @Query('similarity_threshold') similarityThreshold?: number,
    @Query('similarityThreshold') similarityThresholdAlt?: number,
    @Query('burst_window_seconds') burstWindowSeconds?: number,
    @Query('burstWindowSeconds') burstWindowSecondsAlt?: number,
    @Query('folder') folder?: string,
    @Query('keep_strategy') keepStrategy?: any,
  ) {
    const threshold = similarityThreshold !== undefined ? Number(similarityThreshold) : (similarityThresholdAlt !== undefined ? Number(similarityThresholdAlt) : undefined);
    const burstWindow = burstWindowSeconds !== undefined ? Number(burstWindowSeconds) : (burstWindowSecondsAlt !== undefined ? Number(burstWindowSecondsAlt) : undefined);

    if (mode || threshold !== undefined || burstWindow !== undefined || folder || keepStrategy) {
      return await this.duplicatesService.getDuplicateGroups(
        mode || 'all',
        threshold !== undefined ? threshold : 0.90,
        burstWindow !== undefined ? burstWindow : 3.0,
        keepStrategy || 'highest_resolution',
        folder,
      );
    }
    return await this.duplicatesService.getGroups();
  }

  @Get('summary')
  @ApiOperation({ summary: 'Get aggregate summary statistics of detected duplicates' })
  async getSummary() {
    return await this.duplicatesService.getSummary();
  }

  @Get('config')
  @ApiOperation({ summary: 'Get duplicate detection settings and configuration' })
  getConfig() {
    return this.duplicatesService.getConfig();
  }

  @Post('config')
  @ApiOperation({ summary: 'Update duplicate detection settings and configuration' })
  saveConfig(@Body() body: any) {
    return this.duplicatesService.saveConfig(body);
  }

  @Post('delete')
  @ApiOperation({ summary: 'Explicitly delete user-selected duplicate files' })
  deleteFiles(@Body() body: { files?: string[]; file_paths?: string[] }) {
    const files = body.files || body.file_paths || [];
    return this.duplicatesService.deleteFiles(files);
  }

  @Post('move')
  @ApiOperation({ summary: 'Explicitly move user-selected duplicate files to target archive folder' })
  moveFiles(
    @Body()
    body: {
      files?: string[];
      file_paths?: string[];
      destination_folder?: string;
      destinationFolder?: string;
    },
  ) {
    const files = body.files || body.file_paths || [];
    const dest = body.destination_folder || body.destinationFolder || '';
    return this.duplicatesService.moveFiles(files, dest);
  }

  @Post('unmark')
  @ApiOperation({ summary: 'Unmark a file as duplicate ("Это не дубликат")' })
  unmarkDuplicate(@Body() body: { file_path?: string; filePath?: string }) {
    const filePath = body.file_path || body.filePath || '';
    return this.duplicatesService.unmarkDuplicate(filePath);
  }
}
