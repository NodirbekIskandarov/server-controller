import { Controller, Query, Sse, UseGuards } from '@nestjs/common';
import { Observable } from 'rxjs';
import { AuthGuard } from '../auth/auth.guard';
import { LogsService } from './logs.service';

@Controller('api/logs')
@UseGuards(AuthGuard)
export class LogsController {
  constructor(private readonly logs: LogsService) {}

  /**
   * Jonli log oqimi. `journalctl -f` yoki `docker logs -f` chiqishini
   * to'g'ridan-to'g'ri panelga uzatadi — kutish yo'q, qator paydo
   * bo'lishi bilan ko'rinadi.
   */
  @Sse('oqim')
  stream(
    @Query('tur') kind: string,
    @Query('nom') name: string,
  ): Observable<MessageEvent> {
    return this.logs.tail(kind, name);
  }
}
