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
    const perMinute = new Map<string, { count: number; errors: number; ms: number[] }>();
    // Endpoint = usul + yo'l. Javob vaqtlari saqlanadi, chunki p95 ni
    // yugurib borib hisoblab bo'lmaydi.
    const byEndpoint = new Map<string, {
      method: string; path: string; host: string;
      count: number; errors: number; ms: number[];
    }>();
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

      const method: string = entry.request?.method || 'GET';
      const key = `${method} ${uri}`;
      const ep = byEndpoint.get(key) || {
        method, path: uri, host, count: 0, errors: 0, ms: [],
      };
      ep.count++;
      if (status >= 400) ep.errors++;
      ep.ms.push(duration * 1000);
      byEndpoint.set(key, ep);

      if (ip) {
        const e = byIp.get(ip) || { ip, requests: 0, errors: 0 };
        e.requests++;
        if (status >= 400) e.errors++;
        byIp.set(ip, e);
      }

      if (entry.ts) {
        const minute = new Date(entry.ts * 1000).toISOString().slice(0, 16);
        const m = perMinute.get(minute) || { count: 0, errors: 0, ms: [] };
        m.count++;
        if (status >= 500) m.errors++;
        m.ms.push(duration * 1000);
        perMinute.set(minute, m);
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
      endpoints: [...byEndpoint.values()]
        .sort((a, b) => b.count - a.count)
        .slice(0, 20)
        .map((e) => ({
          method: e.method,
          path: e.path,
          host: e.host,
          count: e.count,
          errors: e.errors,
          errorPercent: Math.round((100 * e.errors) / e.count),
          share: Math.round((100 * e.count) / (total || 1)),
          perSec: Math.round((e.count / (minutes * 60)) * 100) / 100,
          p95: TrafficService.percentile(e.ms, 95),
        })),
      p95: TrafficService.percentile(
        [...byEndpoint.values()].flatMap((e) => e.ms), 95),
      timeline: [...perMinute.entries()]
        .sort()
        .map(([minute, m]) => ({
          minute,
          count: m.count,
          errors: m.errors,
          p95: TrafficService.percentile(m.ms, 95),
        })),
      certificates: await this.certificates(),
    };

    this.cache = { at: Date.now(), data };
    return data;
  }

  /** Javob vaqti taqsimoti: o'rtacha emas, p95 — sekin so'rovlarni ko'rsatadi. */
  private static percentile(values: number[], p: number): number {
    if (!values.length) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.min(sorted.length - 1,
      Math.floor((p / 100) * sorted.length));
    return Math.round(sorted[index]);
  }

  /**
   * Caddy sertifikatlari.
   *
   * Caddy har bir domen uchun `<domen>.json` saqlaydi va unda ACME
   * tavsiya qilgan yangilash oynasi bor. Sertifikat muddati emas,
   * YANGILANISH sanasi ko'rsatiladi — amalda muhimi shu: Caddy o'sha
   * kuni yangilaydi, muddat esa undan ~30 kun keyin tugaydi.
   */
  async certificates(): Promise<
    { domain: string; renewAt: string | null; daysLeft: number | null }[]
  > {
    const container = await this.caddyContainer();
    if (!container) return [];
    const out = await this.shell.execBoth('docker', [
      'exec', container, 'sh', '-c',
      'for f in $(find /data/caddy/certificates -name "*.json" 2>/dev/null); ' +
      'do echo "@@$f"; cat "$f"; done',
    ], 20_000);

    const result: { domain: string; renewAt: string | null; daysLeft: number | null }[] = [];
    for (const chunk of out.split('@@').slice(1)) {
      const newline = chunk.indexOf('\n');
      if (newline < 0) continue;
      const file = chunk.slice(0, newline).trim();
      const domain = file.split('/').pop()?.replace(/\.json$/, '') || '';
      let renewAt: string | null = null;
      try {
        const meta = JSON.parse(chunk.slice(newline));
        renewAt = meta?.issuer_data?.renewal_info?.suggestedWindow?.start || null;
      } catch {
        /* buzuq fayl — o'tkazib yuboramiz */
      }
      const daysLeft = renewAt
        ? Math.round((new Date(renewAt).getTime() - Date.now()) / 86_400_000)
        : null;
      if (domain) result.push({ domain, renewAt, daysLeft });
    }
    return result.sort((a, b) => (a.daysLeft ?? 1e9) - (b.daysLeft ?? 1e9));
  }

  private empty(note: string) {
    return {
      available: false, note, windowMinutes: 0, total: 0, perMinuteAvg: 0,
      domains: [], statuses: [], topIps: [], topPaths: [], endpoints: [],
      timeline: [], certificates: [], p95: 0,
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
