import { Injectable } from '@nestjs/common';
import { UNIT_RE, isProtectedUnit } from '../common/limits';
import { ShellService } from '../common/shell.service';
import { TtlCache } from '../common/ttl-cache';
import { LogsService } from '../logs/logs.service';

export interface Unit {
  name: string;
  description: string;
  load: string;
  active: string;
  sub: string;
  memoryMb: number | null;
  since: string | null;
  restarts: number;
  /** Panel bu unitni to'xtata oladimi — chegaralar limits.ts da. */
  protected: boolean;
}

/** Foydalanuvchining o'z loyihalari — ular tepada ko'rsatiladi. */
const OWN = /^(tanga|server-controller|gym|kino|teacher|portfolio)/;

@Injectable()
export class ServicesService {
  /**
   * Nega kesh kerak edi.
   *
   * `summary()` real vaqt tsiklidan har 2 soniyada chaqirilardi va har
   * chaqiruvda har bir unit uchun ALOHIDA `systemctl show` ishga
   * tushardi: 183 xizmat + 18 taymer = har 2 soniyada ~200 jarayon.
   * Natijada serverda eng ko'p CPU yeydigan jarayon `systemd` ning
   * o'zi bo'lib qolgan edi (~12%) — ya'ni kuzatuv paneli kuzatayotgan
   * narsasini o'zi yuklab turardi.
   *
   * Ikkita tuzatish birga ishlaydi: bu kesh chaqiruvlar SONINI, batafsil
   * `show()` esa bitta chaqiruvning NARXINI kamaytiradi.
   */
  private readonly cache = new TtlCache<any>(45_000);

  constructor(private readonly shell: ShellService) {}

  /** Yozish amalidan keyin panel eski holatni ko'rsatib turmasin. */
  invalidate() {
    this.cache.clear();
  }

  /**
   * Bir necha unitning xossalarini BITTA `systemctl show` bilan o'qiydi.
   *
   * systemd har unit uchun `Kalit=qiymat` bloki beradi, bloklar orasi
   * bo'sh qator. Natija argumentlar tartibida keladi, lekin biz uni
   * TARTIB bo'yicha emas, `Id=` bo'yicha bog'laymiz: mavjud bo'lmagan
   * unit uchun ham blok qaytadi va bitta siljish butun jadvalni
   * boshqa xizmatning ma'lumoti bilan to'ldirib qo'yardi.
   */
  private async show(
    units: string[],
    properties: string[],
  ): Promise<Map<string, Record<string, string>>> {
    const byUnit = new Map<string, Record<string, string>>();
    // Nomlar systemd'ning o'zidan keladi, lekin `-` bilan boshlangan
    // qiymat argument emas, bayroq bo'lib qolishini tekshirib qo'yamiz.
    const names = units.filter((n) => UNIT_RE.test(n));
    if (!names.length) return byUnit;

    const out = await this.shell.exec(
      'systemctl',
      ['show', ...names, `--property=Id,${properties.join(',')}`],
      30_000,
    );

    for (const block of out.split('\n\n')) {
      const props: Record<string, string> = {};
      for (const line of block.split('\n')) {
        const eq = line.indexOf('=');
        if (eq > 0) props[line.slice(0, eq)] = line.slice(eq + 1);
      }
      if (props.Id) byUnit.set(props.Id, props);
    }
    return byUnit;
  }

