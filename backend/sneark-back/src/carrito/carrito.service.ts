import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { AgregarItemDto } from './dto/agregar-item.dto.js';
import { ActualizarItemDto } from './dto/actualizar-item.dto.js';
import { INCLUDE_PRODUCTO_RESUMEN } from '../prisma/selecciones.js';

// Campos que siempre se incluyen al devolver el carrito
const INCLUDE_CARRITO = {
  items: {
    include: {
      tallaProducto: {
        include: {
          producto: {
            include: {
              ...INCLUDE_PRODUCTO_RESUMEN,
            },
          },
        },
      },
    },
  },
} satisfies Prisma.CarritoInclude;

type CarritoIncluido = Prisma.CarritoGetPayload<{
  include: typeof INCLUDE_CARRITO;
}>;

@Injectable()
export class CarritoService {
  constructor(private readonly prisma: PrismaService) {}

  // Obtiene el carrito del usuario, lo crea si no existe
  async obtener(usuarioId: number) {
    let carrito = await this.prisma.carrito.findUnique({
      where: { usuarioId },
      include: INCLUDE_CARRITO,
    });

    if (!carrito) {
      carrito = await this.prisma.carrito.create({
        data: { usuarioId },
        include: INCLUDE_CARRITO,
      });
    }

    return this.calcularTotales(carrito);
  }

  async agregar(usuarioId: number, dto: AgregarItemDto) {
    try {
      await this.agregarTransaccional(usuarioId, dto);
    } catch (error) {
      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        error.code !== 'P2002'
      ) {
        throw error;
      }

      // Otra solicitud creó primero el mismo artículo; reintentar como incremento condicional.
      await this.agregarTransaccional(usuarioId, dto);
    }

    return this.obtener(usuarioId);
  }

  private async agregarTransaccional(usuarioId: number, dto: AgregarItemDto) {
    await this.prisma.$transaction(async (tx) => {
      const talla = await tx.tallaProducto.findUnique({
        where: { id: dto.tallaProductoId },
        include: { producto: true },
      });

      if (!talla) {
        throw new NotFoundException('Talla no encontrada');
      }

      if (!talla.producto.activo) {
        throw new BadRequestException('Este producto no está disponible');
      }

      if (talla.stock < dto.cantidad) {
        throw new BadRequestException(
          `Stock insuficiente. Solo hay ${talla.stock} unidades disponibles`,
        );
      }

      const carrito = await tx.carrito.upsert({
        where: { usuarioId },
        create: { usuarioId },
        update: {},
      });

      const actualizado = await tx.itemCarrito.updateMany({
        where: {
          carritoId: carrito.id,
          tallaProductoId: dto.tallaProductoId,
          cantidad: { lte: talla.stock - dto.cantidad },
        },
        data: { cantidad: { increment: dto.cantidad } },
      });

      if (actualizado.count === 1) {
        return;
      }

      const existente = await tx.itemCarrito.findUnique({
        where: {
          carritoId_tallaProductoId: {
            carritoId: carrito.id,
            tallaProductoId: dto.tallaProductoId,
          },
        },
      });

      if (existente) {
        throw new BadRequestException(
          `Stock insuficiente. Solo hay ${talla.stock} unidades disponibles`,
        );
      }

      await tx.itemCarrito.create({
        data: {
          carritoId: carrito.id,
          tallaProductoId: dto.tallaProductoId,
          cantidad: dto.cantidad,
        },
      });
    });
  }

  async actualizarItem(
    usuarioId: number,
    itemId: number,
    dto: ActualizarItemDto,
  ) {
    const item = await this.verificarItemDelUsuario(usuarioId, itemId);

    if (!item.tallaProducto.producto.activo) {
      throw new BadRequestException('Este producto no está disponible');
    }

    // Verificar stock disponible
    const talla = item.tallaProducto;

    if (!talla || talla.stock < dto.cantidad) {
      throw new BadRequestException(
        `Stock insuficiente. Solo hay ${talla?.stock ?? 0} unidades disponibles`,
      );
    }

    await this.prisma.itemCarrito.update({
      where: { id: itemId },
      data: { cantidad: dto.cantidad },
    });

    return this.obtener(usuarioId);
  }

  async eliminarItem(usuarioId: number, itemId: number) {
    await this.verificarItemDelUsuario(usuarioId, itemId);

    await this.prisma.itemCarrito.delete({ where: { id: itemId } });

    return this.obtener(usuarioId);
  }

  async vaciar(usuarioId: number) {
    const carrito = await this.prisma.carrito.findUnique({
      where: { usuarioId },
    });

    if (carrito) {
      await this.prisma.itemCarrito.deleteMany({
        where: { carritoId: carrito.id },
      });
    }

    return this.obtener(usuarioId);
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  // Verifica que el item pertenece al carrito del usuario
  private async verificarItemDelUsuario(usuarioId: number, itemId: number) {
    const carrito = await this.prisma.carrito.findUnique({
      where: { usuarioId },
    });

    if (!carrito) {
      throw new NotFoundException('Carrito no encontrado');
    }

    const item = await this.prisma.itemCarrito.findFirst({
      where: { id: itemId, carritoId: carrito.id },
      include: {
        tallaProducto: {
          include: { producto: true },
        },
      },
    });

    if (!item) {
      throw new NotFoundException('Item no encontrado en el carrito');
    }

    return item;
  }

  // Calcula subtotales y total del carrito
  private calcularTotales(carrito: CarritoIncluido) {
    const items = carrito.items.map((item) => {
      const precio = Number(item.tallaProducto.producto.precio);
      const subtotal = precio * item.cantidad;
      return { ...item, subtotal };
    });

    const total = items.reduce((acc, item) => acc + item.subtotal, 0);

    return {
      ...carrito,
      items,
      total: Number(total.toFixed(2)),
      cantidadItems: items.reduce((acc, item) => acc + item.cantidad, 0),
    };
  }
}
