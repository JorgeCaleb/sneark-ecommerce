import { INestApplication, ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';

export function configurarAplicacion(app: INestApplication) {
  app.use(helmet());

  app.enableCors({
    origin: process.env.FRONTEND_ORIGIN ?? 'http://localhost:4200',
  });

  app.setGlobalPrefix('api');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
}
