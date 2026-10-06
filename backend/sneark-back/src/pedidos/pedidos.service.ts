import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CloudinaryService } from '../cloudinary/cloudinary.service.js';
import { CarritoService } from '../carrito/carrito.service.js';
import { CrearPedidoDto } from './dto/crear-pedido.dto.js';
import { ActualizarEstadoDto } from './dto/actualizar-estado.dto.js';
import { SubirComprobanteDto } from './dto/subir-comprobante.dto.js';

// Campos incluidos al devolver un pedido
const INCLUDE_PEDIDO = {
  items: {
    include: {
      tallaProducto: {
        include: {
          producto: {
            include: {
              imagenes: { take: 1, select: { url: true } },
              marca: { select: { nombre: true } },
            },
          },
        },
      },
    },
  },
  usuario: { select: { id: true, nombre: true, email: true } },
};

@Injectable()
export class PedidosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cloudinary: CloudinaryService,
    private readonly carritoService: CarritoService,
  ) {}

  // ─── Crear pedido desde el carrito ───────────────────────────────────────────
  async crear(usuarioId: number, dto: CrearPedidoDto) {
    // Obtener carrito con totales calculados
    const carrito = await this.carritoService.obtener(usuarioId);

    if (!carrito.items.length) {
      throw new BadRequestException('El carrito está vacío');
    }

    // Verificar stock de todos los items antes de proceder
    for (const item of carrito.items) {
      const talla = await this.prisma.tallaProducto.findUnique({
        where: { id: item.tallaProductoId },
      });

      if (!talla || talla.stock < item.cantidad) {
        throw new BadRequestException(
          `Stock insuficiente para "${item.tallaProducto.producto.nombre}" talla ${item.tallaProducto.talla}`,
        );
      }
    }

    // Crear el pedido y sus items en una transacción atómica
    const pedido = await this.prisma.$transaction(async (tx) => {
      // 1. Crear el pedido
      const nuevoPedido = await tx.pedido.create({
        data: {
          usuarioId,
          total: carrito.total,
          metodoPago: dto.metodoPago as any,
          telefono: dto.telefono,
          ciudad: dto.ciudad,
          direccion: dto.direccion,
          // Crear todos los items del pedido como snapshot
          items: {
            create: carrito.items.map((item: any) => ({
              tallaProductoId: item.tallaProductoId,
              nombreProducto: item.tallaProducto.producto.nombre,
              talla: item.tallaProducto.talla,
              cantidad: item.cantidad,
              precio: item.tallaProducto.producto.precio,
              subtotal: item.subtotal,
            })),
          },
        },
        include: INCLUDE_PEDIDO,
      });

      // 2. Descontar stock de cada talla
      for (const item of carrito.items) {
        await tx.tallaProducto.update({
          where: { id: item.tallaProductoId },
          data: { stock: { decrement: item.cantidad } },
        });
      }

      // 3. Vaciar el carrito
      await tx.itemCarrito.deleteMany({
        where: { carritoId: carrito.id },
      });

      return nuevoPedido;
    });

    return pedido;
  }

  // ─── Subir comprobante Yape/Plin ─────────────────────────────────────────────
  async subirComprobante(
    usuarioId: number,
    pedidoId: number,
    archivo: Express.Multer.File,
    dto: SubirComprobanteDto,
  ) {
    const pedido = await this.buscarPorId(pedidoId);

    // Solo el dueño del pedido puede subir el comprobante
    if (pedido.usuario.id !== usuarioId) {
      throw new ForbiddenException('No tenés acceso a este pedido');
    }

    if (pedido.estado !== 'PENDIENTE') {
      throw new BadRequestException(
        'Solo se puede subir comprobante en pedidos PENDIENTES',
      );
    }

    // Verificar que el número de operación no esté duplicado
    if (dto.numeroOperacion) {
      const duplicado = await this.prisma.pedido.findFirst({
        where: {
          numeroOperacion: dto.numeroOperacion,
          NOT: { id: pedidoId },
        },
      });

      if (duplicado) {
        throw new BadRequestException(
          'Este número de operación ya fue registrado en otro pedido',
        );
      }
    }

    // Subir imagen a Cloudinary
    const { url, publicId } = await this.cloudinary.subirImagen(
      archivo,
      `sneark/comprobantes/${pedidoId}`,
    );

    // Si había un comprobante anterior, eliminar de Cloudinary
    if (pedido.comprobante) {
      // El publicId anterior se puede inferir del URL de Cloudinary
      // pero es más seguro guardarlo — por ahora eliminamos por URL
    }

    // Actualizar el pedido con el comprobante
    return this.prisma.pedido.update({
      where: { id: pedidoId },
      data: {
        comprobante: url,
        numeroOperacion: dto.numeroOperacion,
      },
      include: INCLUDE_PEDIDO,
    });
  }

  // ─── Consultas ────────────────────────────────────────────────────────────────

  async buscarPorId(id: number) {
    const pedido = await this.prisma.pedido.findUnique({
      where: { id },
      include: INCLUDE_PEDIDO,
    });

    if (!pedido) {
      throw new NotFoundException(`Pedido #${id} no encontrado`);
    }

    return pedido;
  }

  // Mis pedidos (cliente)
  async misPedidos(usuarioId: number) {
    return this.prisma.pedido.findMany({
      where: { usuarioId },
      include: INCLUDE_PEDIDO,
      orderBy: { creadoEn: 'desc' },
    });
  }

  // Todos los pedidos (ADMIN)
  async buscarTodos(estado?: string) {
    return this.prisma.pedido.findMany({
      where: estado ? { estado: estado as any } : undefined,
      include: INCLUDE_PEDIDO,
      orderBy: { creadoEn: 'desc' },
    });
  }

  // ─── Gestión ADMIN ────────────────────────────────────────────────────────────

  async actualizarEstado(id: number, dto: ActualizarEstadoDto) {
    await this.buscarPorId(id);

    return this.prisma.pedido.update({
      where: { id },
      data: { estado: dto.estado as any },
      include: INCLUDE_PEDIDO,
    });
  }

  async cancelar(usuarioId: number, pedidoId: number) {
    const pedido = await this.buscarPorId(pedidoId);

    // Solo el dueño puede cancelar su pedido
    if (pedido.usuario.id !== usuarioId) {
      throw new ForbiddenException('No tenés acceso a este pedido');
    }

    // Solo se puede cancelar si está PENDIENTE o PAGO_VERIFICADO
    const cancelables = ['PENDIENTE', 'PAGO_VERIFICADO'];
    if (!cancelables.includes(pedido.estado)) {
      throw new BadRequestException(
        `No se puede cancelar un pedido en estado ${pedido.estado}`,
      );
    }

    // Devolver el stock al cancelar
    await this.prisma.$transaction(async (tx) => {
      for (const item of pedido.items) {
        await tx.tallaProducto.update({
          where: { id: item.tallaProductoId },
          data: { stock: { increment: item.cantidad } },
        });
      }

      await tx.pedido.update({
        where: { id: pedidoId },
        data: { estado: 'CANCELADO' },
      });
    });

    return this.buscarPorId(pedidoId);
  }
}
