import {
  Body, Controller, Get, Headers, HttpCode, Param, Post,
  Req, Sse, UnauthorizedException, UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { map, Observable } from 'rxjs';
import { AuthGuard, Public } from '../auth/auth.guard';
import { DeployService } from './deploy.service';

class TriggerDto {
  @IsOptional() @IsString() @MaxLength(80) izoh?: string;
}

@Controller('api/deploy')
@UseGuards(AuthGuard)
export class DeployController {
  constructor(
    private readonly deploy: DeployService,
    private readonly config: ConfigService,
  ) {}

  @Get()
  list() {
    return {
      targets: this.deploy.targets.map((t) => ({
        name: t.name,
        path: t.path,
        repo: t.repo,
        running: this.deploy.isRunning(t.name),
      })),
      runs: this.deploy.list(),
    };
  }

  /** Panel ichidan qo'lda ishga tushirish. */
  @Post(':project')
  @HttpCode(202)
  async manual(
    @Param('project') project: string,
    @Body() dto: TriggerDto,
    @Req() req: any,
  ) {
    const run = await this.deploy.start(
      project,
      `qo'lda: ${req.user?.sub || 'admin'}${dto.izoh ? ` — ${dto.izoh}` : ''}`,
    );
    return { id: run.id, project: run.project };
  }

  /** Ikki qiymatni vaqt sirg'alishisiz taqqoslaydi. */
  private same(a: string, b: string): boolean {
    const x = Buffer.from(a || '');
    const y = Buffer.from(b || '');
    // timingSafeEqual turli uzunlikda xato tashlaydi, shuning uchun
    // uzunlikni oldin tekshiramiz.
    return x.length === y.length && x.length > 0 && timingSafeEqual(x, y);
  }

  /**
   * GitHub webhook (Settings -> Webhooks).
   *
   * Nega Actions emas: webhook GitHub Actions daqiqalarini sarflamaydi
   * va hisobdagi to'lov holatiga bog'liq emas. Push bo'lishi bilan
   * darhol keladi.
   *
   * Ikki xil tasdiqlash qabul qilinadi:
   *   1) X-Hub-Signature-256 — GitHub yuboradigan HMAC imzo
   *   2) X-Deploy-Token — qo'lda curl bilan chaqirish uchun
   */
  @Public()
  @Post('hook/:project')
  @HttpCode(202)
  async hook(
    @Param('project') project: string,
    @Headers('x-deploy-token') token: string,
    @Headers('x-hub-signature-256') signature: string,
    @Headers('x-github-event') event: string,
    @Req() req: any,
  ) {
    const secret = this.config.get<string>('DEPLOY_SECRET', '');
    if (!secret) throw new UnauthorizedException('Webhook sozlanmagan');

    let allowed = false;

    if (signature) {
      // GitHub imzoni XOM tana ustidan hisoblaydi — JSON qayta
      // yig'ilsa (bo'shliqlar o'zgarsa) imzo mos kelmay qoladi.
      const raw: Buffer = req.rawBody ?? Buffer.from('');
      const digest =
        'sha256=' + createHmac('sha256', secret).update(raw).digest('hex');
      allowed = this.same(signature, digest);
      if (!allowed) throw new UnauthorizedException('Imzo mos kelmadi');
    } else if (token) {
      allowed = this.same(token, secret);
      if (!allowed) throw new UnauthorizedException('Token mos kelmadi');
    } else {
      throw new UnauthorizedException('Imzo yoki token yo`q');
    }

    // GitHub webhook qo'shilganda sinov uchun «ping» yuboradi.
    if (event === 'ping') {
      return { pong: true, project };
    }

    // Faqat main tarmog'i. Boshqa tarmoqqa push qilinganda
    // joylashtirmaymiz — aks holda yarim tayyor kod serverga chiqib ketardi.
    const ref: string | undefined = req.body?.ref;
    if (event === 'push' && ref && ref !== 'refs/heads/main') {
      return { skipped: true, reason: `${ref} — main emas` };
    }

    const run = await this.deploy.start(
      project,
      `github${event ? `: ${event}` : ''}`,
    );
    return { id: run.id, project: run.project };
  }

  /** Joylashtirish loglari jonli oqadi. */
  @Sse('oqim')
  stream(): Observable<MessageEvent> {
    return this.deploy.events.pipe(
      map((e) => ({ data: e }) as MessageEvent),
    );
  }

  @Get('run/:id')
  run(@Param('id') id: string) {
    return this.deploy.get(id) || { xato: 'topilmadi' };
  }
}
