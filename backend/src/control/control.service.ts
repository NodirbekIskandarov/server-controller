import { BadRequestException, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { isIP } from 'node:net';
import { AuditService } from '../audit/audit.service';
import type { Actor } from '../common/actor';
import { ShellService } from '../common/shell.service';
import { SecurityService } from '../security/security.service';
import { ServicesService } from '../services/services.service';
import {
  CONTAINER_RE, FILE_ROOTS, JAILS, PROTECTED_PORTS, PROTECTED_UNITS,
  SELF_UNIT, UNIT_RE, containerReason, isJail, isPrivateIp,
  isProtectedContainer, isProtectedUnit, normalizeIp, unitReason,
} from '../common/limits';

export type UnitAction = 'start' | 'stop' | 'restart' | 'reload';
export type ContainerAction = 'start' | 'stop' | 'restart';

export interface ActionResult {
  ok: boolean;
  action: string;
  target: string;
  /** Buyruq chiqishi — panelda ko'rsatiladi, «bo'ldi» degan quruq so'z emas. */
  output: string;
  error: string;
  durationMs: number;
}

export interface UfwRule {
  number: number;
  to: string;
  action: string;
  from: string;
  raw: string;
  /** Shu qoidani o'chirish taqiqlanganmi. */
  locked: boolean;
}

/**
 * Serverni O'ZGARTIRADIGAN amallar.
 *
 * Panelning qolgan qismi faqat o'qiydi, bu yerda esa har bir chaqiruv
 * haqiqiy oqibatga ega. Shuning uchun uch qoida qat'iy:
 *
 *   1. Hamma buyruq `ShellService.run()` orqali — execFile, shell yo'q.
 *      Argument ichidagi `;` yoki `$(...)` hech qachon bajarilmaydi.
 *   2. Har bir nom (unit, konteyner, IP, jail) OQ RO'YXAT yoki qat'iy
 *      shablondan o'tadi. «Xavfli belgilarni tozalash» emas — nimaga
 *      ruxsat borligini sanab chiqish.
 *   3. Har bir amal, shu jumladan RAD ETILGANI ham, auditga yoziladi.
 *      Rad etilgan urinish — audit jurnali eng kerak bo'ladigan yozuv.
 */
@Injectable()
export class ControlService {
  private readonly log = new Logger(ControlService.name);

  constructor(
    private readonly shell: ShellService,
    private readonly audit: AuditService,
    private readonly services: ServicesService,
    private readonly security: SecurityService,
  ) {}

  // ------------------------------------------------------------------ //
  // Umumiy yordamchilar
  // ------------------------------------------------------------------ //

  /**
   * Amalni bajaradi, vaqtini o'lchaydi va auditga yozadi.
   *
   * Audit yozuvi natijadan OLDIN emas, keyin yoziladi — «boshlandi»
   * degan yozuv «nima bo'ldi» degan savolga javob bermaydi.
   */
  private async perform(
    actor: Actor,
    action: string,
    target: string,
    detail: string,
    cmd: string,
    args: string[],
    timeoutMs = 30_000,
  ): Promise<ActionResult> {
    const started = Date.now();
    const res = await this.shell.run(cmd, args, timeoutMs);
    const durationMs = Date.now() - started;

    await this.audit.record({
      at: new Date().toISOString(),
      user: actor.user,
      ip: actor.ip,
      action,
      target,
      detail,
      ok: res.ok,
      error: res.ok ? undefined : res.stderr.slice(0, 500),
      durationMs,
    });

    if (!res.ok) {
      this.log.warn(`${action} ${target} muvaffaqiyatsiz: ${res.stderr.trim()}`);
    }

    return {
      ok: res.ok,
      action,
      target,
      output: (res.stdout || '').trim().slice(0, 4000),
      error: res.ok ? '' : (res.stderr || '').trim().slice(0, 2000),
      durationMs,
    };
  }

  /** Chegaraga urilgan urinish: auditga yozamiz va to'xtatamiz. */
  private async refuse(
    actor: Actor,
    action: string,
    target: string,
    reason: string,
  ): Promise<never> {
    await this.audit.record({
      at: new Date().toISOString(),
      user: actor.user,
      ip: actor.ip,
      action,
      target,
      detail: 'rad etildi',
      ok: false,
      error: reason,
    });
    throw new ForbiddenException(reason);
  }

  // ------------------------------------------------------------------ //
  // systemd
  // ------------------------------------------------------------------ //

  /** `tanga` ham, `tanga.service` ham qabul qilinadi. */
  private normalizeUnit(raw: string): string {
    const name = String(raw || '').trim();
    const unit = /\.(service|timer|socket|path)$/.test(name)
      ? name
      : `${name}.service`;
    if (!UNIT_RE.test(unit)) {
      throw new BadRequestException(`Noto'g'ri unit nomi: ${name}`);
    }
    return unit;
  }

  async unit(
    actor: Actor,
    rawName: string,
    action: UnitAction,
  ): Promise<ActionResult> {
    const unit = this.normalizeUnit(rawName);
    const kind = `xizmat.${action}`;

    if (action === 'stop' && isProtectedUnit(unit)) {
      await this.refuse(
        actor, kind, unit,
        `${unit} himoyalangan: to'xtatib bo'lmaydi, faqat restart. ${unitReason(unit)}`,
      );
    }

    // Panelning o'zi: `systemctl restart` jarayonni o'ldiradi va javob
    // brauzerga yetib bormaydi — foydalanuvchi «bajarilmadi» deb
    // o'ylaydi. `--no-block` systemd'ga topshiriqni berib darhol
    // qaytadi, javob esa hali tirik jarayondan ketadi.
    const self = unit === SELF_UNIT;
    const args = self
      ? [action, '--no-block', unit]
      : [action, unit];

    const result = await this.perform(
      actor, kind, unit,
      self ? 'panelning o`z uniti (--no-block)' : '',
      'systemctl', args,
      action === 'stop' ? 60_000 : 40_000,
    );

    // Panel keshdan eski holatni ko'rsatib turmasin.
    this.services.invalidate();
    return result;
  }

  // ------------------------------------------------------------------ //
  // Docker
  // ------------------------------------------------------------------ //

  private normalizeContainer(raw: string): string {
    const name = String(raw || '').trim();
    if (!CONTAINER_RE.test(name)) {
      throw new BadRequestException(`Noto'g'ri konteyner nomi: ${name}`);
    }
    return name;
  }

  async container(
    actor: Actor,
    rawName: string,
    action: ContainerAction,
  ): Promise<ActionResult> {
    const name = this.normalizeContainer(rawName);
    const kind = `docker.${action}`;

    if (action === 'stop' && isProtectedContainer(name)) {
      await this.refuse(
        actor, kind, name,
        `${name} himoyalangan: to'xtatib bo'lmaydi, faqat restart. ${containerReason(name)}`,
      );
    }

    // `docker stop` SIGTERM'dan keyin 10 soniya kutadi, restart esa ikki
    // barobar — timeout shundan kelib chiqib olingan.
    return this.perform(
      actor, kind, name, '', 'docker', [action, name], 60_000,
    );
  }

  // ------------------------------------------------------------------ //
  // fail2ban
  // ------------------------------------------------------------------ //

  /**
   * Manzilni bloklash/blokdan chiqarish.
   *
   * Eng katta xavf — o'zini quloflab qo'yish. Panel foydalanuvchisi
   * hujumchining IP'sini bloklamoqchi bo'lib, ro'yxatdan adashib o'z
   * manzilini tanlashi mumkin: shundan keyin panelga ham, SSH'ga ham
   * kira olmaydi. Shuning uchun so'rov kelgan manzil hech qanday
   * holatda bloklanmaydi.
   */
  async ban(
    actor: Actor,
    jail: string,
    rawIp: string,
    unban = false,
  ): Promise<ActionResult> {
    const kind = unban ? 'fail2ban.unban' : 'fail2ban.ban';
    const ip = normalizeIp(rawIp);
    const target = `${jail}:${ip}`;

    if (!isJail(jail)) {
      await this.refuse(
        actor, kind, target,
        `Noma'lum jail: ${jail}. Ruxsat etilganlari: ${JAILS.join(', ')}`,
      );
    }
    if (!isIP(ip)) {
      throw new BadRequestException(`Noto'g'ri IP manzil: ${rawIp}`);
    }

    // Blokdan CHIQARISH har doim xavfsiz — o'z manzilini qutqarish ham
    // shu yerdan o'tadi, shuning uchun quyidagi ikki tekshiruv faqat
    // bloklashga tegishli.
    if (!unban) {
      if (normalizeIp(actor.ip) === ip) {
        await this.refuse(
          actor, kind, target,
          'Bu sizning manzilingiz. Bloklansa panelga ham, SSH orqali ham kira olmaysiz.',
        );
      }
      if (isPrivateIp(ip)) {
        await this.refuse(
          actor, kind, target,
          `${ip} — ichki tarmoq manzili. Bloklash serverning o'z aloqasini va Docker ko'priklarini uzadi.`,
        );
      }
    }

    const result = await this.perform(
      actor, kind, target, '',
      'fail2ban-client',
      ['set', jail, unban ? 'unbanip' : 'banip', ip],
      20_000,
    );

    // Xavfsizlik ko'rinishi keshdan eski ro'yxatni bermasin.
    this.security.invalidate();
    return result;
  }

  // ------------------------------------------------------------------ //
  // ufw
  // ------------------------------------------------------------------ //

  /**
   * Raqamlangan qoidalar ro'yxati.
   *
   * `ufw delete` faqat raqam bo'yicha ishlaydi, raqam esa har
   * o'zgarishdan keyin siljiydi — shu sabab ro'yxat panelga ham,
   * o'chirish tekshiruviga ham HAR SAFAR yangidan o'qiladi.
   */
  async ufwRules(): Promise<UfwRule[]> {
    const out = await this.shell.exec('ufw', ['status', 'numbered']);
    const rules: UfwRule[] = [];

    for (const line of this.shell.lines(out)) {
      const m = /^\[\s*(\d+)\]\s+(.+)$/.exec(line);
      if (!m) continue;
      // ufw ustunlarni ikki va undan ortiq bo'shliq bilan ajratadi —
      // «Anywhere on eth0» kabi qiymatlar ichidagi bitta bo'shliq
      // ustun chegarasi emas.
      const cells = m[2].split(/\s{2,}/).map((c) => c.trim()).filter(Boolean);
      rules.push({
        number: Number(m[1]),
        to: cells[0] || '',
        action: cells[1] || '',
        from: cells[2] || '',
        raw: m[2].replace(/\s+/g, ' ').trim(),
        locked: ControlService.isLockedRule(cells[0] || '', cells[1] || ''),
      });
    }
    return rules;
  }

  /**
   * Qoida hayotiy portni ochib turibdimi.
   *
   * Faqat ALLOW qoidalari tekshiriladi: 22 ga DENY qoidasini o'chirish
   * kirishni ochadi, ya'ni xavfsiz tomonga xato.
   */
  private static isLockedRule(to: string, action: string): boolean {
    if (!/ALLOW|LIMIT/i.test(action)) return false;

    // `22/tcp`, `443`, `8000:9000/tcp`, `22/tcp (v6)`
    const range = /^(\d+):(\d+)/.exec(to);
    if (range) {
      const from = Number(range[1]);
      const till = Number(range[2]);
      return PROTECTED_PORTS.some((p) => p >= from && p <= till);
    }
    const port = Number(/^(\d+)/.exec(to)?.[1]);
    return PROTECTED_PORTS.includes(port);
  }

  /**
   * `disable` va `reset` hech qachon quriladigan argumentlar orasida
   * bo'lmasligi kerak.
   *
   * Argumentlar tekshirilgan maydonlardan yig'iladi, ya'ni bu yerga
   * yetib kelishi nazariy jihatdan imkonsiz. Shunday bo'lsa ham
   * tekshiramiz: kelajakda yangi endpoint qo'shilganda bu qator xatoni
   * serverni ochib qo'yishdan oldin ushlaydi.
   */
  private assertUfwSafe(args: string[]) {
    const forbidden = args.find((a) => /^(disable|reset|--force-reset)$/i.test(a));
    if (forbidden) {
      throw new ForbiddenException(
        `ufw ${forbidden} — panel orqali mutlaqo taqiqlangan.`,
      );
    }
  }

  async ufwAdd(
    actor: Actor,
    action: 'allow' | 'deny',
    port: number,
    proto: 'tcp' | 'udp' | 'any',
    from?: string,
  ): Promise<ActionResult> {
    const kind = `ufw.${action}`;
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new BadRequestException(`Noto'g'ri port: ${port}`);
    }

    const args: string[] = [action];
    let target = `${port}/${proto}`;

    if (from) {
      const ip = normalizeIp(from);
      if (!isIP(ip)) throw new BadRequestException(`Noto'g'ri manba IP: ${from}`);
      args.push('from', ip, 'to', 'any', 'port', String(port));
      if (proto !== 'any') args.push('proto', proto);
      target = `${ip} -> ${port}/${proto}`;
    } else {
      args.push(proto === 'any' ? String(port) : `${port}/${proto}`);
    }

    this.assertUfwSafe(args);
    const result = await this.perform(actor, kind, target, '', 'ufw', args);
    this.security.invalidate();
    return result;
  }

  async ufwDelete(actor: Actor, number: number): Promise<ActionResult> {
    const kind = 'ufw.delete';
    if (!Number.isInteger(number) || number < 1) {
      throw new BadRequestException(`Noto'g'ri qoida raqami: ${number}`);
    }

    // Raqam foydalanuvchi ekranni ochganidan beri siljigan bo'lishi
    // mumkin (boshqa oynada qoida qo'shilgan). Shuning uchun o'chirish
    // oldidan ro'yxat qaytadan o'qiladi va aynan shu raqamdagi qoida
    // tekshiriladi — eskirgan ekranga ishonmaymiz.
    const rules = await this.ufwRules();
    const rule = rules.find((r) => r.number === number);
    if (!rule) {
      await this.refuse(
        actor, kind, `#${number}`,
        `#${number} raqamli qoida yo'q — ro'yxat o'zgargan bo'lishi mumkin.`,
      );
    }
    if (rule!.locked) {
      await this.refuse(
        actor, kind, `#${number} ${rule!.raw}`,
        `Bu qoida hayotiy portni ochib turibdi (${PROTECTED_PORTS.join(', ')}). ` +
          'O`chirilsa serverga kirish yoki panelni ochish imkoni yo`qoladi.',
      );
    }

    const args = ['--force', 'delete', String(number)];
    this.assertUfwSafe(args);
    const result = await this.perform(
      actor, kind, `#${number} ${rule!.raw}`, rule!.raw, 'ufw', args,
    );
    this.security.invalidate();
    return result;
  }

  // ------------------------------------------------------------------ //
  // Chegaralar — frontend tugmalarni oldindan bloklashi uchun
  // ------------------------------------------------------------------ //

  /**
   * Panel qoidalarni O'ZI ham bilib tursin.
   *
   * Frontend bu ro'yxatsiz ham xavfsiz — chegara serverda tekshiriladi.
   * Lekin bosilgach «taqiqlangan» deb javob beradigan tugma yomon
   * interfeys: foydalanuvchi nima mumkinligini oldindan ko'rishi kerak.
   *
   * `yourIp` shu ro'yxatning bir qismi: hujum manbalari jadvalida o'z
   * manzilingiz yonidagi «bloklash» tugmasi o'chirilgan bo'lishi kerak,
   * aks holda uni bosib ko'rgandan keyingina taqiq borligini bilasiz.
   */
  limits(actor: Actor) {
    return {
      yourIp: normalizeIp(actor.ip),
      units: PROTECTED_UNITS,
      unitReasons: PROTECTED_UNITS.reduce<Record<string, string>>((acc, u) => {
        acc[u] = unitReason(u.replace('*', ''));
        return acc;
      }, {}),
      containerPattern: 'caddy',
      containerReason: containerReason('caddy'),
      jails: [...JAILS],
      ports: PROTECTED_PORTS,
      fileRoots: FILE_ROOTS,
      selfUnit: SELF_UNIT,
    };
  }
}
