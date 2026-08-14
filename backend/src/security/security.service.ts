import { Injectable } from '@nestjs/common';
import { ShellService } from '../common/shell.service';

export interface AttackSource {
  ip: string;
  attempts: number;
  users: string[];
  firstSeen: string | null;
  lastSeen: string | null;
  banned: boolean;
}

export interface AttackKind {
  kind: string;
  label: string;
  count: number;
  description: string;
}

/**
 * Hujumlarni auth.log va fail2ban ma'lumotidan yig'adi.
 *
 * Bu yerdagi hamma narsa faqat O'QISH. Bloklash yoki blokdan chiqarish
 * yo'q — panel buzib kirilsa u orqali serverga ta'sir o'tkazib
 * bo'lmasligi kerak.
 */
@Injectable()
export class SecurityService {
  private cache: { at: number; data: any } | null = null;
  private readonly CACHE_MS = 20_000;

  constructor(private readonly shell: ShellService) {}

  private async authLog(lines = 4000): Promise<string[]> {
    // journald va rsyslog — ikkalasi ham bo'lishi mumkin.
    let text = await this.shell.exec('tail', ['-n', String(lines), '/var/log/auth.log']);
    if (!text.trim()) {
      text = await this.shell.exec('journalctl', [
        '-u', 'ssh', '-u', 'sshd', '--no-pager', '-n', String(lines),
      ]);
    }
    return this.shell.lines(text);
  }

  private parseTime(line: string): string | null {
    // Ikki format: ISO (2026-08-11T07:25:52+02:00) va klassik (Aug 11 07:25:52)
    const iso = /^(\d{4}-\d{2}-\d{2}T[\d:]+(?:[.+\-]\S*)?)/.exec(line);
    if (iso) return iso[1];
    const classic = /^([A-Z][a-z]{2}\s+\d+\s+[\d:]+)/.exec(line);
    return classic ? classic[1] : null;
  }

  async bannedIps(): Promise<string[]> {
    const out = await this.shell.exec('fail2ban-client', ['status', 'sshd']);
    const m = /Banned IP list:\s*(.*)/.exec(out);
    return m ? m[1].trim().split(/\s+/).filter(Boolean) : [];
  }

  async fail2banStatus() {
    const out = await this.shell.exec('fail2ban-client', ['status', 'sshd']);
    const num = (label: string) =>
      Number(new RegExp(`${label}:\\s*(\\d+)`).exec(out)?.[1] || 0);
    const active = (await this.shell.exec('systemctl', ['is-active', 'fail2ban']))
      .trim();
    return {
      running: active === 'active',
      currentlyFailed: num('Currently failed'),
      totalFailed: num('Total failed'),
      currentlyBanned: num('Currently banned'),
      totalBanned: num('Total banned'),
      bannedIps: await this.bannedIps(),
    };
  }

  async firewall() {
    const out = await this.shell.exec('ufw', ['status', 'verbose']);
    const rules = this.shell
      .lines(out)
      .filter((l) => /\b(ALLOW|DENY|REJECT)\b/.test(l))
      .map((l) => l.replace(/\s+/g, ' '));
    return {
      active: /Status:\s*active/i.test(out),
      defaults: /Default:\s*(.+)/.exec(out)?.[1]?.trim() || '',
      rules,
    };
  }

  async sshConfig() {
    const out = await this.shell.exec('sshd', ['-T']);
    const value = (key: string) =>
      new RegExp(`^${key}\\s+(.+)$`, 'm').exec(out)?.[1]?.trim() || '';
    return {
      passwordAuth: value('passwordauthentication') === 'yes',
      rootLogin: value('permitrootlogin'),
      pubkeyAuth: value('pubkeyauthentication') === 'yes',
      maxAuthTries: Number(value('maxauthtries') || 0),
      port: value('port'),
    };
  }

  /** Hujum turlarini ajratadi — foydalanuvchi nima bo'layotganini tushunsin. */
  private classify(lines: string[]): AttackKind[] {
    const count = (re: RegExp) => lines.filter((l) => re.test(l)).length;
    const kinds: AttackKind[] = [
      {
        kind: 'parol-tanlash',
        label: 'Parol tanlash (brute force)',
        count: count(/Failed password/),
        description:
          'Hujumchi parolni birma-bir sinab ko`rmoqda. Parol bilan kirish ' +
          'o`chirilgani uchun bu urinishlar natijasiz.',
      },
      {
        kind: 'yoq-hisob',
        label: 'Mavjud bo`lmagan hisob',
        count: count(/Invalid user/),
        description:
          'Tasodifiy login nomlari sinab ko`rilmoqda (admin, test, ubuntu…). ' +
          'Bunday hisoblar serverda yo`q.',
      },
      {
        kind: 'kalit-rad',
        label: 'Kalit rad etildi',
        count: count(/Connection closed by authenticating user|Failed publickey/),
        description: 'Noto`g`ri SSH kalit bilan urinish.',
      },
      {
        kind: 'uzilgan',
        label: 'Skanerlash (ulanib darhol uzish)',
        count: count(/Connection (closed|reset) by .* \[preauth\]/),
        description:
          'Avtomatik skanerlar portni tekshirib, darhol uzilmoqda. ' +
          'Odatiy internet shovqini.',
      },
      {
        kind: 'muvaffaqiyatli',
        label: 'Muvaffaqiyatli kirish',
        count: count(/Accepted (password|publickey)/),
        description: 'Haqiqiy kirishlar — sizniki bo`lishi kerak.',
      },
    ];
    return kinds.filter((k) => k.count > 0);
  }

