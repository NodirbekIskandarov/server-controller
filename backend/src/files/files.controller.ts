import {
  Body, Controller, Get, HttpCode, Post, Query, Req, UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsString, MaxLength } from 'class-validator';
import type { Request } from 'express';
import { AuthGuard } from '../auth/auth.guard';
import { actorOf } from '../common/actor';
import { MAX_FILE_BYTES } from '../common/limits';
import { FilesService } from './files.service';

class SaveDto {
  @IsString() @MaxLength(4096) yol: string;
  // Chegara xizmatda ham bor (baytlarda), bu yerda belgilar bo'yicha
  // qo'pol to'siq: juda katta tana umuman parse qilinmasin.
  @IsString() @MaxLength(MAX_FILE_BYTES) matn: string;
}

@Controller('api/files')
@UseGuards(AuthGuard)
export class FilesController {
  constructor(private readonly files: FilesService) {}

  @Get('list')
  list(@Query('yol') path?: string) {
    return this.files.list(path);
  }

  @Get()
  read(@Query('yol') path: string) {
    return this.files.read(path);
  }

  @Post()
  @HttpCode(200)
  // Tahrir — yozish amali, umumiy 300 ta so'rov chegarasi bunga keng.
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  save(@Body() dto: SaveDto, @Req() req: Request) {
    return this.files.write(actorOf(req), dto.yol, dto.matn);
  }
}
