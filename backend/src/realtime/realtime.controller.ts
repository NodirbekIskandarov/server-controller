import { Controller, Sse, UseGuards } from '@nestjs/common';
import { filter, map, Observable } from 'rxjs';
import { AuthGuard } from '../auth/auth.guard';
import { RealtimeService } from './realtime.service';

@Controller('api/live')
@UseGuards(AuthGuard)
export class RealtimeController {
  constructor(private readonly realtime: RealtimeService) {}

  /**
   * Server-Sent Events — server mijozga o'zi yuboradi.
   * WebSocket'dan sodda: oddiy HTTP oqimi, proxy orqali muammosiz
   * o'tadi va bizga faqat bir yo'nalish kerak.
   */
  @Sse()
  stream(): Observable<MessageEvent> {
    return this.realtime.stream.pipe(
      filter((s) => s !== null),
      map((s) => ({ data: s }) as MessageEvent),
    );
  }
}
