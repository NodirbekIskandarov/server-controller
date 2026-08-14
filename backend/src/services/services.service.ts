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
   * `list-timers` ustunlari bo'sh qiymatlarda siljiydi, shuning uchun
   * qatorni oxiridan o'qiymiz: oxirgi ikkita ustun doim UNIT va
   * ACTIVATES.
   */
  async timers() {
    const out = await this.shell.exec('systemctl', [
      'list-timers', '--all', '--no-pager', '--no-legend',
    ]);
    const rows: {
      unit: string; activates: string; next: string; left: string;
      last: string; passed: string;
    }[] = [];

    for (const line of this.shell.lines(out)) {
      const parts = line.split(/\s{2,}/).map((p) => p.trim()).filter(Boolean);
      if (parts.length < 3) continue;
      const activates = parts[parts.length - 1];
      const unit = parts[parts.length - 2];
      if (!unit?.endsWith('.timer')) continue;
      rows.push({
        unit,
        activates,
        next: parts[0] || '—',
        left: parts[1] || '—',
        last: parts[2] || '—',
        passed: parts[3] || '—',
      });
    }
    return rows;
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
          jobs.push({ source, schedule: special[1], command: special[2] });
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
