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
  Request,
} from '@nestjs/common';
import { CarritoService } from './carrito.service.js';
import { AgregarItemDto } from './dto/agregar-item.dto.js';
import { ActualizarItemDto } from './dto/actualizar-item.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';

// Todas las rutas del carrito requieren autenticación
@UseGuards(JwtAuthGuard)
@Controller('carrito')
export class CarritoController {
  constructor(private readonly carritoService: CarritoService) {}

  // GET /api/carrito — ver mi carrito
  @Get()
  obtener(@Request() req: any) {
    return this.carritoService.obtener(req.user.id);
  }

  // POST /api/carrito/items — agregar item al carrito
  @Post('items')
  agregar(@Request() req: any, @Body() dto: AgregarItemDto) {
    return this.carritoService.agregar(req.user.id, dto);
  }

  // PATCH /api/carrito/items/:itemId — actualizar cantidad de un item
  @Patch('items/:itemId')
  actualizarItem(
    @Request() req: any,
    @Param('itemId', ParseIntPipe) itemId: number,
    @Body() dto: ActualizarItemDto,
  ) {
    return this.carritoService.actualizarItem(req.user.id, itemId, dto);
  }

  // DELETE /api/carrito/items/:itemId — eliminar un item del carrito
  @Delete('items/:itemId')
  eliminarItem(
    @Request() req: any,
    @Param('itemId', ParseIntPipe) itemId: number,
  ) {
    return this.carritoService.eliminarItem(req.user.id, itemId);
  }

  // DELETE /api/carrito — vaciar todo el carrito
  @Delete()
  vaciar(@Request() req: any) {
    return this.carritoService.vaciar(req.user.id);
  }
}
