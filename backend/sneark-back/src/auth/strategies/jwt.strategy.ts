import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service.js';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      // El token se extrae del header Authorization: Bearer <token>
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
    });
  }

  // Consulta el usuario actual en la base de datos para verificar que exista
  // y que conserve su rol actualizado (no confía ciegamente en el token de 7 días).
  async validate(payload: { sub: number; email: string; rol: string }) {
    const usuario = await this.prisma.usuario.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        rol: true,
      },
    });

    if (!usuario) {
      throw new UnauthorizedException(
        'El usuario ya no existe o su sesión fue revocada.',
      );
    }

    return {
      id: usuario.id,
      email: usuario.email,
      rol: usuario.rol,
    };
  }
}
