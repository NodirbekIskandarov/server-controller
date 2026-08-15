import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { BehaviorSubject } from 'rxjs';
import { SystemService } from '../system/system.service';
import { DockerService } from '../docker/docker.service';
import { SecurityService } from '../security/security.service';
import { ServicesService } from '../services/services.service';

export interface LiveSnapshot {
  at: string;
  system: any;
  docker: { total: number; running: number; stopped: number; cpuTotal: number };
  services: { total: number; running: number; failed: number };
  security: {
    totalFailed: number;
    uniqueSources: number;
    bannedNow: number;
    firewallActive: boolean;
    problems: string[];
  };
  net: { rxPerSec: number; txPerSec: number };
  history: { at: string; cpu: number; mem: number; rx: number; tx: number }[];
}

/**
 * Real vaqtdagi holat.
 *
 * Bitta taymer hamma ulangan mijozlar uchun ishlaydi: o'nta oyna ochilsa
 * ham server sekundiga bir marta o'lchaydi. Yangi mijoz ulanishi bilanoq
 * oxirgi holatni oladi (BehaviorSubject), kutib turmaydi.
 *
 * O'lchovlar IKKI tezlikda yig'iladi. Sabab — hamma narsa bir xil tez
 * o'zgarmaydi, narxi esa keskin farq qiladi:
 *
 *   tez (2s)   cpu, xotira, tarmoq, konteynerlar — grafikda ko'rinadigan
 *              va haqiqatan sekundma-sekund o'zgaradigan qiymatlar.
 *   sekin (30s) xizmatlar ro'yxati va xavfsizlik holati — bular soatlab
 *              o'zgarmaydi, lekin har o'lchovi o'nlab jarayon ochadi.
 *
 * Ilgari hammasi 2 soniyalik tsiklda edi va `services.summary()` har
 * safar ~200 ta `systemctl` jarayonini ishga tushirardi: serverda eng
 * ko'p CPU yeydigan jarayon `systemd` ning o'zi bo'lib qolgandi.
 */
@Injectable()
export class RealtimeService implements OnModuleDestroy {
  private readonly log = new Logger(RealtimeService.name);
  private readonly INTERVAL_MS = 2000;
  private readonly SLOW_MS = 30_000;
  private readonly HISTORY = 90; // ~3 daqiqa

  private timer: NodeJS.Timeout | null = null;
  private slowTimer: NodeJS.Timeout | null = null;
  private lastNet: { rx: number; tx: number; at: number } | null = null;
  private history: LiveSnapshot['history'] = [];
  private ticking = false;
  private slowTicking = false;

  /** Sekin o'lchovning oxirgi natijasi — tez tsikl shuni qayta ishlatadi. */
  private slow: { services: any; security: any } = { services: null, security: null };

  readonly stream = new BehaviorSubject<LiveSnapshot | null>(null);

  constructor(
    private readonly system: SystemService,
    private readonly docker: DockerService,
    private readonly security: SecurityService,
    private readonly services: ServicesService,
  ) {
    this.timer = setInterval(() => void this.tick(), this.INTERVAL_MS);
    this.slowTimer = setInterval(() => void this.slowTick(), this.SLOW_MS);
    void this.slowTick();
    void this.tick();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    if (this.slowTimer) clearInterval(this.slowTimer);
  }

  /**
   * Qimmat o'lchovlar.
   *
   * Xato bo'lsa oldingi qiymat SAQLANADI: bitta muvaffaqiyatsiz o'lchov
   * tufayli panelda «0 xizmat ishlayapti» chiqishi noto'g'ri xabar
   * beradi — bu holat emas, o'lchov muammosi.
   */
  private async slowTick() {
    if (this.slowTicking) return;
    this.slowTicking = true;
    try {
      const [servicesSum, securitySum] = await Promise.all([
        this.services.summary().catch(() => null),
        this.security.overview().catch(() => null),
      ]);
      if (servicesSum) this.slow.services = servicesSum;
      if (securitySum) this.slow.security = securitySum;
    } finally {
      this.slowTicking = false;
    }
  }

  private async tick() {
    // Oldingi o'lchov tugamagan bo'lsa navbat hosil qilmaymiz.
    if (this.ticking) return;
    this.ticking = true;
    try {
      const [system, dockerSum] = await Promise.all([
        this.system.snapshot(),
        this.docker.summary().catch(() => null),
      ]);
      const servicesSum = this.slow.services;
      const securitySum = this.slow.security;

      // Tarmoq tezligi — ikki o'lchov orasidagi farq.
      let rxPerSec = 0;
      let txPerSec = 0;
      const now = Date.now();
      if (this.lastNet) {
        const seconds = (now - this.lastNet.at) / 1000;
        if (seconds > 0) {
          rxPerSec = Math.max(0, (system.network.rxBytes - this.lastNet.rx) / seconds);
          txPerSec = Math.max(0, (system.network.txBytes - this.lastNet.tx) / seconds);
        }
      }
      this.lastNet = {
        rx: system.network.rxBytes, tx: system.network.txBytes, at: now,
      };

      const at = new Date().toISOString();
      this.history.push({
        at,
        cpu: system.cpu.usagePercent,
        mem: system.memory.usedPercent,
        rx: Math.round(rxPerSec),
        tx: Math.round(txPerSec),
      });
      if (this.history.length > this.HISTORY) this.history.shift();

      this.stream.next({
        at,
        system,
        docker: dockerSum
          ? {
              total: dockerSum.total,
              running: dockerSum.running,
              stopped: dockerSum.stopped,
              cpuTotal: dockerSum.cpuTotal,
            }
          : { total: 0, running: 0, stopped: 0, cpuTotal: 0 },
        services: servicesSum
          ? {
              total: servicesSum.total,
              running: servicesSum.running,
              failed: servicesSum.failed,
            }
          : { total: 0, running: 0, failed: 0 },
        security: securitySum
          ? {
              totalFailed: securitySum.attacks.totalFailed,
              uniqueSources: securitySum.attacks.uniqueSources,
              bannedNow: securitySum.fail2ban.currentlyBanned,
              firewallActive: securitySum.firewall.active,
              problems: securitySum.problems,
            }
          : {
              totalFailed: 0, uniqueSources: 0, bannedNow: 0,
              firewallActive: false, problems: [],
            },
        net: { rxPerSec: Math.round(rxPerSec), txPerSec: Math.round(txPerSec) },
        history: [...this.history],
      });
    } catch (err: any) {
      this.log.warn(`O'lchov xatosi: ${err?.message}`);
    } finally {
      this.ticking = false;
    }
  }
}
