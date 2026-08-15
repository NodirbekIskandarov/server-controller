import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';

interface Attempt {
  fails: number;
  until: number;
  /** Oxirgi urinish vaqti — eskirgan yozuvni tashlash uchun. */
  at: number;
}

/**
 * Bitta admin hisobi. Parol muhitda bcrypt xeshi ko'rinishida turadi —
 * ochiq matnda hech qayerda saqlanmaydi.
 */
@Injectable()
export class AuthService {
  private readonly log = new Logger(AuthService.name);
  private readonly attempts = new Map<string, Attempt>();
  private readonly MAX_FAILS = 5;
  private readonly LOCK_MS = 15 * 60 * 1000;
  /** Shundan keyin qulflanmagan yozuv ma'nosini yo'qotadi. */
  private readonly FORGET_MS = 60 * 60 * 1000;
  /** Xotira uchun qattiq chegara — sweep yetishmay qolsa ham o'smasin. */
  private readonly MAX_TRACKED = 10_000;

  constructor(
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
  ) {}

  private locked(ip: string): number {
    const a = this.attempts.get(ip);
    if (!a) return 0;
    if (a.until > Date.now()) return Math.ceil((a.until - Date.now()) / 60000);
    if (a.until) this.attempts.delete(ip);
    return 0;
  }

  /**
   * Eskirgan yozuvlarni tashlaydi.
   *
   * Busiz Map faqat o'sardi: har bir yangi manba manzili abadiy yozuv
   * qoldirardi va uni tozalaydigan joy yo'q edi. Bot skanerlari kuniga
   * minglab turli IP'dan kelishini hisobga olsak, bu sekin ishlaydigan
   * xotira oqishi.
   */
  private sweep() {
    const now = Date.now();
    for (const [ip, a] of this.attempts) {
      const expired = a.until ? a.until <= now : now - a.at > this.FORGET_MS;
      if (expired) this.attempts.delete(ip);
    }
    // Sweep yetmasa (juda tez oqim) — eng eskilarini majburan tashlaymiz.
    if (this.attempts.size > this.MAX_TRACKED) {
      const oldest = [...this.attempts.entries()]
        .sort((x, y) => x[1].at - y[1].at)
        .slice(0, this.attempts.size - this.MAX_TRACKED);
      for (const [ip] of oldest) this.attempts.delete(ip);
    }
  }

  private fail(ip: string) {
    this.sweep();
    const a = this.attempts.get(ip) || { fails: 0, until: 0, at: 0 };
    a.fails++;
    a.at = Date.now();
    if (a.fails >= this.MAX_FAILS) {
      a.until = Date.now() + this.LOCK_MS;
      a.fails = 0;
      this.log.warn(`Kirish qulflandi: ${ip}`);
    }
    this.attempts.set(ip, a);
  }

  async login(username: string, password: string, ip: string) {
    const minutes = this.locked(ip);
    if (minutes) {
      throw new UnauthorizedException(
        `Juda ko'p xato urinish. ${minutes} daqiqadan keyin urinib ko'ring.`,
      );
    }

    const expectedUser = this.config.get<string>('ADMIN_USER', '');
    const hash = this.config.get<string>('ADMIN_PASSWORD_HASH', '');
    if (!expectedUser || !hash) {
      throw new UnauthorizedException('Server sozlanmagan.');
    }

    // Parolni har doim tekshiramiz — login xato bo'lsa ham. Aks holda
    // javob vaqti bo'yicha login mavjudligini aniqlab olish mumkin.
    const ok = await bcrypt.compare(password || '', hash);
    if (username?.trim().toLowerCase() !== expectedUser.toLowerCase() || !ok) {
      this.fail(ip);
      // fail2ban shu qatorni o'qib IP'ni firewall darajasida bloklaydi.
      this.log.warn(`KIRISH XATO: ${ip}`);
      throw new UnauthorizedException('Login yoki parol noto`g`ri.');
    }

    this.attempts.delete(ip);
    this.log.log(`Kirdi: ${expectedUser} (${ip})`);
    const token = await this.jwt.signAsync({ sub: expectedUser });
    return { token, username: expectedUser };
  }

  async verify(token: string): Promise<{ sub: string } | null> {
    try {
      return await this.jwt.verifyAsync<{ sub: string }>(token);
    } catch {
      return null;
    }
  }
}
