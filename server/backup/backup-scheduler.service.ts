import { Injectable, Logger, OnModuleInit, OnModuleDestroy, Inject, forwardRef } from '@nestjs/common';
import { CronJob } from 'cron';
import { AppConfigService } from '../config/config.service.js';
import { BackupService } from './backup.service.js';

@Injectable()
export class BackupSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BackupSchedulerService.name);
  private cronJob: CronJob | null = null;
  private isRunning = false;

  constructor(
    @Inject(AppConfigService) private readonly config: AppConfigService,
    @Inject(forwardRef(() => BackupService)) private readonly backupService: BackupService,
  ) {}

  onModuleInit() {
    this.initScheduler();
  }

  onModuleDestroy() {
    this.stopScheduler();
  }

  public initScheduler(): void {
    const cronExp = this.config.backupCron;
    const isEnabled = this.config.backupEnabled;

    this.stopScheduler();

    if (!isEnabled) {
      this.logger.log('Automated system backup cron is currently disabled in configuration.');
      return;
    }

    try {
      this.cronJob = new CronJob(
        cronExp,
        async () => {
          await this.handleCronTick();
        },
        null,
        false,
      );

      this.cronJob.start();
      this.isRunning = true;
      const nextRun = this.getNextRunDate();
      this.logger.log(`Automated system backup scheduler initialized [${cronExp}]. Next run: ${nextRun || 'N/A'}`);
    } catch (err: any) {
      this.logger.error(`Failed to initialize backup cron scheduler with expression '${cronExp}': ${err.message}`);
    }
  }

  public stopScheduler(): void {
    if (this.cronJob) {
      try {
        this.cronJob.stop();
      } catch (err: any) {
        this.logger.warn(`Error stopping cron job: ${err.message}`);
      }
      this.cronJob = null;
    }
    this.isRunning = false;
  }

  public updateSchedule(cronExp: string, enabled: boolean): void {
    this.logger.log(`Updating backup cron scheduler: exp='${cronExp}', enabled=${enabled}`);
    this.stopScheduler();

    if (!enabled) {
      return;
    }

    try {
      this.cronJob = new CronJob(
        cronExp,
        async () => {
          await this.handleCronTick();
        },
        null,
        false,
      );

      this.cronJob.start();
      this.isRunning = true;
      const nextRun = this.getNextRunDate();
      this.logger.log(`Backup cron scheduler updated. Next run: ${nextRun || 'N/A'}`);
    } catch (err: any) {
      this.logger.error(`Failed to apply new cron expression '${cronExp}': ${err.message}`);
      throw new Error(`Invalid cron expression: ${err.message}`);
    }
  }

  public getNextRunDate(): string | null {
    if (!this.cronJob || !this.isRunning) return null;
    try {
      const next = this.cronJob.nextDate();
      return next ? next.toISO() : null;
    } catch {
      return null;
    }
  }

  private async handleCronTick(): Promise<void> {
    this.logger.log('Executing automated scheduled system backup...');
    try {
      const result = await this.backupService.createBackup({
        trigger: 'scheduled',
        description: 'Automated scheduled backup snapshot',
      });
      this.logger.log(`Scheduled backup created successfully: ${result.filename} (${result.sizeBytes} bytes)`);
    } catch (err: any) {
      this.logger.error(`Scheduled system backup failed: ${err.message}`, err.stack);
    }
  }
}
