import {
  Body, Controller, Get, Post, Req, Res, UseGuards,
} from '@nestjs/common';
import { IsString, MaxLength } from 'class-validator';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { AuthGuard, COOKIE, Public } from './auth.guard';

class LoginDto {
  @IsString() @MaxLength(64) username: string;
  @IsString() @MaxLength(256) password: string;
}

@Controller('api/auth')
@UseGuards(AuthGuard)
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  private ip(req: Request): string {
    const fwd = (req.headers['x-forwarded-for'] as string) || '';
    return fwd.split(',')[0].trim() || req.socket.remoteAddress || '';
  }

  @Public()
  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { token, username } = await this.auth.login(
      dto.username, dto.password, this.ip(req),
    );
    res.cookie(COOKIE, token, {
      httpOnly: true,
      secure: process.env.COOKIE_SECURE !== 'false',
      sameSite: 'strict',
      path: '/',
      maxAge: 12 * 3600 * 1000,
    });
    return { username };
  }

  @Post('logout')
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(COOKIE, { path: '/' });
    return { ok: true };
  }

  @Get('session')
  session(@Req() req: any) {
    return { username: req.user?.sub, serverTime: new Date().toISOString() };
  }
}
