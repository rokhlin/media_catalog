import { Controller, Get, Post, Patch, Body, Query, Req, Res, Headers, BadRequestException, ForbiddenException, Inject, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiResponse } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { MediaService } from './media.service.js';
import { ThumbnailService } from './thumbnail.service.js';
import { VaultService } from '../vault/vault.service.js';
import { PathValidationGuard } from '../auth/guards/path-validation.guard.js';
import { AddPersonToFileDto, RemoveFaceFromFileDto, ListMediaFilesQueryDto, UpdateMediaMetadataDto } from './dto/media.dto.js';

function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.png':
      return 'image/png';
    case '.webp':
      return 'image/webp';
    case '.gif':
      return 'image/gif';
    case '.avif':
      return 'image/avif';
    case '.heic':
    case '.heif':
      return 'image/heic';
    case '.mp4':
    case '.m4v':
      return 'video/mp4';
    case '.mov':
      return 'video/mp4'; // QuickTime container is ISO BMFF compatible with MP4 demuxers
    case '.avi':
      return 'video/x-msvideo';
    case '.mkv':
      return 'video/x-matroska';
    case '.webm':
      return 'video/webm';
    default:
      return 'application/octet-stream';
  }
}

function streamFileSafely(
  filePath: string,
  req: Request | undefined,
  res: Response,
  mimeType?: string,
  cacheControl?: string,
): void {
  try {
    if (!fs.existsSync(filePath)) {
      if (!res.headersSent) {
        res.status(404).json({ error: 'file_not_found', path: filePath });
      }
      return;
    }
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) {
      if (!res.headersSent) {
        res.status(400).json({ error: 'not_a_file', path: filePath });
      }
      return;
    }

    const type = mimeType || getMimeType(filePath);
    const rangeHeader = req?.headers?.range;

    res.setHeader('Accept-Ranges', 'bytes');
    if (cacheControl) {
      res.setHeader('Cache-Control', cacheControl);
    }

    if (rangeHeader && rangeHeader.startsWith('bytes=')) {
      const parts = rangeHeader.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;

      if (isNaN(start) || isNaN(end) || start >= stat.size || end >= stat.size || start > end) {
        res.status(416).setHeader('Content-Range', `bytes */${stat.size}`).end();
        return;
      }

      const chunkSize = end - start + 1;
      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${stat.size}`);
      res.setHeader('Content-Length', chunkSize);
      res.setHeader('Content-Type', type);

      const stream = fs.createReadStream(filePath, { start, end });
      stream.on('error', (err) => {
        if (!res.headersSent) {
          res.status(500).json({ error: 'stream_error', detail: err.message });
        }
      });
      stream.pipe(res);
    } else {
      res.status(200);
      res.setHeader('Content-Length', stat.size);
      res.setHeader('Content-Type', type);

      const stream = fs.createReadStream(filePath);
      stream.on('error', (err) => {
        if (!res.headersSent) {
          res.status(500).json({ error: 'stream_error', detail: err.message });
        }
      });
      stream.pipe(res);
    }
  } catch (err: any) {
    if (!res.headersSent) {
      res.status(500).json({ error: 'stream_exception', detail: err.message });
    }
  }
}

@ApiTags('media')
@Controller('api/media')
@UseGuards(PathValidationGuard)
export class MediaController {
  constructor(
    @Inject(MediaService) private readonly mediaService: MediaService,
    @Inject(ThumbnailService) private readonly thumbnailService: ThumbnailService,
    @Inject(VaultService) private readonly vaultService: VaultService,
  ) {}

  private checkVaultAccess(filePath: string, vaultToken?: string): void {
    if (this.vaultService.isVaultFile(filePath)) {
      if (!this.vaultService.isVaultUnlocked(vaultToken)) {
        throw new ForbiddenException('Secret Vault item is locked. Authentication PIN required.');
      }
    }
  }

  @Get('files')
  @ApiOperation({ summary: 'List all media files discovered in input sources with pagination, search, filter and sorting' })
  @ApiResponse({ status: 200, description: 'Media file list with face detections, pagination and AI summaries' })
  async listMediaFiles(@Query() query: ListMediaFilesQueryDto) {
    return this.mediaService.listMediaFiles(query);
  }

  @Get('scan-status')
  @ApiOperation({ summary: 'Get real-time folder scanning and indexing status with current file' })
  async getScanStatus() {
    return this.mediaService.getScanStatus();
  }

  @Get('cache/status')
  @ApiOperation({ summary: 'Get current caching strategy status, stats, and next schedule' })
  async getCacheStatus() {
    return this.mediaService.getCacheStatus();
  }

  @Post('cache/recache')
  @ApiOperation({ summary: 'Trigger manual recaching for all folders or a specific folder' })
  async recache(@Body() body?: { folder?: string; incremental?: boolean }) {
    return this.mediaService.recache({
      folder: body?.folder,
      incremental: body?.incremental,
    });
  }

  @Post('cache/clear')
  @ApiOperation({ summary: 'Clear in-memory and sidecar media cache' })
  async clearCache() {
    this.mediaService.invalidateCache();
    return { status: 'success', message: 'Cache cleared successfully' };
  }

  @Get('cache-strategy')
  @ApiOperation({ summary: 'Get cache strategy configuration and execution metrics' })
  async getCacheStrategy() {
    return this.mediaService.getCacheStatus();
  }

  @Post('cache-strategy')
  @ApiOperation({ summary: 'Save daily cache automation configuration' })
  async saveCacheStrategy(
    @Body() body: { daily_automation_enabled?: boolean; daily_schedule_time?: string; incremental_only?: boolean },
  ) {
    return this.mediaService.saveCacheStrategy(body);
  }

  @Get('thumbnail')
  @ApiOperation({ summary: 'Get or generate a fast cached WebP thumbnail for a media file' })
  @ApiQuery({ name: 'path', required: false, description: 'Full path or relative path to media file' })
  @ApiQuery({ name: 'file', required: false, description: 'Filename or subpath to media file' })
  @ApiQuery({ name: 'size', required: false, description: 'Max thumbnail dimension in pixels (default 300)' })
  async getThumbnail(
    @Query('path') queryPath: string,
    @Query('file') queryFile: string,
    @Query('size') querySize: string,
    @Query('vault_token') queryVaultToken: string,
    @Headers('x-vault-token') headerVaultToken: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const target = queryPath || queryFile;
    if (!target || !target.trim()) {
      throw new BadRequestException('Missing file or path parameter');
    }
    const resolved = this.mediaService.resolveMediaFilePath(target);
    this.checkVaultAccess(resolved, headerVaultToken || queryVaultToken);
    
    const size = querySize ? parseInt(querySize, 10) : 300;

    try {
      const thumb = await this.thumbnailService.getThumbnail(resolved, size);
      streamFileSafely(thumb.filePath, req, res, 'image/webp', 'public, max-age=31536000, immutable');
    } catch {
      // If thumbnail generation is not possible (e.g. video or unsupported format), fallback to original file
      streamFileSafely(resolved, req, res);
    }
  }

  @Get('file')
  @ApiOperation({ summary: 'Stream/serve a raw media file directly, or web-compatible preview' })
  @ApiQuery({ name: 'path', required: false, description: 'Full path or relative path to media file' })
  @ApiQuery({ name: 'file', required: false, description: 'Filename or subpath to media file' })
  @ApiQuery({ name: 'preview', required: false, description: 'If true, generates/streams browser-compatible full-size WebP preview for formats like HEIC/HEIF/RAW' })
  @ApiQuery({ name: 'download', required: false, description: 'If true, forces raw original file stream without conversion' })
  async getMediaFile(
    @Query('path') queryPath: string,
    @Query('file') queryFile: string,
    @Query('preview') queryPreview: string,
    @Query('download') queryDownload: string,
    @Query('vault_token') queryVaultToken: string,
    @Headers('x-vault-token') headerVaultToken: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const target = queryPath || queryFile;
    if (!target || !target.trim()) {
      throw new BadRequestException('Missing file or path parameter');
    }
    const resolved = this.mediaService.resolveMediaFilePath(target);
    this.checkVaultAccess(resolved, headerVaultToken || queryVaultToken);

    const ext = path.extname(resolved).toLowerCase();
    const isHeic = ext === '.heic' || ext === '.heif';
    const isExplicitDownload = queryDownload === 'true' || queryDownload === '1';
    const isExplicitPreview = queryPreview === 'true' || queryPreview === '1';

    // If requested for preview, or if the format is HEIC/HEIF (which browsers cannot render natively) and not explicit download:
    if ((isExplicitPreview || isHeic) && !isExplicitDownload) {
      try {
        const thumb = await this.thumbnailService.getThumbnail(resolved, 1920);
        streamFileSafely(thumb.filePath, req, res, 'image/webp', 'public, max-age=86400');
        return;
      } catch {
        // fallback to raw stream if preview generation fails
      }
    }

    streamFileSafely(resolved, req, res);
  }

  @Get('file-content')
  @ApiOperation({ summary: 'Stream raw binary media content (API for backend engine processing)' })
  @ApiQuery({ name: 'path', required: false, description: 'Full path or relative path to media file' })
  @ApiQuery({ name: 'file', required: false, description: 'Filename or subpath to media file' })
  async getMediaFileContent(
    @Query('path') queryPath: string,
    @Query('file') queryFile: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const target = queryPath || queryFile;
    if (!target || !target.trim()) {
      throw new BadRequestException('Missing file or path parameter');
    }
    const resolved = this.mediaService.resolveMediaFilePath(target);
    streamFileSafely(resolved, req, res);
  }

  @Get('validate-file')
  @ApiOperation({ summary: 'Check if a media file is accessible by the host server' })
  @ApiQuery({ name: 'file', required: true })
  async validateFileAccess(@Query('file') file: string) {
    if (!file || !file.trim()) {
      throw new BadRequestException('Missing file parameter');
    }
    return this.mediaService.verifyFileAccess(file.trim());
  }

  @Get('file-info')
  @ApiOperation({ summary: 'Get full media file item details including latest AI analysis, EXIF and faces' })
  @ApiQuery({ name: 'path', required: false, description: 'Full path or relative path to media file' })
  @ApiQuery({ name: 'file', required: false, description: 'Filename or subpath to media file' })
  async getMediaFileInfo(
    @Query('path') queryPath: string,
    @Query('file') queryFile: string,
  ) {
    const target = queryPath || queryFile;
    if (!target || !target.trim()) {
      throw new BadRequestException('Missing file or path parameter');
    }
    return this.mediaService.getMediaFileInfo(target);
  }

  @Get('sidecar')
  @ApiOperation({ summary: 'Get full sidecar JSON metadata for a media file' })
  @ApiQuery({ name: 'path', required: false })
  @ApiQuery({ name: 'file', required: false })
  async getMediaSidecar(
    @Query('path') queryPath: string,
    @Query('file') queryFile: string,
  ) {
    const target = queryPath || queryFile;
    if (!target || !target.trim()) {
      throw new BadRequestException('Missing file or path parameter');
    }
    return this.mediaService.getMediaSidecar(target);
  }

  @Get('faces-for-file')
  @ApiOperation({ summary: 'Get all face detections and bounding boxes for a specific media file' })
  @ApiQuery({ name: 'file', required: true, description: 'Filename or path to the media file' })
  async getFacesForFile(@Query('file') file: string) {
    return this.mediaService.getFacesForFile(file);
  }

  @Post('add-person')
  @ApiOperation({ summary: 'Add or link a person to a media file' })
  async addPersonToFile(@Body() body: AddPersonToFileDto) {
    return this.mediaService.addPersonToFile(body.file, body.name);
  }

  @Post('remove-face')
  @ApiOperation({ summary: 'Remove or unlink a face/person from a media file' })
  async removeFaceFromFile(@Body() body: RemoveFaceFromFileDto) {
    return this.mediaService.removeFaceFromFile(body.file, body.face_id);
  }

  @Post('metadata')
  @ApiOperation({ summary: 'Update and persist metadata attributes for a media file (descriptions, scene, tags, EXIF)' })
  @ApiResponse({ status: 200, description: 'Metadata successfully saved and synchronized' })
  async updateMetadataPost(@Body() body: UpdateMediaMetadataDto) {
    return this.mediaService.updateMediaMetadata(body);
  }

  @Patch('metadata')
  @ApiOperation({ summary: 'Partially update and persist metadata attributes for a media file' })
  @ApiResponse({ status: 200, description: 'Metadata successfully saved and synchronized' })
  async updateMetadataPatch(@Body() body: UpdateMediaMetadataDto) {
    return this.mediaService.updateMediaMetadata(body);
  }
}

