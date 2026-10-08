import { DecimalPipe } from '@angular/common';
import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import {
  EstadoPedido,
  Pedido,
  PedidosService,
  ResumenPedidosDashboard,
} from '../../../core/services/pedidos.service';
import {
  InventarioActivo,
  ProductosService,
} from '../../../core/services/productos.service';

const DIAS_GRAFICO = 30;

interface MetricaDashboard {
  label: string;
  valor: string;
  detalle: string;
  tipo: 'ventas' | 'pedidos' | 'productos' | 'stock';
}

interface PuntoVenta {
  etiqueta: string;
  total: number;
}

interface VarianteInventario {
  id: number;
  productoId: number;
  producto: string;
  marca: string;
  imagen: string | null;
  talla: string;
  genero: 'M' | 'W' | 'X';
  color: string;
  sku: string;
  stock: number;
}

interface InventarioResumen {
  stockTotal: number;
  variantesTotales: number;
  disponibles: number;
  bajos: number;
  agotados: number;
}

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [RouterLink, DecimalPipe],
  templateUrl: './admin-dashboard.component.html',
  styleUrl: './admin-dashboard.component.css',
})
export class AdminDashboardComponent implements OnInit, OnDestroy {
  private readonly pedidosService = inject(PedidosService);
  private readonly productosService = inject(ProductosService);

  readonly cargandoPedidos = signal(true);
  readonly cargandoProductos = signal(true);
  readonly errorPedidos = signal(false);
  readonly errorProductos = signal(false);
  readonly pedidos = signal<Pedido[]>([]);
  readonly resumenPedidos = signal<ResumenPedidosDashboard | null>(null);
  readonly productosMasVendidos = computed(
    () => this.resumenPedidos()?.productosMasVendidos ?? [],
  );
  readonly inventario = signal<InventarioActivo | null>(null);
  readonly totalProductos = computed(
    () => this.inventario()?.productosActivos ?? null,
  );
  private pedidosSubscription?: Subscription;
  private productosSubscription?: Subscription;
  readonly pedidosRecientes = computed(() => this.pedidos());

  readonly ventasPeriodo = computed(() => {
    return (this.resumenPedidos()?.ventasDiarias ?? []).filter(
      (venta) => venta.total > 0,
    );
  });

  readonly totalVentasPeriodo = computed(
    () => this.resumenPedidos()?.totalVentasPeriodo ?? 0,
  );

  readonly variacionVentas = computed(() => {
    const ventasAnteriores = this.resumenPedidos()?.ventasPeriodoAnterior ?? 0;
    if (ventasAnteriores <= 0) return null;
    return ((this.totalVentasPeriodo() - ventasAnteriores) / ventasAnteriores) * 100;
  });

  readonly puntosVenta = computed<PuntoVenta[]>(() => {
    const hoy = this.inicioPeriodoActual();
    const valores = new Map<string, number>();
    const fechas: Date[] = [];

    for (let indice = DIAS_GRAFICO - 1; indice >= 0; indice -= 1) {
      const fecha = new Date(hoy);
      fecha.setDate(hoy.getDate() - indice);
      fechas.push(fecha);
      valores.set(this.claveFecha(fecha), 0);
    }

    for (const venta of this.resumenPedidos()?.ventasDiarias ?? []) {
      valores.set(venta.fecha, venta.total);
    }

    return fechas.map((fecha) => ({
      etiqueta: new Intl.DateTimeFormat('es-PE', {
        day: '2-digit',
        month: 'short',
      }).format(fecha),
      total: valores.get(this.claveFecha(fecha)) ?? 0,
    }));
  });

  readonly maxVentaDiaria = computed(() =>
    Math.max(...this.puntosVenta().map((punto) => punto.total), 0),
  );

  readonly etiquetasEjeVenta = computed(() => {
    const maximo = this.maxVentaDiaria();
    return [maximo, maximo * (2 / 3), maximo / 3, 0].map((valor) =>
      this.formatearPrecioCompacto(valor),
    );
  });

  readonly lineaGrafico = computed(() => {
    const puntos = this.puntosVenta();
    const maximo = this.maxVentaDiaria() || 1;
    return puntos
      .map((punto, indice) => {
        const x = this.coordenadaX(indice, puntos.length);
        const y = this.coordenadaY(punto.total, maximo);
        return `${indice === 0 ? 'M' : 'L'} ${x} ${y}`;
      })
      .join(' ');
  });

  readonly areaGrafico = computed(() => {
    const puntos = this.puntosVenta();
    if (!puntos.length) return '';
    const linea = this.lineaGrafico();
    const xFinal = this.coordenadaX(puntos.length - 1, puntos.length);
    const xInicio = this.coordenadaX(0, puntos.length);
    return `${linea} L ${xFinal} 176 L ${xInicio} 176 Z`;
  });

  readonly etiquetasGrafico = computed(() => {
    const puntos = this.puntosVenta();
    return puntos.filter((_, indice) => indice % 5 === 0 || indice === 29);
  });

  readonly variantesStockBajo = computed<VarianteInventario[]>(
    () => this.inventario()?.variantesStockBajo ?? [],
  );

