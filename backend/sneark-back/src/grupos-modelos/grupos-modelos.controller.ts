import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  ParseIntPipe,
  Post,
} from '@nestjs/common';
import { Admin } from '../auth/decorators/admin.decorator.js';
import { CrearGrupoModeloDto } from './dto/crear-grupo-modelo.dto.js';
import { GruposModelosService } from './grupos-modelos.service.js';

@Controller('grupos-modelos')
export class GruposModelosController {
  constructor(private readonly grupos: GruposModelosService) {}

  @Admin()
  @Get()
  buscarTodos() {
    return this.grupos.buscarTodos();
  }

  @Admin()
  @Post()
  crear(@Body() dto: CrearGrupoModeloDto) {
    return this.grupos.crear(dto);
  }

  @Admin()
  @Patch(':id')
  actualizar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CrearGrupoModeloDto,
  ) {
    return this.grupos.actualizar(id, dto);
  }

  @Get(':id/productos')
  buscarModelos(@Param('id', ParseIntPipe) id: number) {
    return this.grupos.buscarModelos(id);
  }
}
