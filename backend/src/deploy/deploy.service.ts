import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { Subject } from 'rxjs';

export interface DeployStep {
  at: string;
  line: string;
  stream: 'out' | 'err' | 'info';
}

export interface DeployRun {
  id: string;
  project: string;
  startedAt: string;
  finishedAt: string | null;
  ok: boolean | null;
  trigger: string;
  commit: string;
  message: string;
  durationMs: number | null;
  lines: DeployStep[];
}

/** Qaysi loyiha qanday joylashtiriladi. */
export interface ProjectTarget {
  name: string;
  path: string;
  repo: string;
  script: string;
}

const HISTORY_FILE = '/opt/server-controller/deploys.json';
const MAX_HISTORY = 60;
const MAX_LINES = 400;

@Injectable()
export class DeployService {
  private readonly log = new Logger(DeployService.name);
  private history: DeployRun[] = [];
  private running = new Map<string, DeployRun>();

  /** Jonli deploy loglari — SSE orqali panelga oqib boradi. */
  readonly events = new Subject<{ run: DeployRun; step?: DeployStep }>();

  readonly targets: ProjectTarget[] = [
    {
      name: 'hisobchi',
      path: '/opt/hisobchi',
      repo: 'NodirbekIskandarov/hisobchim',
      script: '/opt/server-controller/deploy/hisobchi.sh',
    },
    {
      name: 'hisobchim-admin',
      path: '/opt/hisobchim-admin',
      repo: 'NodirbekIskandarov/hisobchim-admin',
      script: '/opt/server-controller/deploy/hisobchim-admin.sh',
    },
    {
      name: 'server-controller',
      path: '/opt/server-controller',
      repo: 'NodirbekIskandarov/server-controller',
      script: '/opt/server-controller/deploy/server-controller.sh',
    },
  ];

  constructor() {
    void this.load();
  }

  private async load() {
    try {
      const text = await readFile(HISTORY_FILE, 'utf8');
      this.history = JSON.parse(text);
    } catch {
      this.history = [];
    }
  }

  private async save() {
    try {
      await mkdir(dirname(HISTORY_FILE), { recursive: true });
      await writeFile(
        HISTORY_FILE,
        JSON.stringify(this.history.slice(0, MAX_HISTORY), null, 1),
        'utf8',
      );
    } catch (err: any) {
      this.log.warn(`Tarixni saqlab bo'lmadi: ${err?.message}`);
    }
  }

  target(name: string): ProjectTarget {
    const found = this.targets.find((t) => t.name === name);
    if (!found) throw new NotFoundException(`«${name}» loyihasi ro'yxatda yo'q`);
    return found;
  }

  isRunning(name: string): boolean {
    return this.running.has(name);
  }

  list(): DeployRun[] {
    return [...this.running.values(), ...this.history].slice(0, MAX_HISTORY);
  }

  get(id: string): DeployRun | null {
    return (
      [...this.running.values()].find((r) => r.id === id) ||
      this.history.find((r) => r.id === id) ||
      null
    );
  }

  /**
   * Joylashtirishni ishga tushiradi.
   *
   * Skript yo'li ro'yxatdan olinadi — tashqaridan kelgan matn hech qachon
   * buyruqqa aylanmaydi. Bir loyiha uchun bir vaqtda bitta joylashtirish.
   */
  async start(name: string, trigger: string): Promise<DeployRun> {
    const target = this.target(name);
    const existing = this.running.get(name);
    if (existing) return existing;

    const run: DeployRun = {
      id: `${name}-${Date.now()}`,
      project: name,
      startedAt: new Date().toISOString(),
      finishedAt: null,
      ok: null,
      trigger,
      commit: '',
      message: '',
      durationMs: null,
      lines: [],
    };
    this.running.set(name, run);
    this.push(run, `Joylashtirish boshlandi (${trigger})`, 'info');

    const started = Date.now();
    const child = spawn('/bin/bash', [target.script], {
      cwd: target.path,
      env: { ...process.env, LANG: 'C', LC_ALL: 'C' },
    });

    const onData = (stream: 'out' | 'err') => (chunk: Buffer) => {
      for (const line of chunk.toString('utf8').split('\n')) {
        if (line.trim()) this.push(run, line.trimEnd(), stream);
      }
    };
    child.stdout.on('data', onData('out'));
    child.stderr.on('data', onData('err'));

    child.on('close', async (code) => {
      run.ok = code === 0;
      run.finishedAt = new Date().toISOString();
      run.durationMs = Date.now() - started;
      // Skript oxirgi qatorlarda commit ma'lumotini beradi.
      const commitLine = run.lines.find((l) => l.line.startsWith('COMMIT:'));
      if (commitLine) {
        const [, hash, ...rest] = commitLine.line.split(/[:|]/);
        run.commit = (hash || '').trim();
        run.message = rest.join('|').trim();
      }
      this.push(
        run,
        run.ok
          ? `Muvaffaqiyatli tugadi (${(run.durationMs / 1000).toFixed(1)} s)`
          : `XATO bilan tugadi (kod ${code})`,
        'info',
      );
      this.running.delete(name);
      this.history.unshift(run);
      this.history = this.history.slice(0, MAX_HISTORY);
      await this.save();
      this.events.next({ run });
      this.log.log(`${name}: ${run.ok ? 'ok' : 'xato'} (${run.durationMs} ms)`);
    });

    child.on('error', (err) => {
      this.push(run, `Ishga tushirib bo'lmadi: ${err.message}`, 'err');
    });

    return run;
  }

  private push(run: DeployRun, line: string, stream: DeployStep['stream']) {
    const step: DeployStep = { at: new Date().toISOString(), line, stream };
    run.lines.push(step);
    if (run.lines.length > MAX_LINES) run.lines.shift();
    this.events.next({ run, step });
  }
}