  async attacks() {
    if (this.cache && Date.now() - this.cache.at < this.CACHE_MS) {
      return this.cache.data;
    }

    const lines = await this.authLog();
    const banned = new Set(await this.bannedIps());

    const bySource = new Map<string, AttackSource>();
    const failed = lines.filter((l) =>
      /Failed password|Invalid user|Failed publickey/.test(l),
    );

    for (const line of failed) {
      const ip = /from\s+(\d+\.\d+\.\d+\.\d+)/.exec(line)?.[1];
      if (!ip) continue;
      const user =
        /for (?:invalid user )?(\S+) from/.exec(line)?.[1] ||
        /Invalid user (\S+)/.exec(line)?.[1];
      const time = this.parseTime(line);

      const entry = bySource.get(ip) || {
        ip,
        attempts: 0,
        users: [],
        firstSeen: time,
        lastSeen: time,
        banned: banned.has(ip),
      };
      entry.attempts++;
      if (user && !entry.users.includes(user) && entry.users.length < 8) {
        entry.users.push(user);
      }
      if (time) entry.lastSeen = time;
      bySource.set(ip, entry);
    }

    const sources = [...bySource.values()].sort((a, b) => b.attempts - a.attempts);

    // Eng ko'p urinilgan login nomlari
    const userCounts = new Map<string, number>();
    for (const line of failed) {
      const user =
        /for (?:invalid user )?(\S+) from/.exec(line)?.[1] ||
        /Invalid user (\S+)/.exec(line)?.[1];
      if (user) userCounts.set(user, (userCounts.get(user) || 0) + 1);
    }

    const successes = lines
      .filter((l) => /Accepted (password|publickey)/.test(l))
      .slice(-10)
      .map((l) => ({
        time: this.parseTime(l),
        ip: /from\s+(\d+\.\d+\.\d+\.\d+)/.exec(l)?.[1] || '',
        method: /Accepted (\w+)/.exec(l)?.[1] || '',
        user: /for (\S+) from/.exec(l)?.[1] || '',
      }))
      .reverse();

    // Vaqt bo'yicha oqim: hujum to'lqin-to'lqin keladi, grafikda buni
    // ko'rish raqamdan ko'ra ko'proq narsa aytadi.
    const perHour = new Map<string, number>();
    for (const line of failed) {
      const time = this.parseTime(line);
      if (!time) continue;
      const parsed = new Date(
        /^\d{4}-/.test(time) ? time : `${new Date().getFullYear()} ${time}`,
      );
      if (Number.isNaN(parsed.getTime())) continue;
      const bucket = parsed.toISOString().slice(0, 13);
      perHour.set(bucket, (perHour.get(bucket) || 0) + 1);
    }
    const timeline = [...perHour.entries()]
      .sort()
      .map(([hour, count]) => ({ hour, count }));

    // Oxirgi soatdagi tezlik — «daqiqasiga necha urinish».
    const lastHour = timeline.length ? timeline[timeline.length - 1].count : 0;

    const data = {
      totalFailed: failed.length,
      uniqueSources: sources.length,
      topSources: sources.slice(0, 25),
      timeline,
      perMinute: Math.round((lastHour / 60) * 10) / 10,
      kinds: this.classify(lines),
      topUsernames: [...userCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([user, count]) => ({ user, count })),
      recentSuccess: successes,
      windowLines: lines.length,
    };

    this.cache = { at: Date.now(), data };
    return data;
  }

  async overview() {
    const [attacks, f2b, fw, ssh] = await Promise.all([
      this.attacks(),
      this.fail2banStatus(),
      this.firewall(),
      this.sshConfig(),
    ]);

    // Oddiy baho — foydalanuvchi holatni bir qarashda tushunsin.
    const problems: string[] = [];
    if (ssh.passwordAuth) problems.push('SSH parol bilan kirish ochiq');
    if (ssh.rootLogin === 'yes') problems.push('root parol bilan kira oladi');
    if (!fw.active) problems.push('Firewall o`chiq');
    if (!f2b.running) problems.push('fail2ban ishlamayapti');

    return {
      attacks,
      fail2ban: f2b,
      firewall: fw,
      ssh,
      problems,
      healthy: problems.length === 0,
    };
  }
}
