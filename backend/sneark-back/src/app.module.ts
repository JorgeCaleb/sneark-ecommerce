import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { CloudinaryModule } from './cloudinary/cloudinary.module.js';
import { UsuariosModule } from './usuarios/usuarios.module.js';
import { AuthModule } from './auth/auth.module.js';
import { MarcasModule } from './marcas/marcas.module.js';
import { CategoriasModule } from './categorias/categorias.module.js';
import { ProductosModule } from './productos/productos.module.js';
import { CarritoModule } from './carrito/carrito.module.js';
import { PedidosModule } from './pedidos/pedidos.module.js';
import { ColoresModule } from './colores/colores.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    CloudinaryModule,
    UsuariosModule,
    AuthModule,
    MarcasModule,
    CategoriasModule,
    ProductosModule,
    CarritoModule,
    PedidosModule,
    ColoresModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
