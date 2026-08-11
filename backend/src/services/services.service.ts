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
const OWN = /^(hisobchi|hisobchim|server-controller|gym|kino|teacher|portfolio)/;

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

  async summary() {
    const units = await this.list();
    return {
      total: units.length,
      running: units.filter((u) => u.active === 'active').length,
      failed: units.filter((u) => u.active === 'failed').length,
      units,
    };
  }
}
