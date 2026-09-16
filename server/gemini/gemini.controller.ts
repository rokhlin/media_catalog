import { Controller, Get, Post, Body, Query, HttpException, HttpStatus, Inject, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { GeminiService } from './gemini.service.js';
import { JwtAuthGuard } from '../auth/auth.guard.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { Public, RequirePermissions } from '../auth/auth.decorators.js';

@ApiTags('gemini')
@Controller('api/gemini')
@UseGuards(JwtAuthGuard, RolesGuard)
export class GeminiController {
  constructor(@Inject(GeminiService) private readonly geminiService: GeminiService) {}

  @Public()
  @Get('status')
  @ApiOperation({ summary: 'Get Gemini API integration status and limits' })
  @ApiResponse({ status: 200, description: 'Gemini integration status' })
  getStatus() {
    return this.geminiService.getStatus();
  }

  @Post('validate')
  @RequirePermissions('admin_panel')
  @ApiOperation({ summary: 'Validate Google Gemini API credentials and model connection' })
  @ApiResponse({ status: 200, description: 'Validation results with latency and diagnostic details' })
  async validateCredentials(@Body() body?: { apiKey?: string; model?: string }) {
    return await this.geminiService.validateConnection(body?.apiKey, body?.model);
  }

  @Get('validate')
  @RequirePermissions('admin_panel')
  @ApiOperation({ summary: 'Validate active Google Gemini credentials and model connection' })
  @ApiResponse({ status: 200, description: 'Validation results of active configuration' })
  async validateActiveCredentials() {
    return await this.geminiService.validateConnection();
  }

  @Post('analyze-photo')
  @RequirePermissions('admin_panel', 'edit_metadata')
  @ApiOperation({ summary: 'Perform direct Gemini semantic analysis on a single photo' })
  async analyzePhoto(
    @Query('file') file?: string,
    @Body() body?: { file?: string; exif_data?: any; target_tags?: string[]; tag_format?: 'categorized' | 'flat' | 'prefixed'; custom_prompt?: string; vision_prompt_template?: string; faces_data?: any[] }
  ) {
    const targetFile = file || body?.file;
    if (!targetFile || !String(targetFile).trim()) {
      throw new HttpException('File parameter cannot be empty.', HttpStatus.BAD_REQUEST);
    }

    try {
      return await this.geminiService.analyzePhoto(
        String(targetFile).trim(),
        body?.exif_data,
        body?.target_tags,
        body?.tag_format || 'categorized',
        body?.custom_prompt || body?.vision_prompt_template,
        body?.faces_data
      );
    } catch (err: any) {
      throw new HttpException(`Gemini photo analysis failed: ${err.message}`, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post('analyze-video')
  @RequirePermissions('admin_panel', 'edit_metadata')
  @ApiOperation({ summary: 'Perform direct Gemini semantic analysis on a video file' })
  async analyzeVideo(
    @Query('file') file?: string,
    @Body() body?: { file?: string; transcription?: string; transcription_ru?: string; target_tags?: string[]; tag_format?: 'categorized' | 'flat' | 'prefixed'; custom_prompt?: string; vision_prompt_template?: string; faces_data?: any }
  ) {
    const targetFile = file || body?.file;
    if (!targetFile || !String(targetFile).trim()) {
      throw new HttpException('File parameter cannot be empty.', HttpStatus.BAD_REQUEST);
    }

    try {
      return await this.geminiService.analyzeVideo(
        String(targetFile).trim(),
        body?.transcription,
        body?.transcription_ru,
        body?.target_tags,
        body?.tag_format || 'categorized',
        body?.custom_prompt || body?.vision_prompt_template,
        body?.faces_data
      );
    } catch (err: any) {
      throw new HttpException(`Gemini video analysis failed: ${err.message}`, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post('analyze-duplicates')
  @RequirePermissions('admin_panel')
  @ApiOperation({ summary: 'Analyze burst duplicates series with defect audit via Gemini' })
  async analyzeDuplicates(@Body() body: { files: string[] }) {
    if (!body?.files || !Array.isArray(body.files) || body.files.length < 2) {
      throw new HttpException('At least two files must be provided for duplicate analysis.', HttpStatus.BAD_REQUEST);
    }

    try {
      return await this.geminiService.analyzeDuplicates(body.files);
    } catch (err: any) {
      throw new HttpException(`Gemini duplicate analysis failed: ${err.message}`, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
