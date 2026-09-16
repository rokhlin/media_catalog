import { Injectable, CanActivate, ExecutionContext, UnauthorizedException, Inject, Optional } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthService } from './auth.service.js';
import { IS_PUBLIC_KEY } from './auth.decorators.js';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly reflector: Reflector;

  constructor(
    @Inject(AuthService) private readonly authService: AuthService,
    @Optional() @Inject(Reflector) reflector?: Reflector,
  ) {
    this.reflector = reflector || new Reflector();
  }

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const request = context.switchToHttp().getRequest();
    const token = this.extractTokenFromHeader(request);

    if (token) {
      try {
        const payload = this.authService.verifyToken(token);
        request.user = payload;
        return true;
      } catch (err) {
        if (!isPublic) {
          throw new UnauthorizedException('Invalid or expired authentication token');
        }
      }
    }

    if (isPublic) {
      return true;
    }

    throw new UnauthorizedException('Authentication credentials required');
  }

  private extractTokenFromHeader(request: any): string | null {
    const authHeader = request.headers?.authorization;
    if (authHeader && typeof authHeader === 'string') {
      const [type, token] = authHeader.split(' ');
      if (type === 'Bearer' && token) {
        return token;
      }
    }
    // Also check query param fallback for direct image/video preview URLs
    if (request.query?.token && typeof request.query.token === 'string') {
      return request.query.token;
    }
    return null;
  }
}
