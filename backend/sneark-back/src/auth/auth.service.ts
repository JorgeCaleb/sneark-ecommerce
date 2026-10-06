import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsuariosService } from '../usuarios/usuarios.service.js';
import { CrearUsuarioDto } from '../usuarios/dto/crear-usuario.dto.js';
import { LoginDto } from './dto/login.dto.js';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  constructor(
    private readonly usuariosService: UsuariosService,
    private readonly jwtService: JwtService,
  ) {}

  async registro(dto: CrearUsuarioDto) {
    const usuario = await this.usuariosService.crear(dto);
    const token = this.generarToken(usuario.id, usuario.email, usuario.rol);
    return { usuario, token };
  }

  async login(dto: LoginDto) {
    // Buscar usuario por email
    const usuario = await this.usuariosService.buscarPorEmail(dto.email);

    if (!usuario) {
      throw new UnauthorizedException('Credenciales incorrectas');
    }

    // Verificar contraseña
    const passwordValido = await bcrypt.compare(dto.password, usuario.password);

    if (!passwordValido) {
      throw new UnauthorizedException('Credenciales incorrectas');
    }

    // Nunca devolver el password
    const { password: _, ...datos } = usuario;
    const token = this.generarToken(usuario.id, usuario.email, usuario.rol);

    return { usuario: datos, token };
  }

  private generarToken(id: number, email: string, rol: string) {
    const payload = { sub: id, email, rol };
    return this.jwtService.sign(payload);
  }
}
