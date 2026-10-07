import { DecimalPipe } from '@angular/common';
import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { forkJoin, of, Subscription } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';
import {
  EstadoPedido,
  Pedido,
  PedidosService,
  ResumenPedidosDashboard,
} from '../../../core/services/pedidos.service';
import {
  Producto,
  ProductosPaginados,
  ProductosService,
} from '../../../core/services/productos.service';

const DIAS_GRAFICO = 30;
const LIMITE_PAGINA_PRODUCTOS = 100;

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
  productoId: number;
  producto: string;
  marca: string;
  imagen: string | null;
  talla: string;
  stock: number;
}

interface InventarioResumen {
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
  readonly productos = signal<Producto[]>([]);
  readonly totalProductos = signal<number | null>(null);
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

  readonly variantesInventario = computed<VarianteInventario[]>(() =>
    this.productos().flatMap((producto) =>
      producto.tallas.map((talla) => ({
        productoId: producto.id,
        producto: producto.nombre,
        marca: producto.marca.nombre,
        imagen: producto.imagenes[0]?.url ?? null,
        talla: talla.talla,
        stock: talla.stock,
      })),
    ),
  );

  readonly inventarioResumen = computed<InventarioResumen>(() => {
    const variantes = this.variantesInventario();
    return {
      disponibles: variantes.filter((variante) => variante.stock > 5).length,
      bajos: variantes.filter((variante) => variante.stock >= 1 && variante.stock <= 5).length,
      agotados: variantes.filter((variante) => variante.stock === 0).length,
    };
  });

  readonly variantesStockBajo = computed(() =>
    this.variantesInventario()
      .filter((variante) => variante.stock >= 1 && variante.stock <= 5)
      .sort((a, b) => a.stock - b.stock || a.producto.localeCompare(b.producto)),
  );

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
    this.productosService
      .buscarPagina({ pagina: 1, limite: LIMITE_PAGINA_PRODUCTOS })
      .pipe(
        switchMap((primeraPagina) => {
          const paginasRestantes = Array.from(
            { length: Math.max(0, primeraPagina.meta.totalPaginas - 1) },
            (_, indice) =>
              this.productosService.buscarPagina({
                pagina: indice + 2,
                limite: LIMITE_PAGINA_PRODUCTOS,
              }),
          );
          return paginasRestantes.length
            ? forkJoin(paginasRestantes).pipe(
                map((resto) => ({
                  primeraPagina,
                  resto,
                })),
              )
            : of({ primeraPagina, resto: [] as ProductosPaginados[] });
        }),
        map(({ primeraPagina, resto }) => ({
          total: primeraPagina.meta.total,
          productos: [...primeraPagina.datos, ...resto.flatMap((pagina) => pagina.datos)],
        })),
        catchError(() => {
          this.errorProductos.set(true);
          return of(null);
        }),
      )
      .subscribe((resultado) => {
        if (resultado) {
          this.totalProductos.set(resultado.total);
          this.productos.set(resultado.productos);
        }
        this.cargandoProductos.set(false);
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
