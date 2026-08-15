/**
 * Himoya chegaralari — panel nima qila OLMASLIGI shu yerda.
 *
 * Nega alohida modul, har xizmatning ichida emas: bu ro'yxatlar bir
 * necha joyda kerak (boshqaruv xizmati, xavfsizlik ko'rinishi, frontend
 * uchun API). Ikki nusxada saqlansa biri yangilanib ikkinchisi eskirib
 * qoladi — va aynan shunday tafovut serverni o'chirib qo'yishi mumkin.
 * Bitta manba bo'lsa, chegara qo'shish bitta qatorlik ish.
 */

/**
 * Panelning o'z uniti.
 *
 * Uni to'xtatish — bir tomonlama yo'l: panel o'chgach uni qayta yoqadigan
 * boshqaruv qolmaydi, faqat SSH orqali kirib ko'tarish mumkin.
 */
export const SELF_UNIT = 'server-controller.service';

/**
 * To'xtatish taqiqlangan unitlar va nega.
 *
 * Restart ruxsat etilgan: xizmat bir necha soniyaga uziladi, lekin
 * o'zi qaytadi. Stop esa uni o'chirib qoldiradi.
 */
const UNIT_REASONS: Record<string, string> = {
  ssh: 'SSH — to`xtasa serverga masofadan umuman kira olmaysiz',
  sshd: 'SSH — to`xtasa serverga masofadan umuman kira olmaysiz',
  fail2ban: 'fail2ban — to`xtasa hujum manzillari bloklanmay qoladi',
  docker: 'Docker — u bilan birga BARCHA konteynerlar to`xtaydi',
  containerd: 'containerd — Docker aynan uning ustida ishlaydi',
  dbus: 'dbus — systemd bilan aloqa uziladi, systemctl ham ishlamay qoladi',
  cron: 'cron — rejalashtirilgan vazifalar bajarilmay qoladi',
  'server-controller': 'Panelning o`zi — o`chsa uni panel orqali yoqib bo`lmaydi',
};

/** systemd o'z oilasi: journald, resolved, networkd, logind… */
const SYSTEMD_FAMILY = 'systemd-';

/** Unit nomidan qo'shimchani olib tashlaydi: `docker.socket` -> `docker`. */
function unitBase(unit: string): string {
  return unit.replace(/\.(service|socket|timer|path|target|mount)$/, '');
}

export function isProtectedUnit(unit: string): boolean {
  const base = unitBase(unit);
  return base.startsWith(SYSTEMD_FAMILY) || base in UNIT_REASONS;
}

/** Nima uchun himoyalangani — foydalanuvchiga ko'rsatiladigan matn. */
export function unitReason(unit: string): string {
  const base = unitBase(unit);
  if (base.startsWith(SYSTEMD_FAMILY)) {
    return 'systemd tizim uniti — to`xtasa operatsion tizim qismlari ishdan chiqadi';
  }
  return UNIT_REASONS[base] || '';
}

/** Panelga ko'rsatish uchun — qaysi nomlar himoyalangani. */
export const PROTECTED_UNITS = [...Object.keys(UNIT_REASONS), 'systemd-*'];

/**
 * Unit nomi shabloni.
 *
 * Birinchi belgi harf yoki raqam bo'lishi SHART. `-` bilan boshlangan
 * matn systemctl uchun nom emas, BAYROQ bo'ladi: `systemctl stop
 * --no-block` kabi narsa argument o'rniga tushib, buyruq ma'nosini
 * o'zgartirib yuborardi.
 */
export const UNIT_RE = /^[a-zA-Z0-9][a-zA-Z0-9@._-]{0,62}\.(service|timer|socket|path)$/;

/**
 * Konteyner nomi shabloni — Docker o'zi ruxsat etadigan belgilar.
 * Bu yerda ham birinchi belgi bayroq bo'lib qolmasligi kerak.
 */
export const CONTAINER_RE = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/;

/**
 * To'xtatish taqiqlangan konteyner.
 *
 * Caddy — teskari proksi: hamma domen, hamma sayt va panelning O'ZI ham
 * u orqali ochiladi. To'xtasa server tirik, lekin tashqaridan hech narsa
 * ko'rinmaydi va panelga kirib uni qaytarib bo'lmaydi.
 */
export function isProtectedContainer(name: string): boolean {
  return /caddy/i.test(name);
}

export function containerReason(name: string): string {
  return isProtectedContainer(name)
    ? 'Teskari proksi — to`xtasa hamma sayt va panelning o`zi ham ochilmay qoladi'
    : '';
}

/** Serverda sozlangan fail2ban jail'lari. Boshqa nom qabul qilinmaydi. */
export const JAILS = ['sshd', 'panel-sc', 'panel-admin'] as const;
export type Jail = (typeof JAILS)[number];

export function isJail(name: string): name is Jail {
  return (JAILS as readonly string[]).includes(name);
}

/**
 * O'chirish taqiqlangan ruxsat qoidalari.
 *
 * 22 — SSH, 80/443 — Caddy. Bularning birortasi yopilsa serverga
 * kirishning yoki panelni ochishning yo'li qolmaydi.
 */
export const PROTECTED_PORTS = [22, 80, 443];

/** Fayl tahriri faqat shu kataloglar ichida. */
export const FILE_ROOTS = ['/opt', '/root/projects', '/etc/caddy'];

/** 1 MB — sozlama fayli uchun yetarli, log fayli esa panelga sig'maydi. */
export const MAX_FILE_BYTES = 1024 * 1024;

/**
 * Manzilni bitta shaklga keltiradi.
 *
 * Express `req.ip` ni IPv4-mapped IPv6 ko'rinishida (`::ffff:1.2.3.4`)
 * qaytarishi mumkin. Foydalanuvchi esa `1.2.3.4` deb yozadi — ikkalasi
 * bir xil manzil, lekin satr sifatida teng emas. «O'zini bloklama»
 * tekshiruvi aynan shu farq tufayli chetlab o'tilishi mumkin edi.
 */
export function normalizeIp(raw: string): string {
  return String(raw || '').trim().toLowerCase().replace(/^::ffff:/, '');
}

/**
 * Xususiy va xizmat diapazonlari.
 *
 * Bularni bloklash ma'nosiz va xavfli: 127.x o'zining loopback'i,
 * 172.17-31.x Docker ko'priklari (bloklansa konteynerlar bir-birini
 * ko'rmay qoladi), 10.x/192.168.x esa ichki tarmoq.
 */
export function isPrivateIp(raw: string): boolean {
  const ip = normalizeIp(raw);

  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  if (v4) {
    const a = Number(v4[1]);
    const b = Number(v4[2]);
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true; // link-local
    if (a >= 224) return true; // multicast va zaxira
    return false;
  }

  // IPv6: loopback, unique-local (fc00::/7) va link-local (fe80::/10).
  return ip === '::1' || ip === '::' || /^f[cd]/.test(ip) || /^fe[89ab]/.test(ip);
}
