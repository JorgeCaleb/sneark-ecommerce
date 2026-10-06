import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { CrearUsuarioDto } from '../usuarios/dto/crear-usuario.dto.js';
import { LoginDto } from './dto/login.dto.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // POST /api/auth/registro
  @Post('registro')
  registro(@Body() dto: CrearUsuarioDto) {
    return this.authService.registro(dto);
  }

  // POST /api/auth/login
  @Post('login')
  @HttpCode(HttpStatus.OK) // Por defecto POST devuelve 201, login debe devolver 200
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }
}
