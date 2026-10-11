import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  ParseIntPipe,
} from '@nestjs/common';
import { CategoriasService } from './categorias.service.js';
import { CrearCategoriaDto } from './dto/crear-categoria.dto.js';
import { ActualizarCategoriaDto } from './dto/actualizar-categoria.dto.js';
import { Admin } from '../auth/decorators/admin.decorator.js';

@Controller('categorias')
export class CategoriasController {
  constructor(private readonly categoriasService: CategoriasService) {}

  // GET /api/categorias — público
  @Get()
  buscarTodas() {
    return this.categoriasService.buscarTodas();
  }

  // GET /api/categorias/:id — público
  @Get(':id')
  buscarPorId(@Param('id', ParseIntPipe) id: number) {
    return this.categoriasService.buscarPorId(id);
  }

  // POST /api/categorias — solo ADMIN
  @Admin()
  @Post()
  crear(@Body() dto: CrearCategoriaDto) {
    return this.categoriasService.crear(dto);
  }

  // PATCH /api/categorias/:id — solo ADMIN
  @Admin()
  @Patch(':id')
  actualizar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ActualizarCategoriaDto,
  ) {
    return this.categoriasService.actualizar(id, dto);
  }

  // DELETE /api/categorias/:id — solo ADMIN
  @Admin()
  @Delete(':id')
  eliminar(@Param('id', ParseIntPipe) id: number) {
    return this.categoriasService.eliminar(id);
  }
}
