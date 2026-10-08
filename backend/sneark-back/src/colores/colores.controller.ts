import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
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

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Post()
  crear(@Body() dto: CrearColorDto) {
    return this.coloresService.crear(dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Patch(':id')
  actualizar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ActualizarColorDto,
  ) {
    return this.coloresService.actualizar(id, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Delete(':id')
  eliminar(@Param('id', ParseIntPipe) id: number) {
    return this.coloresService.eliminar(id);
  }
}
