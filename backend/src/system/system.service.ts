import { Injectable } from '@nestjs/common';
import { readFile } from 'node:fs/promises';
import * as os from 'node:os';
import { ShellService } from '../common/shell.service';

export interface CpuSnapshot {
  usagePercent: number;
  cores: number;
  model: string;
  load1: number;
  load5: number;
  load15: number;
}

export interface MemorySnapshot {
  totalMb: number;
  usedMb: number;
  freeMb: number;
  cacheMb: number;
  availableMb: number;
  usedPercent: number;
  swapTotalMb: number;
  swapUsedMb: number;
}

export interface DiskMount {
  filesystem: string;
  mount: string;
  sizeGb: number;
  usedGb: number;
  freeGb: number;
  usedPercent: number;
}

@Injectable()
export class SystemService {
  /**
   * CPU foizini ikkita o'lchov orasidagi FARQ bo'yicha hisoblaymiz.
   * /proc/stat yuklanish boshidan beri to'plangan qiymatni beradi —
   * bitta o'lchov "hozir qancha band" degan savolga javob bermaydi.
   */
  private lastCpu: { idle: number; total: number } | null = null;

  constructor(private readonly shell: ShellService) {}

  private async readCpuTimes(): Promise<{ idle: number; total: number }> {
    const stat = await readFile('/proc/stat', 'utf8').catch(() => '');
    const line = stat.split('\n').find((l) => l.startsWith('cpu '));
    if (!line) return { idle: 0, total: 0 };
    const parts = line.split(/\s+/).slice(1).map(Number);
    const idle = (parts[3] || 0) + (parts[4] || 0); // idle + iowait
    const total = parts.reduce((a, b) => a + (b || 0), 0);
    return { idle, total };
  }

  async cpu(): Promise<CpuSnapshot> {
    const now = await this.readCpuTimes();
    let usage = 0;
    if (this.lastCpu && now.total > this.lastCpu.total) {
      const dTotal = now.total - this.lastCpu.total;
      const dIdle = now.idle - this.lastCpu.idle;
      usage = Math.max(0, Math.min(100, ((dTotal - dIdle) / dTotal) * 100));
    }
    this.lastCpu = now;

    const [load1, load5, load15] = os.loadavg();
    const cpus = os.cpus();
    return {
      usagePercent: Math.round(usage * 10) / 10,
      cores: cpus.length,
      model: cpus[0]?.model?.trim() || 'noma`lum',
      load1: Math.round(load1 * 100) / 100,
      load5: Math.round(load5 * 100) / 100,
      load15: Math.round(load15 * 100) / 100,
    };
  }

  async memory(): Promise<MemorySnapshot> {
    const text = await readFile('/proc/meminfo', 'utf8').catch(() => '');
    const kb: Record<string, number> = {};
    for (const line of text.split('\n')) {
      const [key, value] = line.split(':');
      if (key && value) kb[key.trim()] = parseInt(value.trim(), 10) || 0;
    }
    const mb = (v: number) => Math.round((v || 0) / 1024);
    const total = mb(kb.MemTotal);
    const available = mb(kb.MemAvailable);
    const free = mb(kb.MemFree);
    const cache = mb(kb.Cached) + mb(kb.Buffers);
    // «used» — MemTotal minus MemAvailable: kesh bo'shatilishi mumkin,
    // shuning uchun uni band deb hisoblash noto'g'ri bo'lardi.
    const used = Math.max(0, total - available);
    const swapTotal = mb(kb.SwapTotal);
    return {
      totalMb: total,
      usedMb: used,
      freeMb: free,
      cacheMb: cache,
      availableMb: available,
      usedPercent: total ? Math.round((used / total) * 1000) / 10 : 0,
      swapTotalMb: swapTotal,
      swapUsedMb: Math.max(0, swapTotal - mb(kb.SwapFree)),
    };
  }

  async disks(): Promise<DiskMount[]> {
    // -x turlari: docker overlay va vaqtinchalik fayl tizimlari haqiqiy
    // joy egallamaydi, ular ro'yxatni chalkashtiradi.
    const out = await this.shell.exec('df', [
      '-B1', '-x', 'tmpfs', '-x', 'devtmpfs', '-x', 'overlay',
      '-x', 'squashfs', '-x', 'efivarfs',
    ]);
    const gb = (bytes: number) => Math.round((bytes / 1024 ** 3) * 100) / 100;
    return this.shell
      .lines(out)
      .slice(1)
      .map((line) => {
        const p = line.split(/\s+/);
        if (p.length < 6) return null;
        const size = Number(p[1]);
        const used = Number(p[2]);
        const free = Number(p[3]);
        return {
          filesystem: p[0],
          mount: p.slice(5).join(' '),
          sizeGb: gb(size),
          usedGb: gb(used),
          freeGb: gb(free),
          usedPercent: size ? Math.round((used / size) * 1000) / 10 : 0,
        };
      })
      .filter((d): d is DiskMount => d !== null);
  }

  async network() {
    const text = await readFile('/proc/net/dev', 'utf8').catch(() => '');
    let rx = 0;
    let tx = 0;
    for (const line of text.split('\n').slice(2)) {
      const [name, rest] = line.split(':');
      if (!rest || !name) continue;
      if (name.trim() === 'lo') continue;
      const parts = rest.trim().split(/\s+/).map(Number);
      rx += parts[0] || 0;
      tx += parts[8] || 0;
    }
    return { rxBytes: rx, txBytes: tx };
  }

  async host() {
    const release = await readFile('/etc/os-release', 'utf8').catch(() => '');
    const pretty = /PRETTY_NAME="?([^"\n]+)"?/.exec(release)?.[1] || os.type();
    return {
      hostname: os.hostname(),
      os: pretty,
      kernel: os.release(),
      arch: os.arch(),
      uptimeSeconds: Math.round(os.uptime()),
      bootedAt: new Date(Date.now() - os.uptime() * 1000).toISOString(),
      now: new Date().toISOString(),
    };
  }

  /** Bosh sahifadagi asosiy ko'rsatkichlar. */
  async snapshot() {
    const [host, cpu, memory, disks, network] = await Promise.all([
      this.host(),
      this.cpu(),
      this.memory(),
      this.disks(),
      this.network(),
    ]);
    const root = disks.find((d) => d.mount === '/') || disks[0] || null;
    return { host, cpu, memory, disks, network, root };
  }
}
