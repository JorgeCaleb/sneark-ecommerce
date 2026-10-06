import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PedidosService, Pedido, EstadoPedido } from '../../../core/services/pedidos.service';

@Component({
  selector: 'app-admin-pedidos',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './admin-pedidos.component.html',
  styleUrl: './admin-pedidos.component.css',
})
export class AdminPedidosComponent implements OnInit {
  private pedidosService = inject(PedidosService);

  readonly todosLosPedidos = signal<Pedido[]>([]);
  readonly cargando        = signal(true);
  readonly pedidoDetalle   = signal<Pedido | null>(null);
  readonly cambiandoEstado = signal(false);
  readonly nuevoEstado     = signal<EstadoPedido | ''>('');

  filtroEstado: EstadoPedido | '' = '';

  readonly estadoConfig: Record<EstadoPedido, { label: string; color: string }> = {
    PENDIENTE:       { label: 'Pendiente',       color: 'warning' },
    PAGO_VERIFICADO: { label: 'Pago verificado',  color: 'info'    },
    EN_PREPARACION:  { label: 'En preparación',   color: 'info'    },
    ENVIADO:         { label: 'Enviado',           color: 'success' },
    ENTREGADO:       { label: 'Entregado',         color: 'success' },
    CANCELADO:       { label: 'Cancelado',         color: 'error'   },
  };

  readonly estados: EstadoPedido[] = [
    'PENDIENTE', 'PAGO_VERIFICADO', 'EN_PREPARACION', 'ENVIADO', 'ENTREGADO', 'CANCELADO',
  ];

  // Pedidos filtrados localmente
  readonly pedidosFiltrados = computed(() => {
    const estado = this.filtroEstado;
    const lista  = this.todosLosPedidos();
    return estado ? lista.filter((p) => p.estado === estado) : lista;
  });

  ngOnInit() {
    this.cargar();
  }

  cargar() {
    this.cargando.set(true);
    this.pedidosService.buscarTodos().subscribe({
      next:  (p) => { this.todosLosPedidos.set(p); this.cargando.set(false); },
      error: ()  => this.cargando.set(false),
    });
  }

  filtrar() {
    // El filtrado es reactivo via computed, no hace falta fetch
  }

  abrirDetalle(pedido: Pedido) {
    this.pedidoDetalle.set(pedido);
    this.nuevoEstado.set(pedido.estado);
  }

  cerrarDetalle() {
    this.pedidoDetalle.set(null);
    this.nuevoEstado.set('');
  }

  cambiarEstado() {
    const pedido = this.pedidoDetalle();
    const estado = this.nuevoEstado() as EstadoPedido;
    if (!pedido || !estado || estado === pedido.estado) return;

    this.cambiandoEstado.set(true);
    this.pedidosService.actualizarEstado(pedido.id, estado).subscribe({
      next: (p) => {
        this.cambiandoEstado.set(false);
        this.pedidoDetalle.set(p);
        // Actualizar en la lista local
        this.todosLosPedidos.update((lista) =>
          lista.map((item) => (item.id === p.id ? p : item))
        );
      },
      error: () => this.cambiandoEstado.set(false),
    });
  }

  formatearPrecio(precio: number): string {
    return new Intl.NumberFormat('es-PE', {
      style: 'currency',
      currency: 'PEN',
      minimumFractionDigits: 0,
    }).format(precio);
  }

  formatearFecha(fecha: string): string {
    return new Intl.DateTimeFormat('es-PE', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(fecha));
  }
}
