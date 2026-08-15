import { Injectable, Logger } from '@nestjs/common';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);

/**
 * Tizim buyruqlarini xavfsiz ishga tushiradi.
 *
 * Nega execFile, exec emas: exec buyruqni shell orqali o'tkazadi, ya'ni
 * argument ichidagi `;` yoki `$(...)` bajarilib ketishi mumkin. execFile
 * argumentlarni to'g'ridan-to'g'ri jarayonga beradi — shell umuman
 * ishtirok etmaydi, shuning uchun buyruq in'ektsiyasi imkonsiz.
 *
 * Kuzatuv qismi faqat o'qiydi (`exec`, `execBoth`), yozish amallari esa
 * `run()` orqali ketadi va ular `ControlService`da chegaralanadi.
 */
@Injectable()
export class ShellService {
  private readonly log = new Logger(ShellService.name);

  async exec(
    cmd: string,
    args: string[] = [],
    timeoutMs = 15_000,
  ): Promise<string> {
    try {
      const { stdout } = await run(cmd, args, {
        timeout: timeoutMs,
        maxBuffer: 12 * 1024 * 1024,
        env: { ...process.env, LANG: 'C', LC_ALL: 'C' },
      });
      return stdout;
    } catch (err: any) {
      // Ba'zi buyruqlar (df, docker) qisman xato bilan ham foydali
      // chiqish beradi — bor narsani qaytaramiz.
      if (err?.stdout) return err.stdout;
      this.log.debug(`${cmd} ${args.join(' ')} -> ${err?.message}`);
      return '';
    }
  }

  /**
   * Ikkala oqimni ham qaytaradi.
   *
   * Kerak bo'ladigan joy: `docker logs`. Konteyner stderr'ga yozsa
   * (Caddy access loglari aynan shunday), faqat stdout o'qilsa ma'lumot
   * yo'qoladi.
   */
  async execBoth(
    cmd: string,
    args: string[] = [],
    timeoutMs = 30_000,
  ): Promise<string> {
    try {
      const { stdout, stderr } = await run(cmd, args, {
        timeout: timeoutMs,
        maxBuffer: 24 * 1024 * 1024,
        env: { ...process.env, LANG: 'C', LC_ALL: 'C' },
      });
      return (stdout || '') + (stderr || '');
    } catch (err: any) {
      return (err?.stdout || '') + (err?.stderr || '');
    }
  }

  /**
   * Natijasi muhim bo'lgan buyruq uchun.
   *
   * `exec` xatoni yutib bo'sh satr qaytaradi — KUZATUV uchun bu to'g'ri:
   * bitta buyruq ishlamasa ham qolgan ma'lumot ko'rsatilaveradi. Lekin
   * YOZISH amali uchun yaramaydi — «xizmat to'xtadimi yoki yo'qmi?» degan
   * savolga «bo'sh satr» javob emas. Shuning uchun bu yerda chiqish kodi
   * ham, stderr ham to'liq qaytariladi.
   */
  async run(
    cmd: string,
    args: string[] = [],
    timeoutMs = 20_000,
  ): Promise<{ ok: boolean; stdout: string; stderr: string; code: number }> {
    try {
      const { stdout, stderr } = await run(cmd, args, {
        timeout: timeoutMs,
        maxBuffer: 8 * 1024 * 1024,
        env: { ...process.env, LANG: 'C', LC_ALL: 'C' },
      });
      return { ok: true, stdout: stdout || '', stderr: stderr || '', code: 0 };
    } catch (err: any) {
      return {
        ok: false,
        stdout: err?.stdout || '',
        stderr: err?.stderr || err?.message || 'noma`lum xato',
        code: typeof err?.code === 'number' ? err.code : 1,
      };
    }
  }

  /** Chiqishni qatorlarga bo'ladi, bo'shlarini tashlaydi. */
  lines(text: string): string[] {
    return text
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
  }

  /** Har qatori JSON bo'lgan chiqishni o'qiydi (docker --format '{{json .}}'). */
  jsonLines<T = any>(text: string): T[] {
    const out: T[] = [];
    for (const line of this.lines(text)) {
      try {
        out.push(JSON.parse(line));
      } catch {
        /* buzuq qator — o'tkazib yuboramiz */
      }
    }
    return out;
  }
}
