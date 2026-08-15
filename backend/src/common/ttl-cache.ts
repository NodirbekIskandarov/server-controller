/**
 * Vaqt bo'yicha eskiradigan kesh.
 *
 * Nega natija emas, PROMISE saqlanadi: panelda o'nlab manba bir vaqtda
 * bir xil ma'lumotni so'raydi (SSE tsikli, sahifa so'rovi, poll). Agar
 * faqat tayyor natija keshlansa, birinchi so'rov ketayotgan paytda
 * kelgan qolganlari kesh bo'shligini ko'rib O'ZLARI ham buyruq ishga
 * tushiradi — «kesh bor» deb o'ylagan holda bir nechta `systemctl show`
 * baravar ishlaydi. Promise saqlansa, ular tayyorlanayotgan bittasiga
 * ulanadi.
 */
export class TtlCache<T> {
  private readonly entries = new Map<string, { at: number; value: Promise<T> }>();

  /** Kalitlar tashqaridan kelsa (masalan `minutes`) — cheksiz o'smasin. */
  private readonly MAX_KEYS = 32;

  constructor(private readonly ttlMs: number) {}

  get(key: string, load: () => Promise<T>): Promise<T> {
    const hit = this.entries.get(key);
    if (hit && Date.now() - hit.at < this.ttlMs) return hit.value;

    // Xato natija keshda qolib ketmasligi kerak: vaqtinchalik uzilishdan
    // keyin panel butun TTL davomida «xato» ko'rsatib turardi.
    const value = load().catch((err) => {
      this.entries.delete(key);
      throw err;
    });

    this.entries.set(key, { at: Date.now(), value });
    if (this.entries.size > this.MAX_KEYS) {
      const oldest = [...this.entries.entries()].sort((a, b) => a[1].at - b[1].at);
      for (const [k] of oldest.slice(0, this.entries.size - this.MAX_KEYS)) {
        this.entries.delete(k);
      }
    }
    return value;
  }

  /**
   * Keshni tashlaydi.
   *
   * Yozish amalidan keyin chaqiriladi: foydalanuvchi xizmatni
   * to'xtatgach panelda hamon «active» turishi — buzuq his.
   */
  clear(): void {
    this.entries.clear();
  }
}
