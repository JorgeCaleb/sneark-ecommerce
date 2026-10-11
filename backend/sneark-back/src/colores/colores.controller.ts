import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { Admin } from '../auth/decorators/admin.decorator.js';
import { ActualizarColorDto } from './dto/actualizar-color.dto.js';
import { CrearColorDto } from './dto/crear-color.dto.js';
import { ColoresService } from './colores.service.js';

@Controller('colores')
export class ColoresController {
  constructor(private readonly coloresService: ColoresService) {}

  @Get()
  buscarTodos() {
    return this.coloresService.buscarTodos();
  }

  @Admin()
  @Post()
  crear(@Body() dto: CrearColorDto) {
    return this.coloresService.crear(dto);
  }

  @Admin()
  @Patch(':id')
  actualizar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ActualizarColorDto,
  ) {
    return this.coloresService.actualizar(id, dto);
  }

  @Admin()
  @Delete(':id')
  eliminar(@Param('id', ParseIntPipe) id: number) {
    return this.coloresService.eliminar(id);
  }
}
