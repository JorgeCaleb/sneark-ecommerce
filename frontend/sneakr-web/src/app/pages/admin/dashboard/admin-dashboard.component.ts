import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PedidosService, Pedido, EstadoPedido } from '../../../core/services/pedidos.service';
import { ProductosService } from '../../../core/services/productos.service';

interface MetricaCard {
  label: string;
  valor: string | number;
  sub: string;
  icono: 'pedidos' | 'ingresos' | 'productos' | 'pendientes';
  color: string;
}

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './admin-dashboard.component.html',
  styleUrl: './admin-dashboard.component.css',
})
export class AdminDashboardComponent implements OnInit {
  private pedidosService  = inject(PedidosService);
  private productosService = inject(ProductosService);

  readonly cargando        = signal(true);
  readonly pedidosRecientes = signal<Pedido[]>([]);
  readonly metricas        = signal<MetricaCard[]>([]);

  readonly estadoConfig: Record<EstadoPedido, { label: string; color: string }> = {
    PENDIENTE:       { label: 'Pendiente',      color: 'warning' },
    PAGO_VERIFICADO: { label: 'Pago verificado', color: 'info'    },
    EN_PREPARACION:  { label: 'En preparación',  color: 'info'    },
    ENVIADO:         { label: 'Enviado',          color: 'success' },
    ENTREGADO:       { label: 'Entregado',        color: 'success' },
    CANCELADO:       { label: 'Cancelado',        color: 'error'   },
  };

  ngOnInit() {
    // Cargar pedidos y productos en paralelo
    Promise.all([
      this.pedidosService.buscarTodos().toPromise(),
      this.productosService.buscarTodos({ limite: 1 }).toPromise(),
    ]).then(([pedidos, productosRes]) => {
      const listaPedidos = pedidos ?? [];
      const totalProductos = productosRes?.meta?.total ?? 0;

      // Calcular métricas
      const pendientes   = listaPedidos.filter((p) => p.estado === 'PENDIENTE').length;
      const ingresos     = listaPedidos
        .filter((p) => p.estado !== 'CANCELADO')
        .reduce((sum, p) => sum + Number(p.total), 0);

      this.metricas.set([
        {
          label: 'Total pedidos',
          valor: listaPedidos.length,
          sub: 'Todos los pedidos',
          icono: 'pedidos',
          color: 'blue',
        },
        {
          label: 'Ingresos',
          valor: this.formatearPrecio(ingresos),
          sub: 'Pedidos no cancelados',
          icono: 'ingresos',
          color: 'green',
        },
        {
          label: 'Pendientes de pago',
          valor: pendientes,
          sub: 'Requieren atención',
          icono: 'pendientes',
          color: pendientes > 0 ? 'yellow' : 'green',
        },
        {
          label: 'Productos activos',
          valor: totalProductos,
          sub: 'En el catálogo',
          icono: 'productos',
          color: 'blue',
        },
      ]);

      // Últimos 8 pedidos
      this.pedidosRecientes.set(listaPedidos.slice(0, 8));
      this.cargando.set(false);
    }).catch(() => this.cargando.set(false));
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
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(fecha));
  }
}
