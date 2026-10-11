import { INestApplication, ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { obtenerOrigenPublico } from './common/origen-publico.util.js';

export function configurarAplicacion(app: INestApplication) {
  app.use(helmet());

  app.enableCors({
    origin: obtenerOrigenPublico(
      process.env.FRONTEND_ORIGIN,
      'FRONTEND_ORIGIN',
      process.env.NODE_ENV === 'production',
      'http://localhost:4200',
    ),
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
