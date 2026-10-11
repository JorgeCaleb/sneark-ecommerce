import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  ParseIntPipe,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { PagosService } from './pagos.service.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { UsuarioActual } from '../auth/decorators/usuario-actual.decorator.js';

@Controller('pagos')
export class PagosController {
  constructor(private readonly pagosService: PagosService) {}

  // POST /api/pagos/preferencia/:pedidoId
  // Genera la URL del checkout de Mercado Pago para un pedido existente
  @UseGuards(JwtAuthGuard)
  @Post('preferencia/:pedidoId')
  crearPreferencia(
    @Param('pedidoId', ParseIntPipe) pedidoId: number,
    @UsuarioActual('id') usuarioId: number,
  ) {
    return this.pagosService.crearPreferencia(pedidoId, usuarioId);
  }

  // POST /api/pagos/webhook
  // Mercado Pago llama aquí cuando hay un cambio de estado en el pago
  // Sin autenticación JWT — MP firma la notificación con su propia clave
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  procesarWebhook(@Body() body: Record<string, unknown>) {
    return this.pagosService.procesarWebhook(body);
  }

  // GET /api/pagos/estado/:pedidoId
  // El frontend consulta el estado al volver del checkout de MP
  @UseGuards(JwtAuthGuard)
  @Get('estado/:pedidoId')
  consultarEstado(
    @Param('pedidoId', ParseIntPipe) pedidoId: number,
    @UsuarioActual('id') usuarioId: number,
  ) {
    return this.pagosService.consultarEstadoPedido(pedidoId, usuarioId);
  }
}
