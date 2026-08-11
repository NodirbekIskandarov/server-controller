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
 * Bu ilova faqat O'QIYDI. Hech qanday buyruq tizimni o'zgartirmaydi.
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
