import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CrearUsuarioDto } from './dto/crear-usuario.dto.js';
import * as bcrypt from 'bcrypt';
import { esConflictoUnico } from '../prisma/es-conflicto-unico.js';

@Injectable()
export class UsuariosService {
  constructor(private readonly prisma: PrismaService) {}

  async crear(dto: CrearUsuarioDto) {
    // Verificar que el email no esté en uso
    const existe = await this.prisma.usuario.findUnique({
      where: { email: dto.email },
    });

    if (existe) {
      throw new ConflictException('El email ya está registrado');
    }

    // Hashear la contraseña antes de guardar
    const hash = await bcrypt.hash(dto.password, 10);

    try {
      const usuario = await this.prisma.usuario.create({
        data: {
          nombre: dto.nombre,
          email: dto.email,
          password: hash,
        },
      });

      // Nunca devolver el password, ni hasheado
      const { password: _, ...resultado } = usuario;
      return resultado;
    } catch (error) {
      if (esConflictoUnico(error)) {
        throw new ConflictException('El email ya está registrado');
      }
      throw error;
    }
  }

  async buscarPorEmail(email: string) {
    return this.prisma.usuario.findUnique({
      where: { email },
    });
  }

  async buscarPorId(id: number) {
    const usuario = await this.prisma.usuario.findUnique({
      where: { id },
      select: {
        id: true,
        nombre: true,
        email: true,
        rol: true,
        creadoEn: true,
      },
    });

    if (!usuario) {
      throw new NotFoundException('Usuario no encontrado');
    }

    return usuario;
  }
}
