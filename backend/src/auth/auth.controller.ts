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

  /**
   * Haqiqiy mijoz manzili.
   *
   * `X-Forwarded-For` ni qo'lda o'qish MUMKIN EMAS: Caddy bu sarlavhani
   * almashtirmaydi, oxiriga qo'shib qo'yadi. Hujumchi
   * `X-Forwarded-For: 1.2.3.4` yuborsa, Caddy uni
   * `1.2.3.4, <haqiqiy-ip>` ga aylantiradi — ya'ni BIRINCHI qiymat
   * hujumchining o'zi yozgan matn bo'ladi.
   *
   * Oqibati og'ir edi: har so'rovda boshqa soxta manzil yuborilsa 5 ta
   * urinish chegarasi hech qachon to'lmaydi (parolni cheksiz tanlash), va
   * fail2ban o'qiydigan «KIRISH XATO» qatoriga ham soxta manzil tushib,
   * hujumchi istalgan IP'ni — shu jumladan sizniki — bloklatib yuborishi
   * mumkin edi.
   *
   * `req.ip` esa Express'ning `trust proxy` sozlamasini hisobga oladi:
   * u ro'yxatni O'NGDAN sanaydi va faqat ishonchli proxy qo'ygan qiymatni
   * oladi. main.ts da `trust proxy = 1` — bitta Caddy.
   */
  private ip(req: Request): string {
    return req.ip || req.socket.remoteAddress || '';
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
