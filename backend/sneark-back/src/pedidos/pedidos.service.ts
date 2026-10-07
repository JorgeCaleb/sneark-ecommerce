import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  BadGatewayException,
} from '@nestjs/common';
import { EstadoPedido, MetodoPago, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { CloudinaryService } from '../cloudinary/cloudinary.service.js';
import { CarritoService } from '../carrito/carrito.service.js';
import { CrearPedidoDto } from './dto/crear-pedido.dto.js';
import { ActualizarEstadoDto } from './dto/actualizar-estado.dto.js';
import { SubirComprobanteDto } from './dto/subir-comprobante.dto.js';
import { FiltrarPedidosDto } from './dto/filtrar-pedidos.dto.js';
import { DashboardPedidosDto } from './dto/dashboard-pedidos.dto.js';
import { INCLUDE_PRODUCTO_RESUMEN } from '../prisma/selecciones.js';

// Campos incluidos al devolver un pedido
const INCLUDE_PEDIDO = {
  items: {
    include: {
      tallaProducto: {
        include: {
          producto: {
            include: INCLUDE_PRODUCTO_RESUMEN,
          },
        },
      },
    },
  },
  usuario: { select: { id: true, nombre: true, email: true } },
} satisfies Prisma.PedidoInclude;

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

    // Crear el pedido y sus items en una transacción atómica
    const pedido = await this.prisma.$transaction(async (tx) => {
      const carritoConsumido = await tx.itemCarrito.deleteMany({
        where: { carritoId: carrito.id },
      });
      if (carritoConsumido.count !== carrito.items.length) {
        throw new BadRequestException(
          'El carrito cambió durante la compra. Revísalo e inténtalo nuevamente.',
        );
      }

      // Reservar cada talla de forma condicional para evitar sobreventa concurrente.
      for (const item of carrito.items) {
        const actualizacion = await tx.tallaProducto.updateMany({
          where: {
            id: item.tallaProductoId,
            stock: { gte: item.cantidad },
          },
          data: { stock: { decrement: item.cantidad } },
        });

        if (actualizacion.count !== 1) {
          throw new BadRequestException(
            `Stock insuficiente para "${item.tallaProducto.producto.nombre}" talla ${item.tallaProducto.talla}`,
          );
        }
      }

      // Crear el pedido solo después de reservar correctamente todas las tallas.
      const nuevoPedido = await tx.pedido.create({
        data: {
          usuarioId,
          total: carrito.total,
          metodoPago:
            dto.metodoPago === 'YAPE' ? MetodoPago.YAPE : MetodoPago.PLIN,
          telefono: dto.telefono,
          ciudad: dto.ciudad,
          direccion: dto.direccion,
          // Crear todos los items del pedido como snapshot
          items: {
            create: carrito.items.map((item) => ({
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
    const numeroOperacion = dto.numeroOperacion?.trim() || null;
    if (numeroOperacion) {
      const duplicado = await this.prisma.pedido.findFirst({
        where: {
          numeroOperacion,
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

    let pedidoActualizado;
    try {
      pedidoActualizado = await this.prisma.$transaction(async (tx) => {
        const resultado = await tx.pedido.updateMany({
          where: {
            id: pedidoId,
            estado: EstadoPedido.PENDIENTE,
            comprobantePublicId: pedido.comprobantePublicId,
          },
          data: {
            comprobante: url,
            comprobantePublicId: publicId,
            numeroOperacion,
          },
        });
        if (resultado.count !== 1) {
          throw new BadRequestException(
            'El pedido cambió mientras se subía el comprobante. Vuelve a intentarlo.',
          );
        }

        return tx.pedido.findUniqueOrThrow({
          where: { id: pedidoId },
          include: INCLUDE_PEDIDO,
        });
      });
    } catch (error) {
      try {
        await this.cloudinary.eliminarImagen(publicId);
      } catch (cleanupError) {
        const detalle =
          cleanupError instanceof Error
            ? cleanupError.message
            : 'Error desconocido';
        throw new BadGatewayException(
          `No se pudo guardar el comprobante y tampoco eliminar el archivo subido: ${detalle}`,
        );
      }

      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new BadRequestException(
          'Este número de operación ya fue registrado en otro pedido',
        );
      }
      throw error;
    }

    const publicIdAnterior =
      pedido.comprobantePublicId ??
      this.publicIdDesdeComprobanteCloudinary(pedido.comprobante, pedidoId);
    if (publicIdAnterior && publicIdAnterior !== publicId) {
      try {
        await this.cloudinary.eliminarImagen(publicIdAnterior);
      } catch (error) {
        const detalle =
          error instanceof Error ? error.message : 'Error desconocido';
        throw new BadGatewayException(
          `El comprobante nuevo se guardó, pero no se pudo eliminar el anterior: ${detalle}`,
        );
      }
    }

    return pedidoActualizado;
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

  async buscarPorUsuario(id: number, usuarioId: number) {
    const pedido = await this.prisma.pedido.findFirst({
      where: { id, usuarioId },
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

  async buscarPagina(filtros: FiltrarPedidosDto) {
    const { estado, pagina, limite } = filtros;
    const where: Prisma.PedidoWhereInput = estado ? { estado } : {};
    const [datos, total] = await Promise.all([
      this.prisma.pedido.findMany({
        where,
        include: INCLUDE_PEDIDO,
        orderBy: [{ creadoEn: 'desc' }, { id: 'desc' }],
        skip: (pagina - 1) * limite,
        take: limite,
      }),
      this.prisma.pedido.count({ where }),
    ]);

    return {
      datos,
      meta: {
        total,
        pagina,
        limite,
        totalPaginas: Math.ceil(total / limite),
      },
    };
  }

  async obtenerResumenDashboard(filtros: DashboardPedidosDto) {
    const inicioAnterior = new Date(filtros.inicioAnterior);
    const inicioActual = new Date(filtros.inicioActual);
    const finActual = new Date(filtros.finActual);
    const duracionActual = finActual.getTime() - inicioActual.getTime();
    const duracionAnterior = inicioActual.getTime() - inicioAnterior.getTime();
    if (
      !Number.isFinite(duracionActual) ||
      !Number.isFinite(duracionAnterior) ||
      inicioAnterior >= inicioActual ||
      inicioActual >= finActual ||
      duracionActual > 31 * 24 * 60 * 60_000 ||
      duracionAnterior > 31 * 24 * 60 * 60_000
    ) {
      throw new BadRequestException('El intervalo de fechas del dashboard no es válido');
    }

    const estadosConfirmados = [
      EstadoPedido.PAGO_VERIFICADO,
      EstadoPedido.EN_PREPARACION,
      EstadoPedido.ENVIADO,
      EstadoPedido.ENTREGADO,
    ];
    const whereVentasActuales: Prisma.PedidoWhereInput = {
      estado: { in: estadosConfirmados },
      creadoEn: { gte: inicioActual, lt: finActual },
    };
    const whereVentasAnteriores: Prisma.PedidoWhereInput = {
      estado: { in: estadosConfirmados },
      creadoEn: { gte: inicioAnterior, lt: inicioActual },
    };
    const [totalPedidos, pedidosRecientes, ventasActuales, ventasAnteriores, ventasDiarias, topProductos] =
      await Promise.all([
        this.prisma.pedido.count(),
        this.prisma.pedido.findMany({
          take: 5,
          include: INCLUDE_PEDIDO,
          orderBy: [{ creadoEn: 'desc' }, { id: 'desc' }],
        }),
        this.prisma.pedido.aggregate({
          where: whereVentasActuales,
          _sum: { total: true },
        }),
        this.prisma.pedido.aggregate({
          where: whereVentasAnteriores,
          _sum: { total: true },
        }),
        this.prisma.$queryRaw<{ fecha: string; total: Prisma.Decimal }[]>(
          Prisma.sql`
            SELECT DATE_FORMAT(
              DATE_ADD(\`creadoEn\`, INTERVAL ${filtros.desfaseZonaHoraria} MINUTE),
              '%Y-%m-%d'
            ) AS fecha, SUM(\`total\`) AS total
            FROM \`pedidos\`
            WHERE \`estado\` IN (
              'PAGO_VERIFICADO', 'EN_PREPARACION', 'ENVIADO', 'ENTREGADO'
            )
              AND \`creadoEn\` >= ${inicioActual}
              AND \`creadoEn\` < ${finActual}
            GROUP BY fecha
          `,
        ),
        this.prisma.$queryRaw<{ productoId: number; cantidad: bigint }[]>(
          Prisma.sql`
            SELECT tallas.\`productoId\` AS productoId,
                   SUM(items.\`cantidad\`) AS cantidad
            FROM \`items_pedido\` AS items
            INNER JOIN \`pedidos\` AS pedidos
              ON pedidos.\`id\` = items.\`pedidoId\`
            INNER JOIN \`tallas_producto\` AS tallas
              ON tallas.\`id\` = items.\`tallaProductoId\`
            WHERE pedidos.\`estado\` IN (
              'PAGO_VERIFICADO', 'EN_PREPARACION', 'ENVIADO', 'ENTREGADO'
            )
            GROUP BY tallas.\`productoId\`
            ORDER BY cantidad DESC, productoId ASC
            LIMIT 5
          `,
        ),
      ]);

    const productos = topProductos.length
      ? await this.prisma.producto.findMany({
          where: { id: { in: topProductos.map((producto) => producto.productoId) } },
          select: {
            id: true,
            nombre: true,
            precio: true,
            marca: { select: { nombre: true } },
            imagenes: { select: { url: true }, take: 1, orderBy: { id: 'asc' } },
          },
        })
      : [];
    const productosPorId = new Map(productos.map((producto) => [producto.id, producto]));

    return {
      totalPedidos,
      pedidosRecientes,
      totalVentasPeriodo: Number(ventasActuales._sum.total ?? 0),
      ventasPeriodoAnterior: Number(ventasAnteriores._sum.total ?? 0),
      ventasDiarias: ventasDiarias.map((venta) => ({
        fecha: venta.fecha,
        total: Number(venta.total),
      })),
      productosMasVendidos: topProductos.flatMap((vendido) => {
        const producto = productosPorId.get(vendido.productoId);
        return producto
          ? [
              {
                id: producto.id,
                nombre: producto.nombre,
                marca: producto.marca.nombre,
                imagen: producto.imagenes[0]?.url ?? null,
                precio: Number(producto.precio),
                cantidad: Number(vendido.cantidad),
              },
            ]
          : [];
      }),
    };
  }

  // ─── Gestión ADMIN ────────────────────────────────────────────────────────────

  async actualizarEstado(id: number, dto: ActualizarEstadoDto) {
    await this.buscarPorId(id);

    return this.prisma.pedido.update({
      where: { id },
      data: { estado: dto.estado },
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

  private publicIdDesdeComprobanteCloudinary(
    comprobante: string | null,
    pedidoId: number,
  ): string | null {
    if (!comprobante) return null;

    let pathname: string;
    try {
      const url = new URL(comprobante);
      if (url.hostname !== 'res.cloudinary.com') return null;
      pathname = url.pathname;
    } catch {
      return null;
    }

    const segmentos = pathname.split('/').filter(Boolean);
    const uploadIndex = segmentos.indexOf('upload');
    if (uploadIndex < 0) return null;

    const assetSegments = segmentos.slice(uploadIndex + 1);
    if (assetSegments[0]?.match(/^v\d+$/)) assetSegments.shift();

    const publicIdConExtension = assetSegments.join('/');
    const carpeta = `sneark/comprobantes/${pedidoId}/`;
    if (!publicIdConExtension.startsWith(carpeta)) return null;

    const extensionIndex = publicIdConExtension.lastIndexOf('.');
    if (extensionIndex <= carpeta.length) return null;
    return publicIdConExtension.slice(0, extensionIndex);
  }
}
