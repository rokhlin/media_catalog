import { Module, Global } from '@nestjs/common';
import { VaultService } from './vault.service.js';
import { VaultController } from './vault.controller.js';
import { DatabaseModule } from '../database/database.module.js';

@Global()
@Module({
  imports: [DatabaseModule],
  controllers: [VaultController],
  providers: [VaultService],
  exports: [VaultService],
})
export class VaultModule {}
