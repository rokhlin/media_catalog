import { Module } from '@nestjs/common';
import { AppConfigModule } from '../config/config.module.js';
import { FamilyTreeDatabaseService } from './family-tree-db.service.js';
import { GraphIntegrityService } from './graph-integrity.service.js';
import { KinshipEngineService } from './kinship-engine.service.js';
import { FamilyEventsService } from './family-events.service.js';
import { FamilyTreeService } from './family-tree.service.js';
import { FamilyTreePublicService } from './family-tree-public.service.js';
import { FamilyTreeController } from './family-tree.controller.js';

@Module({
  imports: [AppConfigModule],
  controllers: [FamilyTreeController],
  providers: [
    FamilyTreeDatabaseService,
    GraphIntegrityService,
    KinshipEngineService,
    FamilyEventsService,
    FamilyTreeService,
    FamilyTreePublicService,
  ],
  exports: [
    FamilyTreeDatabaseService,
    GraphIntegrityService,
    KinshipEngineService,
    FamilyEventsService,
    FamilyTreeService,
    FamilyTreePublicService,
  ],
})
export class FamilyTreeModule {}
