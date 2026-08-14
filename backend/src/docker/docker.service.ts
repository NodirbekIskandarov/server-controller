import { Injectable } from '@nestjs/common';
import { ShellService } from '../common/shell.service';

export interface Container {
  id: string;
  name: string;
  image: string;
  state: string;
  status: string;
  ports: string;
  project: string;
  createdAt: string;
  cpuPercent: number;
  memUsage: string;
  memPercent: number;
  netIo: string;
}

@Injectable()
export class DockerService {
  constructor(private readonly shell: ShellService) {}

  private num(text: string): number {
    return Number(String(text).replace('%', '').trim()) || 0;
  }

  async containers(): Promise<Container[]> {
    const psOut = await this.shell.exec('docker', [
      'ps', '-a', '--format', '{{json .}}',
    ]);
    // `docker stats` faqat ishlayotgan konteynerlar uchun ma'lumot beradi.
    // --no-stream: bir marta o'lchab chiqadi, oqim ochib turmaydi.
    const statsOut = await this.shell.exec(
      'docker', ['stats', '--no-stream', '--format', '{{json .}}'], 25_000,
    );
    const stats = new Map<string, any>();
    for (const s of this.shell.jsonLines(statsOut)) stats.set(s.Name, s);

    return this.shell.jsonLines(psOut).map((c) => {
      const s = stats.get(c.Names) || {};
      return {
        id: (c.ID || '').slice(0, 12),
        name: c.Names,
        image: c.Image,
        state: c.State,
        status: c.Status,
        ports: c.Ports || '',
        project:
          c.Labels?.match?.(/com\.docker\.compose\.project=([^,]+)/)?.[1] || '',
        createdAt: c.CreatedAt,
        cpuPercent: this.num(s.CPUPerc),
        memUsage: s.MemUsage || '',
        memPercent: this.num(s.MemPerc),
        netIo: s.NetIO || '',
      };
    });
  }

  async images() {
    const out = await this.shell.exec('docker', [
      'images', '--format', '{{json .}}',
    ]);
    return this.shell.jsonLines(out).map((i) => ({
      repository: i.Repository,
      tag: i.Tag,
      size: i.Size,
      createdSince: i.CreatedSince,
    }));
  }

  async diskUsage() {
    const out = await this.shell.exec('docker', [
      'system', 'df', '--format', '{{json .}}',
    ]);
    // Docker maydonlarni bosh harf bilan qaytaradi — qolgan API bilan
    // bir xil bo'lishi uchun nomlarni moslashtiramiz.
    return this.shell.jsonLines(out).map((u) => ({
      type: u.Type,
      count: Number(u.TotalCount) || 0,
      active: Number(u.Active) || 0,
      size: u.Size,
      reclaimable: u.Reclaimable,
    }));
  }

  async summary() {
    const list = await this.containers();
    return {
      total: list.length,
      running: list.filter((c) => c.state === 'running').length,
      stopped: list.filter((c) => c.state !== 'running').length,
      cpuTotal:
        Math.round(list.reduce((a, c) => a + c.cpuPercent, 0) * 10) / 10,
      containers: list,
    };
  }
}
