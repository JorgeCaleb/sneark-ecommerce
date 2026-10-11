import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service.js';
import { CrearUsuarioDto } from '../usuarios/dto/crear-usuario.dto.js';
import { LoginDto } from './dto/login.dto.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // POST /api/auth/registro
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('registro')
  registro(@Body() dto: CrearUsuarioDto) {
    return this.authService.registro(dto);
  }

  // POST /api/auth/login
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK) // Por defecto POST devuelve 201, login debe devolver 200
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }
}
