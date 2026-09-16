import { Module, forwardRef } from '@nestjs/common';
import { DuplicatesController } from './duplicates.controller.js';
import { DuplicatesService } from './duplicates.service.js';
import { AppConfigModule } from '../config/config.module.js';
import { DatabaseModule } from '../database/database.module.js';
import { MediaModule } from '../media/media.module.js';
import { CatalogerClientModule } from '../cataloger-client/cataloger.module.js';
import { LoggingModule } from '../logging/logging.module.js';

@Module({
  imports: [
    AppConfigModule,
    DatabaseModule,
    forwardRef(() => MediaModule),
    forwardRef(() => CatalogerClientModule),
    LoggingModule,
  ],
  controllers: [DuplicatesController],
  providers: [DuplicatesService],
  exports: [DuplicatesService],
})
export class DuplicatesModule {}
