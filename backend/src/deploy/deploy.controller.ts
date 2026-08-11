import {
  Body, Controller, Get, Headers, HttpCode, Param, Post, RawBodyRequest,
  Req, Sse, UnauthorizedException, UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { timingSafeEqual } from 'node:crypto';
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

  /**
   * GitHub webhook. Imzo HMAC-SHA256 bilan tekshiriladi — faqat
   * DEPLOY_SECRET ni biladigan tomon so'rov yubora oladi.
   */
  @Public()
  @Post('hook/:project')
  @HttpCode(202)
  async hook(
    @Param('project') project: string,
    @Headers('x-deploy-token') token: string,
    @Headers('x-github-event') event: string,
  ) {
    const expected = this.config.get<string>('DEPLOY_SECRET', '');
    if (!expected) throw new UnauthorizedException('Webhook sozlanmagan');

    const a = Buffer.from(String(token || ''));
    const b = Buffer.from(expected);
    // Uzunlik ham, mazmun ham mos kelishi kerak. timingSafeEqual turli
    // uzunlikda xato beradi, shuning uchun oldin tekshiramiz.
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new UnauthorizedException('Token mos kelmadi');
    }

    const run = await this.deploy.start(project, `github${event ? `: ${event}` : ''}`);
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
