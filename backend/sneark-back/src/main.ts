import { NestFactory } from '@nestjs/core';
import { configurarAplicacion } from './configurar-aplicacion.js';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  configurarAplicacion(app);

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`Servidor corriendo en: http://localhost:${port}/api`);
}
await bootstrap();
