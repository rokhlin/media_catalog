import { Module } from '@nestjs/common';
import { AppConfigModule } from './config/config.module.js';
import { LoggingModule } from './logging/logging.module.js';
import { DatabaseModule } from './database/database.module.js';
import { AuthModule } from './auth/auth.module.js';
import { VaultModule } from './vault/vault.module.js';
import { MediaModule } from './media/media.module.js';
import { FacesModule } from './faces/faces.module.js';
import { SettingsModule } from './settings/settings.module.js';
import { CatalogerClientModule } from './cataloger-client/cataloger.module.js';
import { FamilyTreeModule } from './family-tree/family-tree.module.js';
import { DuplicatesModule } from './duplicates/duplicates.module.js';
import { BackupModule } from './backup/backup.module.js';
import { OrganizeModule } from './organize/organize.module.js';
import { GeminiModule } from './gemini/gemini.module.js';
import { WorkspaceModule } from './workspace/workspace.module.js';

@Module({
  imports: [
    WorkspaceModule,
    AppConfigModule,
    LoggingModule,
    DatabaseModule,
    AuthModule,
    VaultModule,
    MediaModule,
    FacesModule,
    SettingsModule,
    CatalogerClientModule,
    FamilyTreeModule,
    DuplicatesModule,
    BackupModule,
    OrganizeModule,
    GeminiModule,
  ],
})
export class AppModule {}

