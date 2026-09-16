import { Injectable, CanActivate, ExecutionContext, ForbiddenException, Inject, Optional } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY, PERMISSIONS_KEY, IS_PUBLIC_KEY } from './auth.decorators.js';

@Injectable()
export class RolesGuard implements CanActivate {
  private readonly reflector: Reflector;

  constructor(@Optional() @Inject(Reflector) reflector?: Reflector) {
    this.reflector = reflector || new Reflector();
  }

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles && !requiredPermissions) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();
    if (!user) {
      if (isPublic) return true;
      throw new ForbiddenException('Access denied: Authentication required');
    }

    // Admins bypass role/permission checks
    if (user.role === 'admin') {
      return true;
    }

    if (requiredRoles && requiredRoles.length > 0) {
      const hasRole = requiredRoles.includes(user.role);
      if (!hasRole) {
        throw new ForbiddenException(`Access denied: Requires role ${requiredRoles.join(' or ')}`);
      }
    }

    if (requiredPermissions && requiredPermissions.length > 0) {
      const userPerms = Array.isArray(user.permissions) ? user.permissions : [];
      const hasPermission = requiredPermissions.some((perm) => userPerms.includes(perm));
      if (!hasPermission) {
        throw new ForbiddenException(`Access denied: Missing required permission(s): ${requiredPermissions.join(' or ')}`);
      }
    }

    return true;
  }
}
