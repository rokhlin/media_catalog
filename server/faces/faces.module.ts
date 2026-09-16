import { Module } from '@nestjs/common';
import { FacesController } from './faces.controller.js';
import { FacesService } from './faces.service.js';
import { FamilyTreeModule } from '../family-tree/family-tree.module.js';

@Module({
  imports: [FamilyTreeModule],
  controllers: [FacesController],
  providers: [FacesService],
  exports: [FacesService],
})
export class FacesModule {}
