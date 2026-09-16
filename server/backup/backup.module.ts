import { Module } from '@nestjs/common';
import { BackupService } from './backup.service.js';
import { BackupSchedulerService } from './backup-scheduler.service.js';
import { BackupController } from './backup.controller.js';
import { AppConfigModule } from '../config/config.module.js';
import { DatabaseModule } from '../database/database.module.js';
import { FamilyTreeModule } from '../family-tree/family-tree.module.js';

@Module({
  imports: [
    AppConfigModule,
    DatabaseModule,
    FamilyTreeModule,
  ],
  controllers: [BackupController],
  providers: [BackupService, BackupSchedulerService],
  exports: [BackupService, BackupSchedulerService],
})
export class BackupModule {}
