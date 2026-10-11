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
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { PedidosService } from './pedidos.service.js';
import { CrearPedidoDto } from './dto/crear-pedido.dto.js';
import { ActualizarEstadoDto } from './dto/actualizar-estado.dto.js';
import { SubirComprobanteDto } from './dto/subir-comprobante.dto.js';
import { FiltrarPedidosDto } from './dto/filtrar-pedidos.dto.js';
import { DashboardPedidosDto } from './dto/dashboard-pedidos.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { Admin } from '../auth/decorators/admin.decorator.js';
import { UsuarioActual } from '../auth/decorators/usuario-actual.decorator.js';
import type { UsuarioAutenticado } from '../auth/decorators/usuario-actual.decorator.js';
import { aceptarTipoArchivo } from '../common/filtro-tipo-archivo.util.js';

@UseGuards(JwtAuthGuard)
@Controller('pedidos')
export class PedidosController {
  constructor(private readonly pedidosService: PedidosService) {}

  // POST /api/pedidos — crear pedido desde el carrito
  @Post()
  crear(
    @UsuarioActual('id') usuarioId: number,
    @Body() dto: CrearPedidoDto,
  ) {
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
    const usuarioReal = (usuario as any)?.user ?? usuario;
    if (usuarioReal?.rol === 'ADMIN') {
      return this.pedidosService.buscarPorId(id);
    }

    return this.pedidosService.buscarPorUsuario(id, usuarioReal?.id);
  }

  // POST /api/pedidos/:id/comprobante — subir foto del comprobante Yape/Plin
  @Post(':id/comprobante')
  @UseInterceptors(
    FileInterceptor('comprobante', {
      storage: memoryStorage(),
      fileFilter: (_req, file, cb) => {
        const permitidos = ['image/jpeg', 'image/png', 'image/webp'];
        aceptarTipoArchivo(
          file.mimetype,
          permitidos,
          'Solo se permiten imágenes JPG, PNG o WEBP',
          cb,
        );
      },
      limits: { fileSize: 10 * 1024 * 1024 }, // máx 10MB para comprobantes
    }),
  )
  subirComprobante(
    @UsuarioActual('id') usuarioId: number,
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() archivo: Express.Multer.File | undefined,
    @Body() dto: SubirComprobanteDto,
  ) {
    return this.pedidosService.subirComprobante(usuarioId, id, archivo, dto);
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

  // GET /api/pedidos — pedidos paginados (ADMIN, compatibilidad)
  @Admin()
  @Get()
  buscarTodos(@Query() filtros: FiltrarPedidosDto) {
    return this.pedidosService.buscarPagina(filtros);
  }

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