  async list(): Promise<Unit[]> {
    const out = await this.shell.exec('systemctl', [
      'list-units', '--type=service', '--all', '--no-pager', '--no-legend',
      '--plain',
    ]);

    // Avval ro'yxat filtrlanadi, keyin BITTA `show` — filtrdan o'tmagan
    // xizmat uchun umuman so'ramaymiz.
    const rows: { name: string; load: string; active: string; sub: string; rest: string }[] = [];
    for (const line of this.shell.lines(out)) {
      const parts = line.split(/\s+/);
      const name = parts[0];
      if (!name?.endsWith('.service')) continue;
      // Tizimning o'z ichki xizmatlari ro'yxatni ko'mib tashlaydi.
      if (/^(systemd-|dbus-|user@|getty@|modprobe@|blockdev@)/.test(name)) continue;

      const [load, active, sub] = parts.slice(1, 4);
      if (active === 'inactive' && sub === 'dead' && !OWN.test(name)) continue;
      rows.push({ name, load, active, sub, rest: parts.slice(4).join(' ') });
    }

    const props = await this.show(
      rows.map((r) => r.name),
      ['Description', 'MemoryCurrent', 'ActiveEnterTimestamp', 'NRestarts'],
    );

    const units: Unit[] = [];
    for (const row of rows) {
      const p = props.get(row.name) || {};
      const memory = Number(p.MemoryCurrent);
      units.push({
        name: row.name,
        description: p.Description || row.rest,
        load: row.load,
        active: row.active,
        sub: row.sub,
        memoryMb:
          Number.isFinite(memory) && memory > 0
            ? Math.round(memory / 1024 / 1024)
            : null,
        since: p.ActiveEnterTimestamp || null,
        restarts: Number(p.NRestarts) || 0,
        protected: isProtectedUnit(row.name),
      });
    }

    // O'z loyihalari birinchi, keyin ishlayotganlar, keyin qolgani.
    return units.sort((a, b) => {
      const own = Number(OWN.test(b.name)) - Number(OWN.test(a.name));
      if (own) return own;
      const run =
        Number(b.active === 'active') - Number(a.active === 'active');
      return run || a.name.localeCompare(b.name);
    });
  }

  /** Xizmat loglarining oxirgi qatorlari. */
  async logs(unit: string, lines = 80): Promise<string[]> {
    // Faqat mavjud xizmat nomiga ruxsat: tashqaridan kelgan matn
    // to'g'ridan-to'g'ri journalctl'ga o'tib ketmasligi kerak.
    if (!/^[a-zA-Z0-9@._-]+\.service$/.test(unit)) return ['Noto`g`ri xizmat nomi'];
    const out = await this.shell.exec('journalctl', [
      '-u', unit, '--no-pager', '-n', String(Math.min(lines, 500)),
      '--output=short-iso',
    ]);
    // Jonli oqim bilan bir xil: logga tushib qolgan token yoki kalit
    // brauzerga chiqmasin.
    return this.shell.lines(out).map((l) => LogsService.redact(l));
  }

  /**
   * systemd taymerlari — rejalashtirilgan vazifalar.
   *
   * `list-timers` chiqishi ustunlarga bo'linmaydi: ba'zi maydonlar
   * ichida bo'shliq bor («2min 20s ago», «Fri 2026-08-14 16:20:00
   * CEST») va ular bir-biriga yopishib qoladi. Shuning uchun ro'yxatni
   * `list-units` dan olib, aniq qiymatlarni `systemctl show` bilan
   * so'raymiz — bu yerda maydonlar nomlangan va chalkashish imkoni yo'q.
   */
  async timers() {
    const listing = await this.shell.exec('systemctl', [
      'list-units', '--type=timer', '--all', '--no-pager', '--no-legend',
      '--plain',
    ]);

    const names = this.shell
      .lines(listing)
      .map((l) => l.split(/\s+/)[0])
      .filter((n) => n?.endsWith('.timer'));

    // 18 ta taymer = 18 ta jarayon edi. Endi bitta.
    const props = await this.show(names, [
      'Unit', 'NextElapseUSecRealtime', 'LastTriggerUSec', 'Description',
    ]);

    const rows: {
      unit: string; activates: string; description: string;
      nextAt: string | null; lastAt: string | null;
      next: string; left: string; last: string; passed: string;
    }[] = [];
    for (const unit of names) {
      const p = props.get(unit) || {};
      const next = this.stamp((p.NextElapseUSecRealtime || '').trim());
      const last = this.stamp((p.LastTriggerUSec || '').trim());
      rows.push({
        unit,
        activates: p.Unit || unit.replace(/\.timer$/, '.service'),
        description: p.Description || '',
        nextAt: next?.toISOString() || null,
        lastAt: last?.toISOString() || null,
        next: next ? ServicesService.human(next) : '—',
        left: next ? ServicesService.relative(next) : '—',
        last: last ? ServicesService.human(last) : 'hali ishlamagan',
        passed: last ? ServicesService.relative(last) : '—',
      });
    }

    // Eng yaqin ishga tushadigani tepada.
    return rows.sort((a, b) => (a.nextAt || '9') < (b.nextAt || '9') ? -1 : 1);
  }

