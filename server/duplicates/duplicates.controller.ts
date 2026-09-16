import { Controller, Get, Post, Body, Inject } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
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
  @ApiOperation({ summary: 'Get list of detected duplicate and similarity groups' })
  getGroups() {
    return this.duplicatesService.getGroups();
  }

  @Get('summary')
  @ApiOperation({ summary: 'Get aggregate summary statistics of detected duplicates' })
  getSummary() {
    return this.duplicatesService.getSummary();
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
}
