import { Controller, Get, UseGuards, Request, Query } from '@nestjs/common';
import { UsuariosService } from './usuarios.service.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { FiltrarClientesDto } from './dto/filtrar-clientes.dto.js';

@Controller('usuarios')
export class UsuariosController {
  constructor(private readonly usuariosService: UsuariosService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Get('admin/clientes')
  buscarClientes(@Query() filtros: FiltrarClientesDto) {
    return this.usuariosService.buscarClientes(filtros);
  }

  // GET /api/usuarios/perfil — devuelve el perfil del usuario autenticado
  @UseGuards(JwtAuthGuard)
  @Get('perfil')
  getPerfil(@Request() req: any) {
    return this.usuariosService.buscarPorId(req.user.id);
  }
}
