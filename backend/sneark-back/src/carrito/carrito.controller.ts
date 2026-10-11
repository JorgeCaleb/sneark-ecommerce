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
import { CarritoService } from './carrito.service.js';
import { AgregarItemDto } from './dto/agregar-item.dto.js';
import { ActualizarItemDto } from './dto/actualizar-item.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { UsuarioActual } from '../auth/decorators/usuario-actual.decorator.js';

// Todas las rutas del carrito requieren autenticación
@UseGuards(JwtAuthGuard)
@Controller('carrito')
export class CarritoController {
  constructor(private readonly carritoService: CarritoService) {}

  // GET /api/carrito — ver mi carrito
  @Get()
  obtener(@UsuarioActual('id') usuarioId: number) {
    return this.carritoService.obtener(usuarioId);
  }

  // POST /api/carrito/items — agregar item al carrito
  @Post('items')
  agregar(
    @UsuarioActual('id') usuarioId: number,
    @Body() dto: AgregarItemDto,
  ) {
    return this.carritoService.agregar(usuarioId, dto);
  }

  // PATCH /api/carrito/items/:itemId — actualizar cantidad de un item
  @Patch('items/:itemId')
  actualizarItem(
    @UsuarioActual('id') usuarioId: number,
    @Param('itemId', ParseIntPipe) itemId: number,
    @Body() dto: ActualizarItemDto,
  ) {
    return this.carritoService.actualizarItem(usuarioId, itemId, dto);
  }

  // DELETE /api/carrito/items/:itemId — eliminar un item del carrito
  @Delete('items/:itemId')
  eliminarItem(
    @UsuarioActual('id') usuarioId: number,
    @Param('itemId', ParseIntPipe) itemId: number,
  ) {
    return this.carritoService.eliminarItem(usuarioId, itemId);
  }

  // DELETE /api/carrito — vaciar todo el carrito
  @Delete()
  vaciar(@UsuarioActual('id') usuarioId: number) {
    return this.carritoService.vaciar(usuarioId);
  }
}
