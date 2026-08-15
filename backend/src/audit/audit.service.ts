import { Injectable, Logger } from '@nestjs/common';
import { appendFile, mkdir, readFile, rename, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';

export interface AuditEntry {
  at: string;
  user: string;
  ip: string;
  /** `xizmat.restart`, `docker.stop`, `ufw.allow` … */
  action: string;
  /** Amal nimaga tegdi: unit nomi, konteyner, IP, fayl yo'li. */
  target: string;
  detail?: string;
  ok: boolean;
  error?: string;
  durationMs?: number;
}

/**
 * Yozish amallarining jurnali.
 *
 * Nega alohida fayl, journald emas: jurnal panelning o'zida ko'rinishi
 * kerak, journald esa matn oqimi — undan «kim nima qildi» ni ajratib
 * olish uchun qayta parse qilishga to'g'ri kelardi. JSONL esa qatorma-qator
 * o'qiladi va oxiridan teskari o'qish arzon.
 *
 * Fayl faqat QO'SHIB yoziladi (`appendFile`). Panelda uni o'chirish yoki
 * tahrirlash amali yo'q — audit jurnalini o'chira oladigan panel audit
 * jurnaliga ega emas.
 */
@Injectable()
export class AuditService {
  private readonly log = new Logger(AuditService.name);
  private readonly file =
    process.env.AUDIT_FILE || '/opt/server-controller/audit.jsonl';
  private readonly MAX_BYTES = 8 * 1024 * 1024;

  /** Yozuv navbati — bir vaqtda ikki yozuv aralashib ketmasin. */
  private queue: Promise<void> = Promise.resolve();

  async record(entry: AuditEntry): Promise<void> {
    this.queue = this.queue.then(() => this.write(entry)).catch(() => {});
    return this.queue;
  }

  private async write(entry: AuditEntry) {
    try {
      await mkdir(dirname(this.file), { recursive: true });
      await this.rotate();
      await appendFile(this.file, JSON.stringify(entry) + '\n', 'utf8');
    } catch (err: any) {
      // Jurnal yozilmasa ham amal bajarilgan — buni yo'qotib bo'lmaydi,
      // shuning uchun hech bo'lmasa journald ga tushirib qo'yamiz.
      this.log.error(
        `Audit yozilmadi (${entry.action} ${entry.target}): ${err?.message}`,
      );
    }
  }

  /** Fayl kattalashsa `.1` ga o'tkazamiz — cheksiz o'smasin. */
  private async rotate() {
    try {
      const info = await stat(this.file);
      if (info.size < this.MAX_BYTES) return;
      await rename(this.file, `${this.file}.1`);
    } catch {
      /* fayl hali yo'q — rotatsiya kerak emas */
    }
  }

  /**
   * Oxirgi yozuvlar, yangisi birinchi.
   *
   * Fayl to'liq o'qiladi va oxirgi `limit` tasi olinadi: 8 MB chegara
   * bilan bu eng yomon holatda ham bir necha o'n ming qator, ya'ni
   * murakkab teskari o'qish mexanizmi ortiqcha bo'lardi.
   */
  async list(limit = 200, action?: string): Promise<AuditEntry[]> {
    let text = '';
    try {
      text = await readFile(this.file, 'utf8');
    } catch {
      return [];
    }
    const rows: AuditEntry[] = [];
    for (const line of text.split('\n')) {
      if (!line.trim()) continue;
      try {
        rows.push(JSON.parse(line));
      } catch {
        /* buzuq qator — o'tkazib yuboramiz */
      }
    }
    const filtered = action
      ? rows.filter((r) => r.action.startsWith(action))
      : rows;
    return filtered.slice(-limit).reverse();
  }

  /** Bosh sahifa uchun qisqa hisob. */
  async summary() {
    const rows = await this.list(500);
    const today = new Date().toISOString().slice(0, 10);
    return {
      total: rows.length,
      today: rows.filter((r) => r.at.startsWith(today)).length,
      failed: rows.filter((r) => !r.ok).length,
      last: rows[0] || null,
    };
  }
}
