import { Controller, Get, UseGuards, Query } from '@nestjs/common';
import { UsuariosService } from './usuarios.service.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { Admin } from '../auth/decorators/admin.decorator.js';
import { UsuarioActual } from '../auth/decorators/usuario-actual.decorator.js';
import { FiltrarClientesDto } from './dto/filtrar-clientes.dto.js';

@Controller('usuarios')
export class UsuariosController {
  constructor(private readonly usuariosService: UsuariosService) {}

  @Admin()
  @Get('admin/clientes')
  buscarClientes(@Query() filtros: FiltrarClientesDto) {
    return this.usuariosService.buscarClientes(filtros);
  }

  // GET /api/usuarios/perfil — devuelve el perfil del usuario autenticado
  @UseGuards(JwtAuthGuard)
  @Get('perfil')
  getPerfil(@UsuarioActual('id') usuarioId: number) {
    return this.usuariosService.buscarPorId(usuarioId);
  }
}
