import { Module } from '@nestjs/common';
import { PedidosService } from './pedidos.service.js';
import { PedidosController } from './pedidos.controller.js';
import { CarritoModule } from '../carrito/carrito.module.js';

@Module({
  imports: [CarritoModule], // necesita CarritoService para obtener y vaciar el carrito
  controllers: [PedidosController],
  providers: [PedidosService],
})
export class PedidosModule {}
