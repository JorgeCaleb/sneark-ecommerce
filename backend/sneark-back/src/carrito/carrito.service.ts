import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { AgregarItemDto } from './dto/agregar-item.dto.js';
import { ActualizarItemDto } from './dto/actualizar-item.dto.js';

// Campos que siempre se incluyen al devolver el carrito
const INCLUDE_CARRITO = {
  items: {
    include: {
      tallaProducto: {
        include: {
          producto: {
            include: {
              imagenes: {
                take: 1, // Solo la primera imagen en el carrito
                select: { url: true },
              },
              marca: { select: { nombre: true } },
            },
          },
        },
      },
    },
  },
};

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
    // Verificar que la talla existe y tiene stock suficiente
    const talla = await this.prisma.tallaProducto.findUnique({
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

    // Obtener o crear el carrito
    const carrito = await this.prisma.carrito.upsert({
      where: { usuarioId },
      create: { usuarioId },
      update: {},
    });

    // Si el item ya existe en el carrito, incrementar cantidad
    const itemExistente = await this.prisma.itemCarrito.findUnique({
      where: {
        carritoId_tallaProductoId: {
          carritoId: carrito.id,
          tallaProductoId: dto.tallaProductoId,
        },
      },
    });

    if (itemExistente) {
      const nuevaCantidad = itemExistente.cantidad + dto.cantidad;

      if (talla.stock < nuevaCantidad) {
        throw new BadRequestException(
          `Stock insuficiente. Solo hay ${talla.stock} unidades disponibles`,
        );
      }

      await this.prisma.itemCarrito.update({
        where: { id: itemExistente.id },
        data: { cantidad: nuevaCantidad },
      });
    } else {
      await this.prisma.itemCarrito.create({
        data: {
          carritoId: carrito.id,
          tallaProductoId: dto.tallaProductoId,
          cantidad: dto.cantidad,
        },
      });
    }

    return this.obtener(usuarioId);
  }

  async actualizarItem(
    usuarioId: number,
    itemId: number,
    dto: ActualizarItemDto,
  ) {
    const item = await this.verificarItemDelUsuario(usuarioId, itemId);

    // Verificar stock disponible
    const talla = await this.prisma.tallaProducto.findUnique({
      where: { id: item.tallaProductoId },
    });

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
    });

    if (!item) {
      throw new NotFoundException('Item no encontrado en el carrito');
    }

    return item;
  }

  // Calcula subtotales y total del carrito
  private calcularTotales(carrito: any) {
    const items = carrito.items.map((item: any) => {
      const precio = Number(item.tallaProducto.producto.precio);
      const subtotal = precio * item.cantidad;
      return { ...item, subtotal };
    });

    const total = items.reduce(
      (acc: number, item: any) => acc + item.subtotal,
      0,
    );

    return {
      ...carrito,
      items,
      total: Number(total.toFixed(2)),
      cantidadItems: items.reduce(
        (acc: number, item: any) => acc + item.cantidad,
        0,
      ),
    };
  }
}
