import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Query,
  Param,
  Inject,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { OrganizeService } from './organize.service.js';
import { OrganizationCriteria } from './organize.types.js';

@ApiTags('Organize')
@Controller('api/organize')
export class OrganizeController {
  constructor(@Inject(OrganizeService) private readonly organizeService: OrganizeService) {}

  @Get('status')
  @ApiOperation({ summary: 'Get current background organization job status and progress' })
  getStatus(@Query('jobId') jobId?: string) {
    return this.organizeService.getScanStatus(jobId);
  }

  @Post('start')
  @ApiOperation({ summary: 'Start background media library organization job' })
  startJob(
    @Body()
    body: {
      mode?: 'automatic' | 'semi_automatic';
      criteria?: OrganizationCriteria;
    },
  ) {
    return this.organizeService.startJob({
      mode: body.mode || 'semi_automatic',
      criteria: body.criteria || {},
    });
  }

  @Post('cancel')
  @ApiOperation({ summary: 'Cancel ongoing background organization job' })
  cancelJob(@Body() body?: { jobId?: string }) {
    return this.organizeService.cancelJob(body?.jobId);
  }

  @Get('items')
  @ApiOperation({ summary: 'Get planned or processed organization items for a job' })
  getItems(
    @Query('jobId') jobId: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('status') status?: string,
  ) {
    const lim = limit ? parseInt(limit, 10) : 200;
    const off = offset ? parseInt(offset, 10) : 0;
    return this.organizeService.getItems(jobId, lim, off, status);
  }

  @Patch('items/:id')
  @ApiOperation({ summary: 'Update an organization item (adjust target folder, filename, or tags)' })
  updateItem(
    @Param('id', ParseIntPipe) id: number,
    @Body()
    body: {
      target_folder?: string;
      target_filename?: string;
      assigned_tags?: string[];
      status?: string;
    },
  ) {
    return this.organizeService.updateItem(id, body);
  }

  @Post('apply')
  @ApiOperation({ summary: 'Apply approved organization plan (for semi-automatic mode)' })
  applyPlan(@Body() body: { jobId: string }) {
    return this.organizeService.applyPlan(body.jobId);
  }

  @Post('rollback')
  @ApiOperation({ summary: 'Roll back applied file moves and tags for a job' })
  rollbackPlan(@Body() body: { jobId: string }) {
    return this.organizeService.rollbackPlan(body.jobId);
  }
}
