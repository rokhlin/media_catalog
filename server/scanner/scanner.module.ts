import { Module } from '@nestjs/common';
import { ScannerService } from './scanner.service.js';
import { AppConfigModule } from '../config/config.module.js';
import { DatabaseModule } from '../database/database.module.js';

@Module({
  imports: [AppConfigModule, DatabaseModule],
  providers: [ScannerService],
  exports: [ScannerService],
})
export class ScannerModule {}
