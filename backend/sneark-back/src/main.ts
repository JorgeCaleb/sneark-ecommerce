import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Prefijo global para todas las rutas de la API
  app.setGlobalPrefix('api');

  // Validación automática de todos los DTOs con class-validator
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,       // Elimina campos no definidos en el DTO
      forbidNonWhitelisted: true, // Lanza error si llegan campos extra
      transform: true,       // Transforma los tipos automáticamente
    }),
  );

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`Servidor corriendo en: http://localhost:${port}/api`);
}
await bootstrap();
