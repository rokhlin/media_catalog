import { Module } from '@nestjs/common';
import { GeminiService } from './gemini.service.js';
import { GeminiController } from './gemini.controller.js';
import { AppConfigModule } from '../config/config.module.js';
import { DatabaseModule } from '../database/database.module.js';
import { LoggingModule } from '../logging/logging.module.js';

@Module({
  imports: [AppConfigModule, DatabaseModule, LoggingModule],
  controllers: [GeminiController],
  providers: [GeminiService],
  exports: [GeminiService],
})
export class GeminiModule {}
