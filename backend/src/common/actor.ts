import type { Request } from 'express';

/** Amalni kim so'radi — audit jurnaliga tushadigan yagona manba. */
export interface Actor {
  user: string;
  ip: string;
}

/**
 * So'rovdan haqiqiy foydalanuvchi va manzilni oladi.
 *
 * `X-Forwarded-For` ni qo'lda o'qish mumkin emas: Caddy uni
 * almashtirmaydi, oxiriga qo'shadi — ya'ni birinchi qiymatni hujumchi
 * o'zi yozib yuborishi mumkin. `req.ip` esa `trust proxy` sozlamasini
 * hisobga olib ro'yxatni o'ngdan sanaydi (main.ts: bitta Caddy).
 *
 * Bu yerda bu farq ayniqsa muhim: shu manzil bo'yicha «o'zini
 * bloklama» tekshiruvi ishlaydi. Soxta manzil o'tsa, foydalanuvchi
 * o'zini fail2ban'ga tushirib qo'yishi mumkin edi.
 */
export function actorOf(req: Request & { user?: { sub?: string } }): Actor {
  return {
    user: req.user?.sub || 'noma`lum',
    ip: req.ip || req.socket?.remoteAddress || '',
  };
}
