import {
  BadRequestException, ForbiddenException, Injectable, NotFoundException,
} from '@nestjs/common';
import { copyFile, readFile, readdir, realpath, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { AuditService } from '../audit/audit.service';
import type { Actor } from '../common/actor';
import { FILE_ROOTS, MAX_FILE_BYTES } from '../common/limits';

export interface FileEntry {
  name: string;
  path: string;
  dir: boolean;
  sizeBytes: number;
  modifiedAt: string | null;
  /** Panelda ochish mumkinmi — hajm va tur bo'yicha. */
  editable: boolean;
}

/**
 * Fayllarni ko'rish va tahrirlash.
 *
 * Bu panelning eng xavfli qismi: `/opt` ostidagi skript matnini
 * o'zgartirish — serverda kod bajarish bilan barobar. Shuning uchun
 * chegaralar bir necha qatlamda:
 *
 *   1. Yo'l OQ RO'YXATdagi katalog ichida bo'lishi shart.
 *   2. Yo'l normalizatsiya qilinadi — `..` bilan yuqoriga chiqib
 *      bo'lmaydi.
 *   3. Simvolik havolalar OChILADI va natija qayta tekshiriladi:
 *      `/opt/x -> /etc/shadow` havolasi ikkinchi tekshiruvda tushadi.
 *   4. Yozishdan oldin zaxira nusxa olinadi — xato tahrir qaytariladi.
 *   5. Har tahrir auditga tushadi.
 */
@Injectable()
export class FilesService {
  constructor(private readonly audit: AuditService) {}

  /** Yo'l ruxsat etilgan ildizlardan birining ichidami. */
  private inRoots(path: string): boolean {
    return FILE_ROOTS.some((root) => path === root || path.startsWith(`${root}/`));
  }

  /**
   * Tashqaridan kelgan yo'lni tekshiradi va HAQIQIY yo'lni qaytaradi.
   *
   * Nega mavjudlik ham shart qilingan: mavjud bo'lmagan yo'l uchun
   * simvolik havolani ochib bo'lmaydi, ya'ni 3-qatlam ishlamaydi.
   * Panel fayl menejeri emas — mavjud sozlamani tahrirlash uchun bu
   * cheklov hech narsani yo'qotmaydi, lekin butun bir chekka holatlar
   * to'plamini olib tashlaydi.
   */
  private async safePath(raw: string): Promise<string> {
    const input = String(raw || '').trim();
    if (!input.startsWith('/')) {
      throw new BadRequestException('Yo`l `/` bilan boshlanishi kerak.');
    }
    if (input.includes('\0')) {
      throw new BadRequestException('Yo`lda ruxsat etilmagan belgi bor.');
    }

    // resolve() `..` va `.` ni yechadi: `/opt/../etc/passwd` -> `/etc/passwd`,
    // ya'ni chiqib ketish urinishi shu yerdayoq oddiy yo'lga aylanadi va
    // keyingi tekshiruvda ushlanadi.
    const path = resolve(input);
    if (!this.inRoots(path)) {
      throw new ForbiddenException(
        `Bu yo'l ruxsat etilmagan. Faqat: ${FILE_ROOTS.join(', ')}`,
      );
    }

    let real: string;
    try {
      real = await realpath(path);
    } catch {
      throw new NotFoundException(`Topilmadi: ${path}`);
    }
    // Havola ochilgandan keyin ildiz o'zgargan bo'lishi mumkin.
    if (!this.inRoots(real)) {
      throw new ForbiddenException(
        'Bu yo`l ruxsat etilgan katalogdan tashqariga havola qilyapti.',
      );
    }
    return real;
  }

  /**
   * Ikkilik faylni rad etadi.
   *
   * NUL bayti matnli faylda deyarli uchramaydi, ikkilik faylda esa
   * darhol chiqadi — shuning uchun boshidagi bo'lakni tekshirish yetarli.
   * Ikkilik faylni matn sifatida ochib saqlash uni buzadi: `writeFile`
   * utf8 bilan yozganda o'qib bo'lmagan baytlar `` ga aylanadi.
   */
  private looksBinary(buf: Buffer): boolean {
    const head = buf.subarray(0, 8192);
    return head.includes(0);
  }

  private editable(name: string, size: number, dir: boolean): boolean {
    return !dir && size <= MAX_FILE_BYTES && !/\.(png|jpe?g|gif|webp|ico|pdf|zip|gz|tar|xz|so|node|woff2?|mp4|db|sqlite3?)$/i.test(name);
  }

  /** Katalog tarkibi. Ildizning o'zi so'ralsa — ruxsat etilgan ro'yxat. */
  async list(rawPath?: string) {
    const path = rawPath ? await this.safePath(rawPath) : FILE_ROOTS[0];
    const info = await stat(path);
    if (!info.isDirectory()) {
      throw new BadRequestException(`${path} — katalog emas.`);
    }

    const names = await readdir(path);
    const entries: FileEntry[] = [];
    for (const name of names.slice(0, 800)) {
      const child = `${path === '/' ? '' : path}/${name}`;
      try {
        // lstat emas, stat: havola ko'rsatgan narsaning hajmi kerak.
        const s = await stat(child);
        entries.push({
          name,
          path: child,
          dir: s.isDirectory(),
          sizeBytes: s.isDirectory() ? 0 : s.size,
          modifiedAt: s.mtime.toISOString(),
          editable: this.editable(name, s.size, s.isDirectory()),
        });
      } catch {
        /* o'qib bo'lmadi (uzilgan havola) — ro'yxatga qo'shmaymiz */
      }
    }

    // Kataloglar tepada, keyin alifbo — fayl menejerlarining odatiy tartibi.
    entries.sort((a, b) => Number(b.dir) - Number(a.dir) || a.name.localeCompare(b.name));

    const parent = dirname(path);
    return {
      path,
      // Ildizdan yuqoriga chiqadigan «yuqoriga» tugmasi bo'lmasligi kerak.
      parent: this.inRoots(parent) && parent !== path ? parent : null,
      roots: FILE_ROOTS,
      entries,
    };
  }

  async read(rawPath: string) {
    const path = await this.safePath(rawPath);
    const info = await stat(path);
    if (info.isDirectory()) {
      throw new BadRequestException(`${path} — katalog, fayl emas.`);
    }
    if (info.size > MAX_FILE_BYTES) {
      throw new BadRequestException(
        `Fayl juda katta (${Math.round(info.size / 1024)} KB). ` +
          `Chegara ${MAX_FILE_BYTES / 1024} KB.`,
      );
    }

    const buf = await readFile(path);
    if (this.looksBinary(buf)) {
      throw new BadRequestException('Bu ikkilik fayl — panelda ochilmaydi.');
    }

    const text = buf.toString('utf8');
    return {
      path,
      text,
      sizeBytes: info.size,
      modifiedAt: info.mtime.toISOString(),
      lines: text.length ? text.split('\n').length : 0,
      maxBytes: MAX_FILE_BYTES,
    };
  }

  /**
   * Faylni saqlaydi, avval zaxira nusxa olib.
   *
   * Zaxira nusxa YONIDA saqlanadi (`<fayl>.bak-<vaqt>`): boshqa
   * katalogga qo'yilsa, o'sha katalog ham yozishga ochiq bo'lishi kerak
   * bo'lardi va tiklash uchun uni topish kerak edi. Yonida turgan
   * nusxani `mv` bilan bir buyruqda qaytarish mumkin.
   */
  async write(actor: Actor, rawPath: string, text: string) {
    const path = await this.safePath(rawPath);
    const info = await stat(path);
    if (info.isDirectory()) {
      throw new BadRequestException(`${path} — katalog, fayl emas.`);
    }

    const body = String(text ?? '');
    const size = Buffer.byteLength(body, 'utf8');
    if (size > MAX_FILE_BYTES) {
      throw new BadRequestException(
        `Matn juda katta (${Math.round(size / 1024)} KB). ` +
          `Chegara ${MAX_FILE_BYTES / 1024} KB.`,
      );
    }
    if (body.includes('\0')) {
      throw new BadRequestException('Matnda NUL belgisi bor — saqlanmadi.');
    }

    const started = Date.now();
    // Vaqt tamg'asi fayl nomiga tushadi — `:` ni olib tashlaymiz, aks
    // holda nusxa nomini terminalda qo'shtirnoqsiz yozib bo'lmaydi.
    const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15);
    const backup = `${path}.bak-${stamp}`;

    let ok = false;
    let error = '';
    try {
      // Zaxira MUVAFFAQIYATSIZ bo'lsa yozmaymiz: tiklash imkonisiz
      // tahrir — panel qila oladigan eng yomon ish.
      await copyFile(path, backup);
      await writeFile(path, body, 'utf8');
      ok = true;
    } catch (err: any) {
      error = err?.message || 'noma`lum xato';
    }

    await this.audit.record({
      at: new Date().toISOString(),
      user: actor.user,
      ip: actor.ip,
      action: 'fayl.saqlash',
      target: path,
      detail: `${info.size} -> ${size} bayt · zaxira ${basename(backup)}`,
      ok,
      error: ok ? undefined : error,
      durationMs: Date.now() - started,
    });

    if (!ok) throw new BadRequestException(`Saqlanmadi: ${error}`);
    return { ok, path, backup, sizeBytes: size };
  }
}
