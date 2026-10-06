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
  Request,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { PedidosService } from './pedidos.service.js';
import { CrearPedidoDto } from './dto/crear-pedido.dto.js';
import { ActualizarEstadoDto } from './dto/actualizar-estado.dto.js';
import { SubirComprobanteDto } from './dto/subir-comprobante.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';

@UseGuards(JwtAuthGuard)
@Controller('pedidos')
export class PedidosController {
  constructor(private readonly pedidosService: PedidosService) {}

  // POST /api/pedidos — crear pedido desde el carrito
  @Post()
  crear(@Request() req: any, @Body() dto: CrearPedidoDto) {
    return this.pedidosService.crear(req.user.id, dto);
  }

  // GET /api/pedidos/mis-pedidos — mis pedidos como cliente
  @Get('mis-pedidos')
  misPedidos(@Request() req: any) {
    return this.pedidosService.misPedidos(req.user.id);
  }

  // GET /api/pedidos/:id — ver detalle de un pedido
  @Get(':id')
  buscarPorId(@Param('id', ParseIntPipe) id: number) {
    return this.pedidosService.buscarPorId(id);
  }

  // POST /api/pedidos/:id/comprobante — subir foto del comprobante Yape/Plin
  @Post(':id/comprobante')
  @UseInterceptors(
    FileInterceptor('comprobante', {
      storage: memoryStorage(),
      fileFilter: (_req, file, cb) => {
        const permitidos = ['image/jpeg', 'image/png', 'image/webp'];
        if (permitidos.includes(file.mimetype)) {
          cb(null, true);
        } else {
          cb(new Error('Solo se permiten imágenes JPG, PNG o WEBP'), false);
        }
      },
      limits: { fileSize: 10 * 1024 * 1024 }, // máx 10MB para comprobantes
    }),
  )
  subirComprobante(
    @Request() req: any,
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() archivo: Express.Multer.File,
    @Body() dto: SubirComprobanteDto,
  ) {
    return this.pedidosService.subirComprobante(req.user.id, id, archivo, dto);
  }

  // PATCH /api/pedidos/:id/cancelar — cancelar mi pedido
  @Patch(':id/cancelar')
  cancelar(@Request() req: any, @Param('id', ParseIntPipe) id: number) {
    return this.pedidosService.cancelar(req.user.id, id);
  }

  // ─── Rutas ADMIN ─────────────────────────────────────────────────────────────

  // GET /api/pedidos — todos los pedidos (ADMIN)
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @Get()
  buscarTodos(@Query('estado') estado?: string) {
    return this.pedidosService.buscarTodos(estado);
  }

  // PATCH /api/pedidos/:id/estado — cambiar estado del pedido (ADMIN)
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @Patch(':id/estado')
  actualizarEstado(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ActualizarEstadoDto,
  ) {
    return this.pedidosService.actualizarEstado(id, dto);
  }
}
