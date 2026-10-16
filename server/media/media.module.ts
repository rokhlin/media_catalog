import { Module, forwardRef } from '@nestjs/common';
import { MediaController } from './media.controller.js';
import { MediaService } from './media.service.js';
import { ThumbnailService } from './thumbnail.service.js';
import { FamilyTreeModule } from '../family-tree/family-tree.module.js';
import { CatalogerClientModule } from '../cataloger-client/cataloger.module.js';

@Module({
  imports: [FamilyTreeModule, forwardRef(() => CatalogerClientModule)],
  controllers: [MediaController],
  providers: [MediaService, ThumbnailService],
  exports: [MediaService, ThumbnailService],
})
export class MediaModule {}