  readonly inventarioResumen = computed<InventarioResumen>(() => {
    const resumen = this.inventario();
    return {
      stockTotal: resumen?.stockTotal ?? 0,
      variantesTotales: resumen?.variantesTotales ?? 0,
      disponibles: resumen?.disponibles ?? 0,
      bajos: resumen?.bajas ?? 0,
      agotados: resumen?.agotadas ?? 0,
    };
  });

  readonly metricas = computed<MetricaDashboard[]>(() => [
    {
      label: 'Ventas',
      valor: this.cargandoPedidos() ? '—' : this.formatearPrecio(this.totalVentasPeriodo()),
      detalle:
        this.variacionVentas() === null
          ? 'Últimos 30 días'
          : `${this.formatearVariacion(this.variacionVentas()!)} vs. periodo anterior`,
      tipo: 'ventas',
    },
    {
      label: 'Pedidos',
      valor: this.cargandoPedidos()
        ? '—'
        : String(this.resumenPedidos()?.totalPedidos ?? 0),
      detalle: 'Todos los pedidos',
      tipo: 'pedidos',
    },
    {
      label: 'Productos',
      valor:
        this.totalProductos() === null
          ? '—'
          : new Intl.NumberFormat('es-PE').format(this.totalProductos()!),
      detalle: 'Productos activos',
      tipo: 'productos',
    },
    {
      label: 'Stock bajo',
      valor: this.cargandoProductos() ? '—' : String(this.inventarioResumen().bajos),
      detalle: 'Variantes con 1–5 unidades',
      tipo: 'stock',
    },
  ]);

  readonly estadoConfig: Record<EstadoPedido, { label: string; color: string }> = {
    PENDIENTE: { label: 'Pendiente', color: 'warning' },
    PAGO_VERIFICADO: { label: 'Pagado', color: 'info' },
    EN_PREPARACION: { label: 'En preparación', color: 'info' },
    ENVIADO: { label: 'Enviado', color: 'success' },
    ENTREGADO: { label: 'Entregado', color: 'success' },
    CANCELADO: { label: 'Cancelado', color: 'error' },
  };

  ngOnInit() {
    this.cargar();
  }

  cargar() {
    this.cargarPedidos();
    this.cargarProductos();
  }

  ngOnDestroy() {
    this.pedidosSubscription?.unsubscribe();
    this.productosSubscription?.unsubscribe();
  }

  cargarPedidos() {
    this.pedidosSubscription?.unsubscribe();
    this.cargandoPedidos.set(true);
    this.errorPedidos.set(false);
    const inicioActual = this.inicioPeriodoActual();
    const finActual = new Date(inicioActual);
    finActual.setDate(finActual.getDate() + DIAS_GRAFICO);
    const inicioAnterior = new Date(inicioActual);
    inicioAnterior.setDate(inicioAnterior.getDate() - DIAS_GRAFICO);
    this.pedidosSubscription = this.pedidosService
      .resumenDashboard(inicioAnterior, inicioActual, finActual)
      .subscribe({
      next: (resumen) => {
        this.resumenPedidos.set(resumen);
        this.pedidos.set(resumen.pedidosRecientes);
        this.cargandoPedidos.set(false);
      },
      error: () => {
        this.resumenPedidos.set(null);
        this.pedidos.set([]);
        this.errorPedidos.set(true);
        this.cargandoPedidos.set(false);
      },
    });
  }

  cargarProductos() {
    this.productosSubscription?.unsubscribe();
    this.cargandoProductos.set(true);
    this.errorProductos.set(false);
    this.productosSubscription = this.productosService.inventarioActivo().subscribe({
      next: (resumen) => {
        this.inventario.set(resumen);
        this.cargandoProductos.set(false);
      },
      error: () => {
        this.inventario.set(null);
        this.errorProductos.set(true);
        this.cargandoProductos.set(false);
      },
    });
  }

  etiquetaEstado(estado: EstadoPedido): string {
    return this.estadoConfig[estado].label;
  }

  coordenadaX(indice: number, cantidad: number): number {
    return 64 + (indice / Math.max(cantidad - 1, 1)) * 650;
  }

  coordenadaY(valor: number, maximo: number): number {
    return 176 - (valor / maximo) * 148;
  }

  formatearPrecio(precio: number | string): string {
    return new Intl.NumberFormat('es-PE', {
      style: 'currency',
      currency: 'PEN',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Number(precio));
  }

  formatearFecha(fecha: string): string {
    const fechaPedido = new Date(fecha);
    if (Number.isNaN(fechaPedido.getTime())) return 'Fecha no disponible';
    return new Intl.DateTimeFormat('es-PE', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(fechaPedido);
  }

  formatearVariacion(variacion: number): string {
    const signo = variacion > 0 ? '+' : '';
    return `${signo}${variacion.toFixed(1)}%`;
  }

  formatearPrecioCompacto(precio: number): string {
    return new Intl.NumberFormat('es-PE', {
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(precio);
  }

  private inicioPeriodoActual(): Date {
    const inicio = new Date();
    inicio.setHours(0, 0, 0, 0);
    inicio.setDate(inicio.getDate() - (DIAS_GRAFICO - 1));
    return inicio;
  }

  private claveFecha(fecha: Date): string {
    const mes = String(fecha.getMonth() + 1).padStart(2, '0');
    const dia = String(fecha.getDate()).padStart(2, '0');
    return `${fecha.getFullYear()}-${mes}-${dia}`;
  }
}
