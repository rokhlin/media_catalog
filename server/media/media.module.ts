import { Module } from '@nestjs/common';
import { MediaController } from './media.controller.js';
import { MediaService } from './media.service.js';
import { ThumbnailService } from './thumbnail.service.js';
import { FamilyTreeModule } from '../family-tree/family-tree.module.js';

@Module({
  imports: [FamilyTreeModule],
  controllers: [MediaController],
  providers: [MediaService, ThumbnailService],
  exports: [MediaService, ThumbnailService],
})
export class MediaModule {}

