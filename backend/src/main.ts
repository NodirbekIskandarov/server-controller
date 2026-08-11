import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const log = new Logger('server-controller');

  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    log.error('JWT_SECRET yo`q yoki juda qisqa (kamida 32 belgi).');
    process.exit(1);
  }

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: false,
  });

  // Caddy orqasida ishlaydi — haqiqiy IP sarlavhadan olinadi.
  app.set('trust proxy', 1);

  app.use(cookieParser());
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:'],
          connectSrc: ["'self'"],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
          baseUri: ["'none'"],
          formAction: ["'self'"],
        },
      },
      crossOriginEmbedderPolicy: false,
      hsts: { maxAge: 31536000, includeSubDomains: true },
    }),
  );

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const port = Number(process.env.PORT) || 8200;
  const host = process.env.HOST || '127.0.0.1';
  await app.listen(port, host);
  log.log(`Server kuzatuvi tayyor: http://${host}:${port}`);
}

void bootstrap();
