import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { AuthGuard, Public } from './auth/auth.guard';
import { SystemService } from './system/system.service';
import { ProjectsService } from './projects/projects.service';
import { DockerService } from './docker/docker.service';
import { ServicesService } from './services/services.service';
import { SecurityService } from './security/security.service';
import { TrafficService } from './traffic/traffic.service';

@Controller('api')
@UseGuards(AuthGuard)
export class AppController {
  constructor(
    private readonly system: SystemService,
    private readonly projects: ProjectsService,
    private readonly docker: DockerService,
    private readonly services: ServicesService,
    private readonly security: SecurityService,
    private readonly traffic: TrafficService,
  ) {}

  @Public()
  @Get('salomatlik')
  health() {
    return { holat: 'ok', vaqt: new Date().toISOString() };
  }

  @Get('system')
  systemInfo() {
    return this.system.snapshot();
  }

  @Get('projects')
  async projectList(@Query('yangila') refresh?: string) {
    const items = await this.projects.list(refresh === '1');
    return { items, summary: await this.projects.summary() };
  }

  @Get('docker')
  async dockerInfo() {
    const [summary, images, usage] = await Promise.all([
      this.docker.summary(),
      this.docker.images(),
      this.docker.diskUsage(),
    ]);
    return { ...summary, images, usage };
  }

  @Get('services')
  serviceList() {
    return this.services.summary();
  }

  @Get('services/:unit/logs')
  serviceLogs(@Param('unit') unit: string, @Query('qator') lines?: string) {
    return this.services.logs(unit, Number(lines) || 80).then((rows) => ({ rows }));
  }

  @Get('security')
  securityInfo() {
    return this.security.overview();
  }

  @Get('traffic')
  async trafficInfo(@Query('daqiqa') minutes?: string) {
    const window = Math.min(Math.max(Number(minutes) || 60, 5), 1440);
    const [stats, ports] = await Promise.all([
      this.traffic.stats(window),
      this.traffic.ports(),
    ]);
    return { ...stats, ports };
  }
}
