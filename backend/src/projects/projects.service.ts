import { Injectable, Logger } from '@nestjs/common';
import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { ShellService } from '../common/shell.service';

export interface ProjectNode {
  name: string;
  path: string;
  sizeBytes: number;
  isDir: boolean;
  children?: ProjectNode[];
}

export interface Project {
  name: string;
  path: string;
  sizeBytes: number;
  sizeHuman: string;
  kind: string;
  updatedAt: string | null;
  services: string[];
  containers: string[];
  domains: string[];
  git: { branch: string; commit: string; message: string } | null;
  tree: ProjectNode[];
}

/** Loyihalar shu kataloglar ichida qidiriladi. */
const ROOTS = ['/opt', '/root/projects', '/srv', '/var/www'];

/** Hajm hisoblashda o'tkazib yuboriladigan kataloglar. */
const SKIP = new Set([
  'node_modules', '.git', '.venv', 'venv', '__pycache__', 'dist', 'build',
  '.next', '.cache', 'vendor',
]);

@Injectable()
export class ProjectsService {
  private readonly log = new Logger(ProjectsService.name);

  // Hajm hisoblash (`du`) qimmat amal — natijani keshlaymiz.
  private cache: { at: number; data: Project[] } | null = null;
  private readonly CACHE_MS = 60_000;

  constructor(private readonly shell: ShellService) {}

  static human(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let value = bytes;
    let i = 0;
    while (value >= 1024 && i < units.length - 1) {
      value /= 1024;
      i++;
    }
    return `${value < 10 && i > 0 ? value.toFixed(1) : Math.round(value)} ${units[i]}`;
  }

  private async duBytes(path: string): Promise<number> {
    const out = await this.shell.exec('du', ['-sb', '--', path], 60_000);
    return Number(out.split(/\s+/)[0]) || 0;
  }

  private async detectKind(path: string, entries: string[]): Promise<string> {
    if (entries.includes('docker-compose.yml') || entries.includes('compose.yml'))
      return 'docker-compose';
    if (entries.includes('package.json')) return 'node';
    if (entries.includes('requirements.txt') || entries.includes('pyproject.toml'))
      return 'python';
    if (entries.includes('go.mod')) return 'go';
    if (entries.includes('Cargo.toml')) return 'rust';
    if (entries.includes('index.html')) return 'statik';
    return 'boshqa';
  }

  private async gitInfo(path: string) {
    const out = await this.shell.exec('git', [
      '-C', path, 'log', '-1', '--format=%h|%s',
    ]);
    if (!out.trim()) return null;
    const branch = (
      await this.shell.exec('git', ['-C', path, 'rev-parse', '--abbrev-ref', 'HEAD'])
    ).trim();
    const [commit, ...rest] = out.trim().split('|');
    return { branch: branch || '—', commit, message: rest.join('|').slice(0, 120) };
  }

  /** Birinchi daraja: har bir katalog/fayl va uning hajmi. */
  private async tree(path: string, depth = 1): Promise<ProjectNode[]> {
    let entries: any[] = [];
    try {
      entries = await readdir(path, { withFileTypes: true });
    } catch {
      return [];
    }
    const nodes: ProjectNode[] = [];
    for (const entry of entries) {
      if (entry.name.startsWith('.') && entry.name !== '.env') continue;
      const child = join(path, entry.name);
      let size = 0;
      try {
        size = entry.isDirectory()
          ? await this.duBytes(child)
          : (await stat(child)).size;
      } catch {
        continue;
      }
      const node: ProjectNode = {
        name: entry.name,
        path: child,
        sizeBytes: size,
        isDir: entry.isDirectory(),
      };
      if (entry.isDirectory() && depth > 0 && !SKIP.has(entry.name)) {
        node.children = await this.tree(child, depth - 1);
      }
      nodes.push(node);
    }
    return nodes.sort((a, b) => b.sizeBytes - a.sizeBytes).slice(0, 40);
  }

