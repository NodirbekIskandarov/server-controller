import {
  Body, Controller, Delete, Get, HttpCode, Param, Post, Req, UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min,
} from 'class-validator';
import type { Request } from 'express';
import { AuthGuard } from '../auth/auth.guard';
import { actorOf } from '../common/actor';
import { ControlService } from './control.service';

class UnitDto {
  @IsString() @MaxLength(80)
  // Shablon shu yerda ham takrorlanadi: xato nom kontrollergacha
  // yetib kelmasa, xizmatga umuman tushmaydi.
  @Matches(/^[a-zA-Z0-9][a-zA-Z0-9@._-]*$/, { message: 'Noto`g`ri unit nomi' })
  unit: string;

  @IsIn(['start', 'stop', 'restart', 'reload']) amal: 'start' | 'stop' | 'restart' | 'reload';
}

class ContainerDto {
  @IsString() @MaxLength(128)
  @Matches(/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/, { message: 'Noto`g`ri konteyner nomi' })
  nom: string;

  @IsIn(['start', 'stop', 'restart']) amal: 'start' | 'stop' | 'restart';
}

class BanDto {
  @IsIn(['ban', 'unban']) amal: 'ban' | 'unban';
  @IsString() @MaxLength(32) jail: string;
  @IsString() @MaxLength(45) ip: string;
}

class UfwDto {
  @IsIn(['allow', 'deny']) amal: 'allow' | 'deny';
  @IsInt() @Min(1) @Max(65535) port: number;
  @IsOptional() @IsIn(['tcp', 'udp', 'any']) protokol?: 'tcp' | 'udp' | 'any';
  @IsOptional() @IsString() @MaxLength(45) manba?: string;
}

/**
 * Yozish amallari.
 *
 * Umumiy chegara minutiga 300 so'rov — kuzatuv uchun to'g'ri, lekin
 * yozish uchun juda bo'sh. Bu yerda alohida, ancha tor chegara:
 * xizmatni sekundiga o'nlab marta qayta ishga tushirish odatiy ish
 * emas, buzilish yoki suiiste'mol belgisi.
 */
@Controller('api/control')
@UseGuards(AuthGuard)
@Throttle({ default: { ttl: 60_000, limit: 40 } })
export class ControlController {
  constructor(private readonly control: ControlService) {}

  @Get('limits')
  limits(@Req() req: Request) {
    return this.control.limits(actorOf(req));
  }

  @Post('service')
  @HttpCode(200)
  unit(@Body() dto: UnitDto, @Req() req: Request) {
    return this.control.unit(actorOf(req), dto.unit, dto.amal);
  }

  @Post('docker')
  @HttpCode(200)
  container(@Body() dto: ContainerDto, @Req() req: Request) {
    return this.control.container(actorOf(req), dto.nom, dto.amal);
  }

  @Post('fail2ban')
  @HttpCode(200)
  ban(@Body() dto: BanDto, @Req() req: Request) {
    return this.control.ban(actorOf(req), dto.jail, dto.ip, dto.amal === 'unban');
  }

  @Get('ufw')
  ufwRules() {
    return this.control.ufwRules().then((rules) => ({ rules }));
  }

  @Post('ufw')
  @HttpCode(200)
  ufwAdd(@Body() dto: UfwDto, @Req() req: Request) {
    return this.control.ufwAdd(
      actorOf(req), dto.amal, dto.port, dto.protokol || 'tcp', dto.manba,
    );
  }

  @Delete('ufw/:number')
  ufwDelete(@Param('number') number: string, @Req() req: Request) {
    return this.control.ufwDelete(actorOf(req), Number(number));
  }
}
