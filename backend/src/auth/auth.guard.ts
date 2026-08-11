import {
  CanActivate, ExecutionContext, Injectable, UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthService } from './auth.service';

export const PUBLIC_KEY = 'ochiq';
export const Public = () => (target: any, key?: any, descriptor?: any) => {
  Reflect.defineMetadata(PUBLIC_KEY, true, descriptor?.value ?? target);
  return descriptor ?? target;
};

export const COOKIE = 'sc_token';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly auth: AuthService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest();
    // SSE brauzerdan EventSource orqali keladi — u sarlavha qo'sha
    // olmaydi, shuning uchun cookie asosiy usul.
    const token =
      req.cookies?.[COOKIE] ||
      (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!token) throw new UnauthorizedException('Kirish kerak');

    const payload = await this.auth.verify(token);
    if (!payload) throw new UnauthorizedException('Sessiya tugagan');
    req.user = payload;
    return true;
  }
}
