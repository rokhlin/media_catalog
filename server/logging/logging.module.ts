import { Module, Global } from '@nestjs/common';
import { LogBufferService } from './log-buffer.service.js';
import { AppConfigModule } from '../config/config.module.js';

@Global()
@Module({
  imports: [AppConfigModule],
  providers: [LogBufferService],
  exports: [LogBufferService],
})
export class LoggingModule {}
