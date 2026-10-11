import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MercadoPagoConfig, Preference, Payment } from 'mercadopago';
import { PrismaService } from '../prisma/prisma.service.js';
import { EstadoPedido } from '@prisma/client';

@Injectable()
export class PagosService {
  private readonly logger = new Logger(PagosService.name);
  private readonly mp: MercadoPagoConfig;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    this.mp = new MercadoPagoConfig({
      accessToken: this.config.getOrThrow<string>('MP_ACCESS_TOKEN'),
    });
  }

  // ─── Crear preferencia de pago ────────────────────────────────────────────────
  // Genera la URL del checkout de Mercado Pago para un pedido existente
  async crearPreferencia(pedidoId: number, usuarioId: number) {
    const pedido = await this.prisma.pedido.findFirst({
      where: { id: pedidoId, usuarioId },
      include: {
        items: true,
        usuario: { select: { email: true, nombre: true } },
      },
    });

    if (!pedido) {
      throw new NotFoundException(`Pedido #${pedidoId} no encontrado`);
    }

    if (pedido.metodoPago !== 'MERCADOPAGO') {
      throw new BadRequestException(
        'Este pedido no usa Mercado Pago como método de pago',
      );
    }

    if (pedido.estado !== EstadoPedido.PENDIENTE) {
      throw new BadRequestException(
        'Solo se puede iniciar el pago en pedidos PENDIENTES',
      );
    }

    const frontendUrl =
      this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:4200';

    const preference = new Preference(this.mp);

    const resultado = await preference.create({
      body: {
        // Referencia interna para identificar el pedido en el webhook
        external_reference: String(pedidoId),

        items: pedido.items.map((item) => ({
          id: String(item.tallaProductoId),
          title: item.nombreProducto,
          description: `Talla ${item.talla} · ${item.nombreColor}`,
          quantity: item.cantidad,
          unit_price: Number(item.precio),
          currency_id: 'PEN',
        })),

        payer: {
          email: pedido.usuario.email,
          name: pedido.usuario.nombre,
        },

        // URLs de retorno tras el pago
        back_urls: {
          success: `${frontendUrl}/pago/resultado?estado=exitoso&pedido=${pedidoId}`,
          failure: `${frontendUrl}/pago/resultado?estado=fallido&pedido=${pedidoId}`,
          pending: `${frontendUrl}/pago/resultado?estado=pendiente&pedido=${pedidoId}`,
        },

        // Redirige automáticamente sin que el usuario tenga que hacer clic
        auto_return: 'approved',

        // Notificación de pago (webhook)
        notification_url: `${this.config.get<string>('BACKEND_URL') ?? 'http://localhost:3000'}/api/pagos/webhook`,

        // Expiración: 30 minutos para pagar
        expires: true,
        expiration_date_from: new Date().toISOString(),
        expiration_date_to: new Date(
          Date.now() + 30 * 60 * 1000,
        ).toISOString(),
      },
    });

    // Guardar el ID de la preferencia en el pedido
    await this.prisma.pedido.update({
      where: { id: pedidoId },
      data: { mpPreferenciaId: resultado.id },
    });

    return {
      preferenciaId: resultado.id,
      // URL para redirigir al usuario (sandbox = sandbox_init_point)
      urlPago:
        resultado.sandbox_init_point ?? resultado.init_point ?? '',
    };
  }

  // ─── Webhook de Mercado Pago ──────────────────────────────────────────────────
  // MP notifica aquí cuando hay un cambio de estado en el pago
  async procesarWebhook(body: Record<string, unknown>) {
    // MP envía distintos tipos de notificación; solo procesamos "payment"
    if (body['type'] !== 'payment') {
      return { recibido: true };
    }

    const data = body['data'] as { id?: string | number } | undefined;
    const pagoId = String(data?.id ?? '');
    if (!pagoId) {
      return { recibido: true };
    }

    try {
      const payment = new Payment(this.mp);
      const pago = await payment.get({ id: pagoId });

      const pedidoId = Number(pago.external_reference);
      if (!pedidoId || isNaN(pedidoId)) {
        this.logger.warn(`Webhook MP sin external_reference válido: ${pagoId}`);
        return { recibido: true };
      }

      const pedido = await this.prisma.pedido.findUnique({
        where: { id: pedidoId },
      });

      if (!pedido) {
        this.logger.warn(`Webhook MP: pedido #${pedidoId} no encontrado`);
        return { recibido: true };
      }

      // Solo actualizamos si el pedido sigue PENDIENTE
      if (pedido.estado !== EstadoPedido.PENDIENTE) {
        return { recibido: true };
      }

      if (pago.status === 'approved') {
        await this.prisma.pedido.update({
          where: { id: pedidoId },
          data: {
            estado: EstadoPedido.PAGO_VERIFICADO,
            mpPagoId: pagoId,
          },
        });
        this.logger.log(`Pago MP aprobado → Pedido #${pedidoId} verificado`);
      } else if (pago.status === 'rejected' || pago.status === 'cancelled') {
        this.logger.log(
          `Pago MP ${pago.status} → Pedido #${pedidoId} sin cambios`,
        );
      }
    } catch (error) {
      this.logger.error(`Error procesando webhook MP pagoId=${pagoId}`, error);
    }

    return { recibido: true };
  }

  // ─── Consultar estado del pago ────────────────────────────────────────────────
  // El frontend lo llama al volver del checkout de MP para saber el resultado
  async consultarEstadoPedido(pedidoId: number, usuarioId: number) {
    const pedido = await this.prisma.pedido.findFirst({
      where: { id: pedidoId, usuarioId },
      select: {
        id: true,
        estado: true,
        total: true,
        metodoPago: true,
        mpPagoId: true,
        creadoEn: true,
      },
    });

    if (!pedido) {
      throw new NotFoundException(`Pedido #${pedidoId} no encontrado`);
    }

    return pedido;
  }
}
