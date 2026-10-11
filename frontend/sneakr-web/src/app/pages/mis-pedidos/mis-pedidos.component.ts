import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PedidosService, Pedido, EstadoPedido } from '../../core/services/pedidos.service';
import { PagosService } from '../../core/services/pagos.service';
import { MonedaPipe } from '../../shared/pipes/moneda.pipe';

@Component({
  selector: 'app-mis-pedidos',
  standalone: true,
  imports: [RouterLink, MonedaPipe],
  templateUrl: './mis-pedidos.component.html',
  styleUrl: './mis-pedidos.component.css',
})
export class MisPedidosComponent implements OnInit {
  private pedidosService = inject(PedidosService);
  private pagosService   = inject(PagosService);

  readonly pedidos      = signal<Pedido[]>([]);
  readonly cargando     = signal(true);
  readonly pedidoAbierto = signal<number | null>(null);
  readonly errorCancelacion = signal('');
  readonly pagandoId    = signal<number | null>(null);

  // Mapa de labels y colores por estado
  readonly estadoConfig: Record<EstadoPedido, { label: string; color: string }> = {
    PENDIENTE:       { label: 'Pendiente de pago',  color: 'warning' },
    PAGO_VERIFICADO: { label: 'Pago verificado',    color: 'info'    },
    EN_PREPARACION:  { label: 'En preparación',     color: 'info'    },
    ENVIADO:         { label: 'Enviado',             color: 'success' },
    ENTREGADO:       { label: 'Entregado',           color: 'success' },
    CANCELADO:       { label: 'Cancelado',           color: 'error'   },
  };

  ngOnInit() {
    this.pedidosService.misPedidos().subscribe({
      next:  (p) => { this.pedidos.set(p); this.cargando.set(false); },
      error: ()  => this.cargando.set(false),
    });
  }

  togglePedido(id: number) {
    this.pedidoAbierto.update((actual) => (actual === id ? null : id));
  }

  formatearFecha(fecha: string): string {
    return new Intl.DateTimeFormat('es-PE', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(new Date(fecha));
  }

  // Devuelve true si el pedido puede pagarse en línea con Mercado Pago
  puedePagarConMercadoPago(pedido: Pedido): boolean {
    return pedido.metodoPago === 'MERCADOPAGO' && pedido.estado === 'PENDIENTE';
  }

  // Pagar con Mercado Pago
  pagarConMercadoPago(pedidoId: number) {
    this.pagandoId.set(pedidoId);
    this.pagosService.crearPreferencia(pedidoId).subscribe({
      next: (res) => {
        window.location.href = res.urlPago;
      },
      error: (err) => {
        this.pagandoId.set(null);
        alert(err?.error?.message ?? 'No se pudo iniciar el pago con Mercado Pago.');
      },
    });
  }

  // Devuelve true si el pedido requiere comprobante manual (pedidos legacy)
  puedeSubirComprobante(pedido: Pedido): boolean {
    return pedido.metodoPago !== 'MERCADOPAGO' && pedido.estado === 'PENDIENTE' && !pedido.comprobante;
  }

  // Devuelve true si el pedido puede ser cancelado
  puedeCancelar(pedido: Pedido): boolean {
    return pedido.estado === 'PENDIENTE';
  }

  cancelar(pedidoId: number) {
    if (!confirm('¿Estás seguro de cancelar este pedido?')) return;
    this.errorCancelacion.set('');
    this.pedidosService.cancelar(pedidoId).subscribe({
      next: (pedidoActualizado) => {
        this.pedidos.update((lista) =>
          lista.map((p) => (p.id === pedidoId ? pedidoActualizado : p))
        );
      },
      error: (err) => {
        const mensaje = err?.error?.message;
        this.errorCancelacion.set(
          typeof mensaje === 'string'
            ? mensaje
            : 'No se pudo cancelar el pedido. Inténtalo nuevamente.',
        );
      },
    });
  }
}
