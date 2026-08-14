import { Injectable } from '@nestjs/common';
import { ShellService } from '../common/shell.service';

export interface Unit {
  name: string;
  description: string;
  load: string;
  active: string;
  sub: string;
  memoryMb: number | null;
  since: string | null;
  restarts: number;
}

/** Foydalanuvchining o'z loyihalari — ular tepada ko'rsatiladi. */
const OWN = /^(tanga|server-controller|gym|kino|teacher|portfolio)/;

@Injectable()
export class ServicesService {
  constructor(private readonly shell: ShellService) {}

  async list(): Promise<Unit[]> {
    const out = await this.shell.exec('systemctl', [
      'list-units', '--type=service', '--all', '--no-pager', '--no-legend',
      '--plain',
    ]);

    const units: Unit[] = [];
    for (const line of this.shell.lines(out)) {
      const parts = line.split(/\s+/);
      const name = parts[0];
      if (!name?.endsWith('.service')) continue;
      // Tizimning o'z ichki xizmatlari ro'yxatni ko'mib tashlaydi.
      if (/^(systemd-|dbus-|user@|getty@|modprobe@|blockdev@)/.test(name)) continue;

      const [load, active, sub] = parts.slice(1, 4);
      if (active === 'inactive' && sub === 'dead' && !OWN.test(name)) continue;

      const props = await this.shell.exec('systemctl', [
        'show', name,
        '--property=Description', '--property=MemoryCurrent',
        '--property=ActiveEnterTimestamp', '--property=NRestarts',
      ]);
      const value = (key: string) =>
        new RegExp(`^${key}=(.*)$`, 'm').exec(props)?.[1] || '';

      const memory = Number(value('MemoryCurrent'));
      units.push({
        name,
        description: value('Description') || parts.slice(4).join(' '),
        load,
        active,
        sub,
        memoryMb:
          Number.isFinite(memory) && memory > 0
            ? Math.round(memory / 1024 / 1024)
            : null,
        since: value('ActiveEnterTimestamp') || null,
        restarts: Number(value('NRestarts')) || 0,
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
    return this.shell.lines(out);
  }

  /**
   * systemd taymerlari — rejalashtirilgan vazifalar.
   *
   * `list-timers` chiqishi ustunlarga bo'linmaydi: ba'zi maydonlar
   * ichida bo'shliq bor («2min 20s ago», «Fri 2026-08-14 16:20:00
   * CEST») va ular bir-biriga yopishib qoladi. Shuning uchun ro'yxatni
   * `list-units` dan olib, har bir taymerning aniq qiymatlarini
   * `systemctl show` bilan so'raymiz — bu yerda maydonlar nomlangan va
   * chalkashish imkoni yo'q.
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

    const rows: {
      unit: string; activates: string; description: string;
      nextAt: string | null; lastAt: string | null;
      next: string; left: string; last: string; passed: string;
    }[] = [];
    for (const unit of names) {
      const props = await this.shell.exec('systemctl', [
        'show', unit,
        '--property=Unit', '--property=NextElapseUSecRealtime',
        '--property=LastTriggerUSec', '--property=Description',
      ]);
      const value = (key: string) =>
        new RegExp(`^${key}=(.*)$`, 'm').exec(props)?.[1]?.trim() || '';

      const next = this.stamp(value('NextElapseUSecRealtime'));
      const last = this.stamp(value('LastTriggerUSec'));
      rows.push({
        unit,
        activates: value('Unit') || unit.replace(/\.timer$/, '.service'),
        description: value('Description'),
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

  async summary() {
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
    };
  }
}
