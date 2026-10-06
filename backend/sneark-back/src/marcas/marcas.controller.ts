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
} from '@nestjs/common';
import { MarcasService } from './marcas.service.js';
import { CrearMarcaDto } from './dto/crear-marca.dto.js';
import { ActualizarMarcaDto } from './dto/actualizar-marca.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';

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

  // DELETE /api/marcas/:id — solo ADMIN
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Delete(':id')
  eliminar(@Param('id', ParseIntPipe) id: number) {
    return this.marcasService.eliminar(id);
  }
}
