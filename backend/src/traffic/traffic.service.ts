import { Injectable } from '@nestjs/common';
import { ShellService } from '../common/shell.service';

export interface DomainStat {
  domain: string;
  requests: number;
  errors: number;
  avgMs: number;
  bytes: number;
}

/**
 * HTTP trafigi Caddy konteynerining loglaridan o'qiladi.
 *
 * Caddy access loglari standart holda o'chiq. Caddyfile'ga `log` bloki
 * qo'shilgach, u JSON qatorlarni stderr'ga yozadi va ular
 * `docker logs` orqali o'qiladi — hech qanday qo'shimcha volume yoki
 * konteynerni qayta yaratish kerak emas.
 */
@Injectable()
export class TrafficService {
  private cache: { at: number; data: any } | null = null;
  private readonly CACHE_MS = 15_000;

  constructor(private readonly shell: ShellService) {}

  private async caddyContainer(): Promise<string | null> {
    const out = await this.shell.exec('docker', [
      'ps', '--filter', 'ancestor=caddy:2-alpine', '--format', '{{.Names}}',
    ]);
    const first = this.shell.lines(out)[0];
    if (first) return first;
    const byName = await this.shell.exec('docker', [
      'ps', '--filter', 'name=caddy', '--format', '{{.Names}}',
    ]);
    return this.shell.lines(byName)[0] || null;
  }

  async stats(minutes = 60) {
    if (this.cache && Date.now() - this.cache.at < this.CACHE_MS) {
      return this.cache.data;
    }

    const container = await this.caddyContainer();
    if (!container) {
      return this.empty('Caddy konteyneri topilmadi');
    }

    // Caddy access loglari stderr'ga chiqadi — ikkala oqimni ham olamiz.
    const raw = await this.shell.execBoth(
      'docker',
      ['logs', '--since', `${minutes}m`, '--tail', '20000', container],
      40_000,
    );

    const byDomain = new Map<string, DomainStat>();
    const byStatus = new Map<number, number>();
    const byIp = new Map<string, { ip: string; requests: number; errors: number }>();
    const byPath = new Map<string, number>();
    const perMinute = new Map<string, number>();
    let total = 0;

    for (const line of raw.split('\n')) {
      if (!line.includes('"msg":"handled request"')) continue;
      let entry: any;
      try {
        entry = JSON.parse(line);
      } catch {
        continue;
      }
      total++;

      const host: string = entry.request?.host || 'noma`lum';
      const status: number = Number(entry.status) || 0;
      const ip: string = entry.request?.client_ip || entry.request?.remote_ip || '';
      const uri: string = (entry.request?.uri || '/').split('?')[0];
      const duration = Number(entry.duration) || 0;
      const size = Number(entry.size) || 0;

      const d = byDomain.get(host) || {
        domain: host, requests: 0, errors: 0, avgMs: 0, bytes: 0,
      };
      d.requests++;
      if (status >= 400) d.errors++;
      d.bytes += size;
      // O'rtachani yugurib borib hisoblaymiz — hamma qiymatni saqlash shart emas.
      d.avgMs = d.avgMs + (duration * 1000 - d.avgMs) / d.requests;
      byDomain.set(host, d);

      byStatus.set(status, (byStatus.get(status) || 0) + 1);
      byPath.set(uri, (byPath.get(uri) || 0) + 1);

      if (ip) {
        const e = byIp.get(ip) || { ip, requests: 0, errors: 0 };
        e.requests++;
        if (status >= 400) e.errors++;
        byIp.set(ip, e);
      }

      if (entry.ts) {
        const minute = new Date(entry.ts * 1000).toISOString().slice(0, 16);
        perMinute.set(minute, (perMinute.get(minute) || 0) + 1);
      }
    }

    const data = {
      available: total > 0,
      note: total
        ? ''
        : 'Caddy access loglari hali yoqilmagan yoki bu davrda so`rov bo`lmagan.',
      windowMinutes: minutes,
      total,
      perMinuteAvg: Math.round((total / minutes) * 10) / 10,
      domains: [...byDomain.values()]
        .map((d) => ({ ...d, avgMs: Math.round(d.avgMs) }))
        .sort((a, b) => b.requests - a.requests),
      statuses: [...byStatus.entries()]
        .map(([status, count]) => ({ status, count }))
        .sort((a, b) => b.count - a.count),
      topIps: [...byIp.values()].sort((a, b) => b.requests - a.requests).slice(0, 20),
      topPaths: [...byPath.entries()]
        .map(([path, count]) => ({ path, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 15),
      timeline: [...perMinute.entries()]
        .sort()
        .map(([minute, count]) => ({ minute, count })),
    };

    this.cache = { at: Date.now(), data };
    return data;
  }

  private empty(note: string) {
    return {
      available: false, note, windowMinutes: 0, total: 0, perMinuteAvg: 0,
      domains: [], statuses: [], topIps: [], topPaths: [], timeline: [],
    };
  }

  /** Ochiq portlar — tashqaridan nima ko'rinayotganini bilish uchun. */
  async ports() {
    const out = await this.shell.exec('ss', ['-tlnp']);
    return this.shell
      .lines(out)
      .slice(1)
      .map((line) => {
        const parts = line.split(/\s+/);
        const local = parts[3] || '';
        const process = /users:\(\("([^"]+)"/.exec(line)?.[1] || '';
        return {
          address: local,
          port: Number(local.split(':').pop()) || 0,
          process,
          public: local.startsWith('0.0.0.0') || local.startsWith('[::]'),
        };
      })
      .filter((p) => p.port > 0)
      .sort((a, b) => a.port - b.port);
  }
}
