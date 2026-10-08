import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  ParseIntPipe,
  UseGuards,
  UseInterceptors,
  UploadedFiles,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ProductosService } from './productos.service.js';
import { CrearProductoDto } from './dto/crear-producto.dto.js';
import { ActualizarProductoDto } from './dto/actualizar-producto.dto.js';
import { ActualizarStockTallaDto } from './dto/actualizar-stock-talla.dto.js';
import { FiltrarProductosDto } from './dto/filtrar-productos.dto.js';
import { PrevisualizarSkuDto } from './dto/previsualizar-sku.dto.js';
import { FiltrarInventarioDto } from './dto/filtrar-inventario.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { aceptarTipoArchivo } from '../common/filtro-tipo-archivo.util.js';

@Controller('productos')
export class ProductosController {
  constructor(private readonly productosService: ProductosService) {}

  // GET /api/productos — público, con filtros y paginación
  @Get()
  buscarTodos(@Query() filtros: FiltrarProductosDto) {
    return this.productosService.buscarTodos(filtros);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Get('sku-preview')
  previsualizarSku(@Query() dto: PrevisualizarSkuDto) {
    return this.productosService.previsualizarSku(dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Get('admin/inventario')
  resumenInventarioActivo() {
    return this.productosService.resumenInventarioActivo();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Get('admin/variantes')
  buscarVariantesInventario(@Query() filtros: FiltrarInventarioDto) {
    return this.productosService.buscarVariantesInventario(filtros);
  }

  // GET /api/productos/:id — público
  @Get(':id')
  buscarPorId(@Param('id', ParseIntPipe) id: number) {
    return this.productosService.buscarPorIdPublico(id);
  }

  // POST /api/productos — solo ADMIN
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Post()
  crear(@Body() dto: CrearProductoDto) {
    return this.productosService.crear(dto);
  }

  // PATCH /api/productos/:id — solo ADMIN
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Patch(':id')
  actualizar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ActualizarProductoDto,
  ) {
    return this.productosService.actualizar(id, dto);
  }

  // DELETE /api/productos/:id — solo ADMIN (desactiva, no borra)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Delete(':id')
  desactivar(@Param('id', ParseIntPipe) id: number) {
    return this.productosService.desactivar(id);
  }

  // POST /api/productos/:id/imagenes — subir imágenes (máx 5)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Post(':id/imagenes')
  @UseInterceptors(
    FilesInterceptor('imagenes', 5, {
      storage: memoryStorage(), // guardar en memoria para enviar a Cloudinary
      fileFilter: (_req, file, cb) => {
        const permitidos = [
          'image/jpeg',
          'image/png',
          'image/webp',
          'image/avif',
        ];
        aceptarTipoArchivo(
          file.mimetype,
          permitidos,
          'Solo se permiten imágenes JPG, PNG, WEBP o AVIF',
          cb,
        );
      },
      limits: { fileSize: 5 * 1024 * 1024 }, // máx 5MB por imagen
    }),
  )
  subirImagenes(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFiles() archivos: Express.Multer.File[],
  ) {
    return this.productosService.subirImagenes(id, archivos);
  }

  // DELETE /api/productos/:id/imagenes/:imagenId — eliminar imagen
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Delete(':id/imagenes/:imagenId')
  eliminarImagen(
    @Param('id', ParseIntPipe) id: number,
    @Param('imagenId', ParseIntPipe) imagenId: number,
  ) {
    return this.productosService.eliminarImagen(id, imagenId);
  }

  // PATCH /api/productos/:id/tallas/:tallaId — actualizar stock de una talla
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Patch(':id/tallas/:tallaId')
  actualizarStockTalla(
    @Param('id', ParseIntPipe) id: number,
    @Param('tallaId', ParseIntPipe) tallaId: number,
    @Body() dto: ActualizarStockTallaDto,
  ) {
    return this.productosService.actualizarStockTalla(id, tallaId, dto.stock);
  }
}
