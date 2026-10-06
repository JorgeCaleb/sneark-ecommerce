import { Controller, Get, UseGuards, Request } from '@nestjs/common';
import { UsuariosService } from './usuarios.service.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';

@Controller('usuarios')
export class UsuariosController {
  constructor(private readonly usuariosService: UsuariosService) {}

  // GET /api/usuarios/perfil — devuelve el perfil del usuario autenticado
  @UseGuards(JwtAuthGuard)
  @Get('perfil')
  getPerfil(@Request() req: any) {
    return this.usuariosService.buscarPorId(req.user.id);
  }
}
