import { Controller, Get, Post, Body, Param, Query, Res, Inject, NotFoundException, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import type { Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import { FacesService } from './faces.service.js';
import {
  RenameFaceDto,
  AssignFaceDto,
  AssignGroupDto,
  ResetFaceDto,
  ResetFaceByFilenameDto,
  DeleteFaceDto,
  DeleteFacesBatchDto,
} from './dto/faces.dto.js';
import { JwtAuthGuard } from '../auth/auth.guard.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { Public, RequirePermissions } from '../auth/auth.decorators.js';

@ApiTags('faces')
@Controller('api/faces')
@UseGuards(JwtAuthGuard, RolesGuard)
export class FacesController {
  constructor(@Inject(FacesService) private readonly facesService: FacesService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'List all registered faces in the database' })
  async listFaces() {
    return this.facesService.getAllRegisteredFaces();
  }

  @Public()
  @Get('persons')
  @ApiOperation({ summary: 'List known persons with reference face collections and media counts' })
  async listKnownPersons() {
    return this.facesService.getKnownPersons();
  }

  @Public()
  @Get('unrecognized')
  @ApiOperation({ summary: 'List unrecognized face crops waiting for user labeling' })
  async listUnrecognizedFaces() {
    return this.facesService.getUnrecognizedFaces();
  }

  @Public()
  @Get('unrecognized-groups')
  @ApiOperation({ summary: 'List unrecognized faces clustered into similarity groups' })
  @ApiQuery({ name: 'threshold', required: false, type: Number })
  async listUnrecognizedGroups(@Query('threshold') threshold?: number) {
    return this.facesService.getUnrecognizedGroups(threshold ? Number(threshold) : undefined);
  }

  @Public()
  @Get('groups')
  @ApiOperation({ summary: 'Alias for unrecognized face similarity groups' })
  @ApiQuery({ name: 'threshold', required: false, type: Number })
  async listFaceGroups(@Query('threshold') threshold?: number) {
    return this.facesService.getUnrecognizedGroups(threshold ? Number(threshold) : undefined);
  }

  @Public()
  @Get('image/:filename')
  @ApiOperation({ summary: 'Serve cropped face thumbnail image' })
  async getFaceImage(@Param('filename') filename: string, @Res() res: Response) {
    const cleanName = (filename || '').trim();
    if (cleanName.startsWith('face_manual_') || cleanName.startsWith('manual_')) {
      res.setHeader('Content-Type', 'image/svg+xml');
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      return res.send(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#94a3b8"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>'
      );
    }

    try {
      const resolved = this.facesService.getFaceImagePath(filename);
      if (fs.existsSync(resolved)) {
        res.setHeader('Content-Type', 'image/jpeg');
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        const stream = fs.createReadStream(resolved);
        stream.on('error', () => {
          if (!res.headersSent) res.status(500).end();
        });
        return stream.pipe(res);
      }
    } catch {
      // Fallback
    }
      // Proxy fallback from remote cataloger backend if face image is on the worker daemon
      const baseUrl = this.facesService.catalogerApiUrl;
      const baseClean = path.basename(cleanName);
      const candidates = Array.from(new Set([
        cleanName,
        baseClean,
        `${cleanName}.jpg`,
        `${baseClean}.jpg`,
        `${cleanName}.jpeg`,
        `${baseClean}.jpeg`,
        `${cleanName}.png`,
        `${baseClean}.png`,
        `facess/${cleanName}.jpg`,
        `facess/${baseClean}.jpg`,
        `faces/${cleanName}.jpg`,
        `faces/${baseClean}.jpg`,
        `crops/${cleanName}.jpg`,
        `crops/${baseClean}.jpg`,
      ]));

      for (const cand of candidates) {
        try {
          const remoteUrl = `${baseUrl}/api/faces/image/${encodeURIComponent(cand)}`;
          const response = await axios.get(remoteUrl, { responseType: 'arraybuffer', timeout: 4000 });
          if (response.data && response.data.byteLength > 0) {
            const contentType = response.headers['content-type'] ? String(response.headers['content-type']) : 'image/jpeg';
            res.setHeader('Content-Type', contentType);

            // Cache locally so future loads are instantaneous
            try {
              const facesFolder = this.facesService.facesFolder;
              if (facesFolder) {
                if (!fs.existsSync(facesFolder)) {
                  fs.mkdirSync(facesFolder, { recursive: true });
                }
                const localPath = path.join(facesFolder, `${baseClean}.jpg`);
                fs.writeFileSync(localPath, Buffer.from(response.data));
              }
            } catch {
              // ignore cache save errors
            }

            return res.send(Buffer.from(response.data));
          }
        } catch {
          // try next candidate
        }
      }

      throw new NotFoundException(`Face image '${filename}' not found`);
  }

  @Post('rename')
  @RequirePermissions('manage_faces')
  @ApiOperation({ summary: 'Rename a face registry entry or person' })
  async renameFace(@Body() body: RenameFaceDto) {
    return this.facesService.renameFace(body.face_id, body.name);
  }

  @Post('assign')
  @RequirePermissions('manage_faces')
  @ApiOperation({ summary: 'Assign an unrecognized face to a known or new person' })
  async assignFace(@Body() body: AssignFaceDto) {
    return this.facesService.assignFace(body.face_id, body.name);
  }

  @Post('assign-group')
  @RequirePermissions('manage_faces')
  @ApiOperation({ summary: 'Assign a group/cluster of similar faces to a person' })
  async assignGroup(@Body() body: AssignGroupDto) {
    return this.facesService.assignGroup(body.face_ids, body.name);
  }

  @Post('reset')
  @RequirePermissions('manage_faces')
  @ApiOperation({ summary: 'Reset a face assignment back to unassigned candidate' })
  async resetFace(@Body() body: ResetFaceDto) {
    return this.facesService.resetFace(body.face_id);
  }

  @Post('reset-by-filename')
  @RequirePermissions('manage_faces')
  @ApiOperation({ summary: 'Reset all face assignments for a specific filename' })
  async resetFacesByFilename(@Body() body: ResetFaceByFilenameDto) {
    return this.facesService.resetFacesByFilename(body.filename);
  }

  @Post('reset-by-file')
  @RequirePermissions('manage_faces')
  @ApiOperation({ summary: 'Alias for reset-by-filename' })
  async resetFacesByFile(@Body() body: ResetFaceByFilenameDto) {
    return this.facesService.resetFacesByFilename(body.filename);
  }

  @Post('delete')
  @RequirePermissions('manage_faces')
  @ApiOperation({ summary: 'Delete a face entry and its file asset' })
  async deleteFace(@Body() body: DeleteFaceDto) {
    return this.facesService.deleteFace(body.face_id);
  }

  @Post('delete-batch')
  @RequirePermissions('manage_faces')
  @ApiOperation({ summary: 'Delete multiple face entries and their file assets' })
  async deleteFacesBatch(@Body() body: DeleteFacesBatchDto) {
    return this.facesService.deleteFacesBatch(body.face_ids);
  }

  @Post('delete-group')
  @RequirePermissions('manage_faces')
  @ApiOperation({ summary: 'Alias for delete-batch to delete an entire face group' })
  async deleteFaceGroup(@Body() body: DeleteFacesBatchDto) {
    return this.facesService.deleteFacesBatch(body.face_ids);
  }
}