  /** systemd xizmatlari qaysi katalogda ishlashini aniqlaydi. */
  private async serviceMap(): Promise<Map<string, string[]>> {
    const map = new Map<string, string[]>();
    const out = await this.shell.exec('systemctl', [
      'list-units', '--type=service', '--all', '--no-pager', '--no-legend',
      '--plain',
    ]);
    for (const line of this.shell.lines(out)) {
      const unit = line.split(/\s+/)[0];
      if (!unit?.endsWith('.service')) continue;
      const props = await this.shell.exec('systemctl', [
        'show', unit, '--property=WorkingDirectory', '--value',
      ]);
      const dir = props.trim();
      if (!dir || dir === '/') continue;
      const list = map.get(dir) || [];
      list.push(unit);
      map.set(dir, list);
    }
    return map;
  }

  private async containerMap(): Promise<Map<string, string[]>> {
    const map = new Map<string, string[]>();
    const out = await this.shell.exec('docker', [
      'ps', '-a', '--format', '{{json .}}',
    ]);
    for (const c of this.shell.jsonLines(out)) {
      const dir: string = c.Labels?.match?.(
        /com\.docker\.compose\.project\.working_dir=([^,]+)/,
      )?.[1];
      if (!dir) continue;
      const list = map.get(dir) || [];
      list.push(c.Names);
      map.set(dir, list);
    }
    return map;
  }

  /** Caddyfile'dan domenlarni o'qiydi — qaysi loyiha qaysi manzilda. */
  private async domainMap(): Promise<Map<string, string[]>> {
    const map = new Map<string, string[]>();
    const found = await this.shell.exec('find', [
      '/root', '/opt', '/srv', '-maxdepth', '4', '-name', 'Caddyfile',
    ], 20_000);
    for (const file of this.shell.lines(found)) {
      const text = await this.shell.exec('cat', ['--', file]);
      for (const line of text.split('\n')) {
        const m = /^([a-z0-9.-]+\.[a-z]{2,}(?:,\s*[a-z0-9.-]+)*)\s*\{/i.exec(
          line.trim(),
        );
        if (!m) continue;
        const domains = m[1].split(',').map((d) => d.trim());
        const key = file.replace(/\/Caddyfile$/, '');
        map.set(key, [...(map.get(key) || []), ...domains]);
      }
    }
    return map;
  }

  async list(force = false): Promise<Project[]> {
    if (!force && this.cache && Date.now() - this.cache.at < this.CACHE_MS) {
      return this.cache.data;
    }

    const [services, containers, domains] = await Promise.all([
      this.serviceMap(),
      this.containerMap(),
      this.domainMap(),
    ]);

    const projects: Project[] = [];
    for (const root of ROOTS) {
      let entries: any[] = [];
      try {
        entries = await readdir(root, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const entry of entries) {
        if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
        const path = join(root, entry.name);
        // containerd — docker'ning ichki katalogi, loyiha emas.
        if (path === '/opt/containerd') continue;

        let names: string[] = [];
        try {
          names = await readdir(path);
        } catch {
          continue;
        }

        const [size, info, tree, st] = await Promise.all([
          this.duBytes(path),
          this.gitInfo(path),
          this.tree(path),
          stat(path).catch(() => null),
        ]);

        projects.push({
          name: entry.name,
          path,
          sizeBytes: size,
          sizeHuman: ProjectsService.human(size),
          kind: await this.detectKind(path, names),
          updatedAt: st ? new Date(st.mtimeMs).toISOString() : null,
          services: services.get(path) || [],
          containers: containers.get(path) || [],
          domains: domains.get(path) || [],
          git: info,
          tree,
        });
      }
    }

    projects.sort((a, b) => b.sizeBytes - a.sizeBytes);
    this.cache = { at: Date.now(), data: projects };
    return projects;
  }

  async summary() {
    const projects = await this.list();
    return {
      count: projects.length,
      totalBytes: projects.reduce((a, p) => a + p.sizeBytes, 0),
      byKind: projects.reduce<Record<string, number>>((acc, p) => {
        acc[p.kind] = (acc[p.kind] || 0) + 1;
        return acc;
      }, {}),
    };
  }
}
