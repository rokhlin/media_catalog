import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module.js';
import { MediaModule } from '../media/media.module.js';
import { LoggingModule } from '../logging/logging.module.js';
import { OrganizeService } from './organize.service.js';
import { OrganizeController } from './organize.controller.js';

@Module({
  imports: [DatabaseModule, MediaModule, LoggingModule],
  controllers: [OrganizeController],
  providers: [OrganizeService],
  exports: [OrganizeService],
})
export class OrganizeModule {}
