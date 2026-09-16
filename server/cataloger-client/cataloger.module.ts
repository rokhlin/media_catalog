import { Module } from '@nestjs/common';
import { CatalogerController } from './cataloger.controller.js';
import { CatalogerClientService } from './cataloger.service.js';
import { MediaModule } from '../media/media.module.js';
import { GeminiModule } from '../gemini/gemini.module.js';

@Module({
  imports: [MediaModule, GeminiModule],
  controllers: [CatalogerController],
  providers: [CatalogerClientService],
  exports: [CatalogerClientService],
})
export class CatalogerClientModule {}
