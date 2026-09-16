import { Module, Global } from '@nestjs/common';
import { UserWorkspaceService } from './user-workspace.service.js';
import { AppConfigModule } from '../config/config.module.js';

@Global()
@Module({
  imports: [AppConfigModule],
  providers: [UserWorkspaceService],
  exports: [UserWorkspaceService],
})
export class WorkspaceModule {}
