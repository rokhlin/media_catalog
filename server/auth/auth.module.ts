import { Module, Global } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthService } from './auth.service.js';
import { AuthController } from './auth.controller.js';
import { JwtAuthGuard } from './auth.guard.js';
import { RolesGuard } from './roles.guard.js';
import { PathValidationGuard } from './guards/path-validation.guard.js';
import { DatabaseModule } from '../database/database.module.js';
import { AppConfigModule } from '../config/config.module.js';

@Global()
@Module({
  imports: [DatabaseModule, AppConfigModule],
  controllers: [AuthController],
  providers: [Reflector, AuthService, JwtAuthGuard, RolesGuard, PathValidationGuard],
  exports: [Reflector, AuthService, JwtAuthGuard, RolesGuard, PathValidationGuard],
})
export class AuthModule {}
