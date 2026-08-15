import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { AuditService } from './audit.service';

@Controller('api/audit')
@UseGuards(AuthGuard)
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  /**
   * Jurnal FAQAT o'qiladi.
   *
   * O'chirish yoki tahrirlash endpointi ataylab yo'q: audit jurnalini
   * panel orqali tozalash mumkin bo'lsa, u audit jurnali emas.
   */
  @Get()
  async list(@Query('qator') limit?: string, @Query('amal') action?: string) {
    const rows = await this.audit.list(
      Math.min(Math.max(Number(limit) || 200, 1), 1000),
      action || undefined,
    );
    return { rows, summary: await this.audit.summary() };
  }
}