  /** systemd sanani «Fri 2026-08-14 16:20:00 CEST» ko'rinishida beradi. */
  private stamp(raw: string): Date | null {
    if (!raw || raw === 'n/a' || raw === '0') return null;
    const parsed = new Date(raw.replace(/\s+[A-Z]{2,5}$/, ''));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  private static human(d: Date): string {
    const p = (n: number) => String(n).padStart(2, '0');
    return `${p(d.getDate())}.${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  /** «4 soat keyin» yoki «12 daqiqa oldin». */
  private static relative(d: Date): string {
    const diff = d.getTime() - Date.now();
    const ahead = diff > 0;
    const mins = Math.round(Math.abs(diff) / 60_000);
    let text: string;
    if (mins < 60) text = `${mins} daqiqa`;
    else if (mins < 1440) text = `${Math.round(mins / 60)} soat`;
    else text = `${Math.round(mins / 1440)} kun`;
    return ahead ? `${text} keyin` : `${text} oldin`;
  }

  /**
   * cron vazifalari: root crontab + /etc/cron.d.
   *
   * Izohlar tashlab yuboriladi, lekin fayl nomi qoladi — qaysi vazifa
   * qayerdan kelgani ko'rinsin.
   */
  async cronJobs() {
    const jobs: { source: string; schedule: string; command: string }[] = [];

    const parse = (source: string, text: string, hasUser: boolean) => {
      for (const line of this.shell.lines(text)) {
        if (line.startsWith('#') || !line.trim()) continue;
        if (/^[A-Z_]+\s*=/.test(line)) continue; // PATH=, SHELL=
        const special = /^(@\w+)\s+(.*)$/.exec(line);
        if (special) {
          // /etc/cron.d da @reboot dan keyin ham foydalanuvchi ustuni
          // turadi — uni buyruq deb ko'rsatmaymiz.
          const rest = special[2].split(/\s+/);
          jobs.push({
            source,
            schedule: special[1],
            command: (hasUser ? rest.slice(1) : rest).join(' '),
          });
          continue;
        }
        const parts = line.split(/\s+/);
        if (parts.length < (hasUser ? 7 : 6)) continue;
        const schedule = parts.slice(0, 5).join(' ');
        const rest = parts.slice(hasUser ? 6 : 5).join(' ');
        jobs.push({ source, schedule, command: rest });
      }
    };

    parse('root crontab', await this.shell.exec('crontab', ['-l']), false);

    const listing = await this.shell.exec('ls', ['-1', '/etc/cron.d']);
    for (const name of this.shell.lines(listing)) {
      if (name.includes('.')) continue; // .dpkg-dist va shunga o'xshashlar
      const text = await this.shell.exec('cat', ['--', `/etc/cron.d/${name}`]);
      parse(name, text, true);
    }
    return jobs;
  }

  /** Keshlangan — sabab yuqoridagi `cache` izohida. */
  async summary() {
    return this.cache.get('summary', () => this.buildSummary());
  }

  private async buildSummary() {
    const [units, timers, cron] = await Promise.all([
      this.list(),
      this.timers().catch(() => []),
      this.cronJobs().catch(() => []),
    ]);
    return {
      total: units.length,
      running: units.filter((u) => u.active === 'active').length,
      failed: units.filter((u) => u.active === 'failed').length,
      units,
      timers,
      cron,
      /** Ma'lumot qachon o'lchangan — panel «bu eski» deb ko'rsata olsin. */
      measuredAt: new Date().toISOString(),
    };
  }
}
