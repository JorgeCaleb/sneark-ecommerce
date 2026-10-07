import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  ParseIntPipe,
  UseGuards,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { MarcasService } from './marcas.service.js';
import { CrearMarcaDto } from './dto/crear-marca.dto.js';
import { ActualizarMarcaDto } from './dto/actualizar-marca.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { aceptarTipoArchivo } from '../common/filtro-tipo-archivo.util.js';

@Controller('marcas')
export class MarcasController {
  constructor(private readonly marcasService: MarcasService) {}

  // GET /api/marcas — público, cualquiera puede ver las marcas
  @Get()
  buscarTodas() {
    return this.marcasService.buscarTodas();
  }

  // GET /api/marcas/:id — público
  @Get(':id')
  buscarPorId(@Param('id', ParseIntPipe) id: number) {
    return this.marcasService.buscarPorId(id);
  }

  // POST /api/marcas — solo ADMIN
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Post()
  crear(@Body() dto: CrearMarcaDto) {
    return this.marcasService.crear(dto);
  }

  // PATCH /api/marcas/:id — solo ADMIN
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Patch(':id')
  actualizar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ActualizarMarcaDto,
  ) {
    return this.marcasService.actualizar(id, dto);
  }

  // POST /api/marcas/:id/logo — subir un logo, incluido SVG
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Post(':id/logo')
  @UseInterceptors(
    FileInterceptor('logo', {
      storage: memoryStorage(),
      fileFilter: (_req, file, cb) => {
        const permitidos = [
          'image/svg+xml',
          'image/png',
          'image/jpeg',
          'image/webp',
        ];
        aceptarTipoArchivo(
          file.mimetype,
          permitidos,
          'El logo debe ser SVG, PNG, JPG o WEBP',
          cb,
        );
      },
      limits: { fileSize: 2 * 1024 * 1024 },
    }),
  )
  subirLogo(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() archivo: Express.Multer.File,
  ) {
    return this.marcasService.subirLogo(id, archivo);
  }

  // DELETE /api/marcas/:id — solo ADMIN
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Delete(':id')
  eliminar(@Param('id', ParseIntPipe) id: number) {
    return this.marcasService.eliminar(id);
  }
}
