import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { ServeStaticModule } from '@nestjs/serve-static';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { join } from 'node:path';

import { ShellService } from './common/shell.service';
import { SystemService } from './system/system.service';
import { ProjectsService } from './projects/projects.service';
import { DockerService } from './docker/docker.service';
import { ServicesService } from './services/services.service';
import { SecurityService } from './security/security.service';
import { TrafficService } from './traffic/traffic.service';
import { RealtimeService } from './realtime/realtime.service';
import { RealtimeController } from './realtime/realtime.controller';
import { AuthService } from './auth/auth.service';
import { AuthController } from './auth/auth.controller';
import { AppController } from './app.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env'] }),
    JwtModule.registerAsync({
      global: true,
      useFactory: () => ({
        secret: process.env.JWT_SECRET,
        signOptions: { expiresIn: '12h' },
      }),
    }),
    // Umumiy so'rov chegarasi — panel buzishga urinilsa yuk bermasin.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }]),
    // React yig'ilgan fayllari. SPA marshrutlari index.html ga tushadi,
    // /api ostidagi yo'llar esa NestJS kontrollerlariga.
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'public'),
      exclude: ['/api/{*splat}'],
      serveStaticOptions: { index: 'index.html', fallthrough: true },
    }),
  ],
  controllers: [AppController, AuthController, RealtimeController],
  providers: [
    ShellService,
    SystemService,
    ProjectsService,
    DockerService,
    ServicesService,
    SecurityService,
    TrafficService,
    RealtimeService,
    AuthService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
