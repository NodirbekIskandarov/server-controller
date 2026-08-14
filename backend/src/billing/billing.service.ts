import { Injectable, Logger } from '@nestjs/common';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { TrafficService } from '../traffic/traffic.service';

/**
 * Server uchun to'lov ma'lumoti.
 *
 * Provayderning API'si yo'q, shuning uchun raqamlar `billing.json`
 * faylidan o'qiladi — uni ega bir marta to'ldiradi. Fayl bo'lmasa
 * ekranda o'ylab topilgan sana emas, aynan nima yozish kerakligi
 * ko'rsatiladi: noto'g'ri to'lov sanasi ko'rsatilgandan ko'ra
 * «sozlanmagan» degani foydaliroq.
 *
 * Faqat O'QIYDI. Fayl qo'lda yoki SSH orqali tahrirlanadi.
 */

export interface BillingItem {
  label: string;
  amount: number;
  detail?: string;
}

export interface BillingPayment {
  date: string;
  amount: number;
  method?: string;
  invoice?: string;
  status?: string;
}

export interface BillingConfig {
  provider?: string;
  plan?: string;
  region?: string;
  currency?: string;
  usdRate?: number;
  billingDay?: number;
  paidUntil?: string;
  balance?: number;
  autopay?: boolean;
  items?: BillingItem[];
  payments?: BillingPayment[];
  renewals?: { label: string; date: string }[];
}

const TEMPLATE: BillingConfig = {
  provider: 'Contabo',
  plan: 'VPS M',
  region: 'Germaniya',
  currency: 'USD',
  usdRate: 12600,
  billingDay: 15,
  paidUntil: '2026-09-15',
  balance: 0,
  autopay: false,
  items: [
    { label: 'Server', amount: 12.99, detail: '4 vCPU · 8 GB · 96 GB NVMe' },
    { label: 'Domen', amount: 1.2, detail: 'niskandarov.uz · yiliga 14.4' },
  ],
  payments: [
    { date: '2026-08-15', amount: 14.19, method: 'karta', invoice: 'INV-0812',
      status: "to'langan" },
  ],
  renewals: [{ label: 'niskandarov.uz domeni', date: '2027-03-02' }],
};

@Injectable()
export class BillingService {
  private readonly log = new Logger(BillingService.name);
  private readonly file =
    process.env.BILLING_FILE || join(process.cwd(), 'billing.json');

  constructor(private readonly traffic: TrafficService) {}

  private async read(): Promise<BillingConfig | null> {
    try {
      const text = await readFile(this.file, 'utf8');
      return JSON.parse(text) as BillingConfig;
    } catch (err: any) {
      if (err?.code !== 'ENOENT') {
        this.log.warn(`billing.json o'qilmadi: ${err?.message}`);
      }
      return null;
    }
  }

  /** Keyingi to'lov sanasi — oyning `billingDay` kuni. */
  private nextDue(day: number, paidUntil?: string): Date {
    if (paidUntil) {
      const parsed = new Date(paidUntil);
      if (!Number.isNaN(parsed.getTime())) return parsed;
    }
    const now = new Date();
    const safeDay = Math.min(Math.max(1, day || 1), 28);
    const due = new Date(now.getFullYear(), now.getMonth(), safeDay);
    if (due.getTime() <= now.getTime()) due.setMonth(due.getMonth() + 1);
    return due;
  }

  async overview() {
    const cfg = await this.read();

    // Sertifikat va domen muddatlari — bular haqiqiy, konfiguratsiyaga
    // bog'liq emas.
    const certs = await this.traffic.certificates().catch(() => []);

    if (!cfg) {
      return {
        configured: false,
        file: this.file,
        template: TEMPLATE,
        note:
          'To\'lov ma\'lumoti sozlanmagan. Provayderda API yo\'q, shuning ' +
          'uchun raqamlar shu fayldan o\'qiladi. Faylni yarating va ' +
          'xizmatni qayta ishga tushiring.',
        certificates: certs,
      };
    }

    const items = cfg.items || [];
    const monthly = items.reduce((a, i) => a + (Number(i.amount) || 0), 0);
    const due = this.nextDue(cfg.billingDay ?? 1, cfg.paidUntil);
    const daysLeft = Math.ceil((due.getTime() - Date.now()) / 86_400_000);
    const payments = [...(cfg.payments || [])].sort((a, b) =>
      a.date < b.date ? 1 : -1);
    const last = payments[0] || null;
    const rate = Number(cfg.usdRate) || 0;

    return {
      configured: true,
      file: this.file,
      provider: cfg.provider || '—',
      plan: cfg.plan || '—',
      region: cfg.region || '—',
      currency: cfg.currency || 'USD',
      usdRate: rate,
      monthly: Math.round(monthly * 100) / 100,
      monthlyLocal: rate ? Math.round(monthly * rate) : null,
      balance: Number(cfg.balance) || 0,
      autopay: Boolean(cfg.autopay),
      dueAt: due.toISOString(),
      daysLeft,
      // Holat aniq: muddat o'tgan / yaqin / joyida.
      status: daysLeft < 0 ? 'kechikkan' : daysLeft <= 5 ? 'yaqin' : 'joyida',
      lastPaidAt: last?.date || null,
      lastPaidAmount: last?.amount ?? null,
      items: items.map((i) => ({
        ...i,
        percent: monthly ? Math.round((100 * (Number(i.amount) || 0)) / monthly) : 0,
      })),
      payments,
      renewals: (cfg.renewals || []).map((r) => ({
        ...r,
        daysLeft: Math.ceil((new Date(r.date).getTime() - Date.now()) / 86_400_000),
      })),
      certificates: certs,
    };
  }
}
