import { Injectable, Logger } from '@nestjs/common';
import { spawn } from 'node:child_process';
import { Observable } from 'rxjs';

/**
 * Jonli log oqimi.
 *
 * Har bir ulanish uchun alohida `journalctl -f` yoki `docker logs -f`
 * jarayoni ochiladi va mijoz uzilishi bilan darhol yopiladi. Shu sabab
 * unutilgan jarayon qolib ketmaydi.
 *
 * Xavfsizlik: xizmat va konteyner nomlari qat'iy shablon bilan
 * tekshiriladi va `execFile` uslubida argument sifatida beriladi —
 * shell umuman ishtirok etmaydi.
 */
@Injectable()
export class LogsService {
  private readonly log = new Logger(LogsService.name);

  private readonly UNIT = /^[a-zA-Z0-9@._-]{1,80}$/;
  private readonly MAX_LINE = 4000;

  /**
   * Logga tushib qolgan sirlarni yashiradi.
   *
   * Panel boshqa odamlarning loyihalari loglarini ham ko'rsatadi va ular
   * qanday yozishini biz boshqarmaymiz. Masalan `httpx` INFO darajasida
   * so'rov manzilini yozadi, Telegram esa tokenni aynan manzil ichida
   * saqlaydi — natijada token brauzerga chiqib ketardi.
   *
   * Bu yakuniy himoya emas (log fayl serverda baribir turadi), lekin
   * panel orqali sirni ko'rish yo'lini yopadi.
   */
  private static readonly SECRETS: [RegExp, string][] = [
    // Telegram bot tokeni: 8800040562:AA...
    [/\b\d{8,12}:[A-Za-z0-9_-]{30,}/g, '<token-yashirildi>'],
    // Anthropic / OpenAI kalitlari
    [/\bsk-[A-Za-z0-9_-]{16,}/g, '<kalit-yashirildi>'],
    // Authorization sarlavhasi
    [/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{16,}/gi, '$1 <yashirildi>'],
    // ?token=... , &password=... , api_key=...
    [/\b(token|password|passwd|secret|api[_-]?key|access[_-]?key)=([^\s&"']{6,})/gi,
     '$1=<yashirildi>'],
    // Ulanish satridagi parol: proto://user:parol@host
    [/(\w+:\/\/[^:/\s]+):([^@\s]{3,})@/g, '$1:<yashirildi>@'],
  ];

  static redact(line: string): string {
    let out = line;
    for (const [rx, to] of LogsService.SECRETS) out = out.replace(rx, to);
    return out;
  }

  tail(kind: string, name: string): Observable<MessageEvent> {
    return new Observable<MessageEvent>((subscriber) => {
      const emit = (line: string, stream = 'out') => {
        subscriber.next({
          data: {
            at: new Date().toISOString(),
            line: LogsService.redact(line.slice(0, this.MAX_LINE)),
            stream,
          },
        } as MessageEvent);
      };

      // «tizim» butun jurnalni oqizadi, unga nom kerak emas.
      if (kind !== 'tizim' && !this.UNIT.test(name || '')) {
        emit("Noto'g'ri nom.", 'err');
        subscriber.complete();
        return;
      }

      let cmd: string;
      let args: string[];
      if (kind === 'tizim') {
        // Butun jurnal — bitta xizmat emas. Nom kerak emas.
        cmd = 'journalctl';
        args = ['-f', '-n', '150', '--output=short-iso', '--no-pager'];
      } else if (kind === 'docker') {
        cmd = 'docker';
        args = ['logs', '-f', '--tail', '120', '--timestamps', name];
      } else {
        const unit = name.endsWith('.service') ? name : `${name}.service`;
        cmd = 'journalctl';
        args = ['-u', unit, '-f', '-n', '120', '--output=short-iso', '--no-pager'];
      }

      emit(
        kind === 'tizim'
          ? '— butun tizim jurnali kuzatilmoqda —'
          : `— ${kind === 'docker' ? 'konteyner' : 'xizmat'} ${name} kuzatilmoqda —`,
        'info',
      );

      const child = spawn(cmd, args, {
        env: { ...process.env, LANG: 'C', LC_ALL: 'C' },
      });

      // Qatorlar bo'lak-bo'lak kelishi mumkin — to'liq qator yig'ilgunча
      // buferda saqlaymiz, aks holda matn o'rtasidan bo'linib ketadi.
      let buffer = '';
      const onChunk = (stream: string) => (chunk: Buffer) => {
        buffer += chunk.toString('utf8');
        const parts = buffer.split('\n');
        buffer = parts.pop() ?? '';
        for (const line of parts) {
          if (line.trim()) emit(line.trimEnd(), stream);
        }
      };

      child.stdout.on('data', onChunk('out'));
      child.stderr.on('data', onChunk('err'));
      child.on('error', (err) => {
        emit(`Ishga tushirib bo'lmadi: ${err.message}`, 'err');
        subscriber.complete();
      });
      child.on('close', () => {
        emit('— oqim tugadi —', 'info');
        subscriber.complete();
      });

      return () => {
        child.kill('SIGTERM');
        // SIGTERM'ga javob bermasa majburan yopamiz.
        setTimeout(() => child.killed || child.kill('SIGKILL'), 2000);
      };
    });
  }
}
