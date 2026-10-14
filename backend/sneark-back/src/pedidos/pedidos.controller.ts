import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { PedidosService } from './pedidos.service.js';
import { CrearPedidoDto } from './dto/crear-pedido.dto.js';
import { ActualizarEstadoDto } from './dto/actualizar-estado.dto.js';
import { FiltrarPedidosDto } from './dto/filtrar-pedidos.dto.js';
import { DashboardPedidosDto } from './dto/dashboard-pedidos.dto.js';
import { CotizarEnvioDto } from './dto/cotizar-envio.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { Admin } from '../auth/decorators/admin.decorator.js';
import { UsuarioActual } from '../auth/decorators/usuario-actual.decorator.js';
import type { UsuarioAutenticado } from '../auth/decorators/usuario-actual.decorator.js';

@UseGuards(JwtAuthGuard)
@Controller('pedidos')
export class PedidosController {
  constructor(private readonly pedidosService: PedidosService) {}

  @Get('envio/opciones')
  opcionesEnvio() {
    return this.pedidosService.obtenerOpcionesEnvio();
  }

  @Get('envio/cotizar')
  cotizarEnvio(@Query() dto: CotizarEnvioDto) {
    return this.pedidosService.cotizarEnvio(dto.distrito);
  }

  // POST /api/pedidos — crear pedido desde el carrito
  @Post()
  crear(@UsuarioActual('id') usuarioId: number, @Body() dto: CrearPedidoDto) {
    return this.pedidosService.crear(usuarioId, dto);
  }

  // GET /api/pedidos/mis-pedidos — mis pedidos como cliente
  @Get('mis-pedidos')
  misPedidos(@UsuarioActual('id') usuarioId: number) {
    return this.pedidosService.misPedidos(usuarioId);
  }

  @Admin()
  @Get('admin/dashboard')
  resumenDashboard(@Query() filtros: DashboardPedidosDto) {
    return this.pedidosService.obtenerResumenDashboard(filtros);
  }

  // GET /api/pedidos/admin/list — pedidos paginados (ADMIN)
  @Admin()
  @Get('admin/list')
  buscarPagina(@Query() filtros: FiltrarPedidosDto) {
    return this.pedidosService.buscarPagina(filtros);
  }

  // GET /api/pedidos/:id — ver detalle de un pedido
  @Get(':id')
  buscarPorId(
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Param('id', ParseIntPipe) id: number,
  ) {
    if (usuario.rol === 'ADMIN') {
      return this.pedidosService.buscarPorId(id);
    }
    return this.pedidosService.buscarPorUsuario(id, usuario.id);
  }

  // PATCH /api/pedidos/:id/cancelar — cancelar mi pedido
  @Patch(':id/cancelar')
  cancelar(
    @UsuarioActual('id') usuarioId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.pedidosService.cancelar(usuarioId, id);
  }

  // ─── Rutas ADMIN ─────────────────────────────────────────────────────────────

  // PATCH /api/pedidos/:id/estado — cambiar estado del pedido (ADMIN)
  @Admin()
  @Patch(':id/estado')
  actualizarEstado(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ActualizarEstadoDto,
  ) {
    return this.pedidosService.actualizarEstado(id, dto);
  }
}
