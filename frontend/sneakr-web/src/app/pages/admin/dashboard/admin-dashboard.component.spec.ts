import { TestBed } from '@angular/core/testing';
import { provideIcons } from '@ng-icons/core';
import {
  lucideArrowRight,
  lucideChartNoAxesCombined,
  lucideCircleAlert,
  lucideDollarSign,
  lucideFileText,
  lucideFootprints,
  lucidePlus,
  lucideShoppingBag,
} from '@ng-icons/lucide';
import { provideRouter } from '@angular/router';
import { Subject, of, throwError } from 'rxjs';
import {
  Pedido,
  PedidosService,
  ResumenPedidosDashboard,
} from '../../../core/services/pedidos.service';
import { InventarioActivo, ProductosService } from '../../../core/services/productos.service';
import { AdminDashboardComponent } from './admin-dashboard.component';

function fechaDiasAtras(dias: number): string {
  const fecha = new Date();
  fecha.setDate(fecha.getDate() - dias);
  return fecha.toISOString();
}

function pedido(id: number): Pedido {
  return {
    id,
    estado: 'PENDIENTE',
    total: 100,
    costoEnvio: 0,
    metodoPago: 'MERCADOPAGO',
    telefono: '999999999',
    ciudad: 'Lima',
    direccion: 'Calle 1',
    creadoEn: fechaDiasAtras(id),
    usuario: { id: 2, nombre: 'Cliente', email: 'cliente@example.test' },
    items: [],
  };
}

function resumenDashboard(cambios: Partial<ResumenPedidosDashboard> = {}): ResumenPedidosDashboard {
  return {
    totalPedidos: 12,
    pedidosRecientes: [pedido(1), pedido(2)],
    totalVentasPeriodo: 750,
    ventasPeriodoAnterior: 500,
    ventasDiarias: [{ fecha: '2026-10-26', total: 750 }],
    productosMasVendidos: [
      {
        id: 8,
        nombre: 'Sneaker edición roja',
        marca: 'SOHO',
        imagen: 'https://example.test/sneaker.png',
        precio: 250,
        cantidad: 5,
      },
    ],
    ...cambios,
  };
}

function inventarioActivo(cambios: Partial<InventarioActivo> = {}): InventarioActivo {
  return {
    productosActivos: 1,
    stockTotal: 11,
    variantesTotales: 3,
    disponibles: 1,
    bajas: 1,
    agotadas: 1,
    variantesStockBajo: [
      {
        id: 2,
        productoId: 8,
        producto: 'Sneaker edición roja',
        marca: 'SOHO',
        imagen: 'https://example.test/sneaker.png',
        genero: 'M',
        color: 'Negro',
        codigoColor: 'BK',
        talla: '40',
        sku: 'SN-EDR-M-BK-40',
        stock: 3,
      },
    ],
    ...cambios,
  };
}

describe('AdminDashboardComponent', () => {
  let pedidosService: { resumenDashboard: ReturnType<typeof vi.fn> };
  let productosService: { inventarioActivo: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 26, 12));
    pedidosService = {
      resumenDashboard: vi.fn().mockReturnValue(of(resumenDashboard())),
    };
    productosService = {
      inventarioActivo: vi.fn().mockReturnValue(of(inventarioActivo())),
    };

    await TestBed.configureTestingModule({
      imports: [AdminDashboardComponent],
      providers: [
        provideIcons({
          lucideArrowRight,
          lucideChartNoAxesCombined,
          lucideCircleAlert,
          lucideDollarSign,
          lucideFileText,
          lucideFootprints,
          lucidePlus,
          lucideShoppingBag,
        }),
        provideRouter([]),
        { provide: PedidosService, useValue: pedidosService },
        { provide: ProductosService, useValue: productosService },
      ],
    }).compileComponents();
  });

  afterEach(() => vi.useRealTimers());

  it('uses server-side confirmed-sales aggregates and keeps all-order count separate', () => {
    const fixture = TestBed.createComponent(AdminDashboardComponent);
    fixture.detectChanges();
    const dashboard = fixture.componentInstance;

    expect(dashboard.totalVentasPeriodo()).toBe(750);
    expect(dashboard.variacionVentas()).toBe(50);
    expect(dashboard.pedidos().length).toBe(2);
    expect(dashboard.metricas()[1].valor).toBe('12');
    const [inicioAnterior, inicioActual, finActual] = pedidosService.resumenDashboard.mock.calls[0];
    expect(inicioAnterior).toEqual(new Date(2026, 7, 28));
    expect(inicioActual).toEqual(new Date(2026, 8, 27));
    expect(finActual).toEqual(new Date(2026, 9, 27));
  });

  it('muestra la venta de hoy en el ultimo de los treinta dias del periodo consultado', () => {
    const fixture = TestBed.createComponent(AdminDashboardComponent);
    fixture.detectChanges();
    const dashboard = fixture.componentInstance;
    const puntos = dashboard.puntosVenta();
    expect(puntos).toHaveLength(30);
    expect(puntos[0].fecha).toBe('2026-09-27');
    expect(puntos.at(-1)?.fecha).toBe('2026-10-26');
    expect(puntos.at(-1)?.total).toBe(750);
    expect(puntos.slice(0, -1).every((punto) => punto.total === 0)).toBe(true);
    expect(puntos.reduce((total, punto) => total + punto.total, 0)).toBe(
      dashboard.totalVentasPeriodo(),
    );
    expect(fixture.nativeElement.querySelectorAll('.sales-chart__point')).toHaveLength(1);
  });

  it.each([
    [new Date(2026, 0, 5, 12), '2025-12-07', '2026-01-05'],
    [new Date(2026, 2, 1, 12), '2026-01-31', '2026-03-01'],
    [new Date(2024, 2, 1, 12), '2024-02-01', '2024-03-01'],
    [new Date(2026, 4, 1, 12), '2026-04-02', '2026-05-01'],
  ])('conserva treinta dias ordenados al cruzar meses o anos (%s)', (ahora, inicio, fin) => {
    vi.setSystemTime(ahora);
    pedidosService.resumenDashboard.mockReturnValue(
      of(
        resumenDashboard({
          ventasDiarias: [
            { fecha: inicio, total: 10 },
            { fecha: fin, total: 20 },
          ],
          totalVentasPeriodo: 30,
        }),
      ),
    );
    const fixture = TestBed.createComponent(AdminDashboardComponent);
    fixture.detectChanges();
    const puntos = fixture.componentInstance.puntosVenta();
    expect(puntos).toHaveLength(30);
    const fechas = puntos.map((punto) => punto.fecha);
    expect(new Set(fechas).size).toBe(30);
    expect(puntos[0]).toMatchObject({ fecha: inicio, total: 10 });
    expect(puntos.at(-1)).toMatchObject({ fecha: fin, total: 20 });
    expect(fechas).toEqual([...fechas].sort());
    expect(puntos.reduce((total, punto) => total + punto.total, 0)).toBe(30);
    if (fin === '2024-03-01') expect(puntos[28].fecha).toBe('2024-02-29');
  });

  it('usa el dia local de la consulta incluso cerca de medianoche', () => {
    vi.setSystemTime(new Date(2026, 9, 26, 23, 59, 59));
    const fixture = TestBed.createComponent(AdminDashboardComponent);
    fixture.detectChanges();
    const [, inicioActual, finActual] = pedidosService.resumenDashboard.mock.calls[0];
    expect(inicioActual).toEqual(new Date(2026, 8, 27));
    expect(finActual).toEqual(new Date(2026, 9, 27));
    expect(fixture.componentInstance.puntosVenta().at(-1)).toMatchObject({
      fecha: '2026-10-26',
      total: 750,
    });
  });

  it('conserva el periodo solicitado si la respuesta llega despues de medianoche', () => {
    const pendiente = new Subject<ResumenPedidosDashboard>();
    pedidosService.resumenDashboard.mockReturnValue(pendiente);
    vi.setSystemTime(new Date(2026, 9, 26, 23, 59, 59));
    const fixture = TestBed.createComponent(AdminDashboardComponent);
    fixture.detectChanges();
    vi.setSystemTime(new Date(2026, 9, 27, 0, 0, 1));
    pendiente.next(resumenDashboard());
    pendiente.complete();
    fixture.detectChanges();
    const puntos = fixture.componentInstance.puntosVenta();
    expect(puntos[0].fecha).toBe('2026-09-27');
    expect(puntos.at(-1)).toMatchObject({ fecha: '2026-10-26', total: 750 });
    expect(pedidosService.resumenDashboard).toHaveBeenCalledOnce();
  });

  it('actualiza el periodo al recargar otro dia y descarta la respuesta de la consulta anterior', () => {
    const anterior = new Subject<ResumenPedidosDashboard>();
    const nueva = new Subject<ResumenPedidosDashboard>();
    pedidosService.resumenDashboard.mockReturnValueOnce(anterior).mockReturnValueOnce(nueva);
    const fixture = TestBed.createComponent(AdminDashboardComponent);
    fixture.detectChanges();
    vi.setSystemTime(new Date(2026, 9, 27, 12));
    fixture.componentInstance.cargarPedidos();
    expect(anterior.observed).toBe(false);
    anterior.next(resumenDashboard());
    nueva.next(
      resumenDashboard({
        ventasDiarias: [{ fecha: '2026-10-27', total: 125 }],
        totalVentasPeriodo: 125,
      }),
    );
    nueva.complete();
    fixture.detectChanges();
    const [, inicioActual, finActual] = pedidosService.resumenDashboard.mock.calls[1];
    expect(inicioActual).toEqual(new Date(2026, 8, 28));
    expect(finActual).toEqual(new Date(2026, 9, 28));
    const dashboard = fixture.componentInstance;
    expect(dashboard.puntosVenta()[0].fecha).toBe('2026-09-28');
    expect(dashboard.puntosVenta().at(-1)).toMatchObject({ fecha: '2026-10-27', total: 125 });
    expect(dashboard.totalVentasPeriodo()).toBe(125);
  });

  it('incluye los extremos del periodo y deja en cero los dias vacios ignorando fechas externas', () => {
    pedidosService.resumenDashboard.mockReturnValue(
      of(
        resumenDashboard({
          ventasDiarias: [
            { fecha: '2026-09-26', total: 999 },
            { fecha: '2026-09-27', total: 125.5 },
            { fecha: '2026-10-26', total: 250.25 },
            { fecha: '2026-10-27', total: 999 },
          ],
          totalVentasPeriodo: 375.75,
        }),
      ),
    );
    const fixture = TestBed.createComponent(AdminDashboardComponent);
    fixture.detectChanges();
    const dashboard = fixture.componentInstance;
    const puntos = dashboard.puntosVenta();
    expect(puntos[0].total).toBe(125.5);
    expect(puntos.at(-1)?.total).toBe(250.25);
    expect(puntos.slice(1, -1).every((punto) => punto.total === 0)).toBe(true);
    expect(dashboard.ventasPeriodo()).toHaveLength(2);
    expect(puntos.reduce((total, punto) => total + punto.total, 0)).toBe(
      dashboard.totalVentasPeriodo(),
    );
    expect(fixture.nativeElement.querySelectorAll('.sales-chart__point')).toHaveLength(2);
  });

  it('muestra el estado sin ventas cuando solo recibe fechas fuera del periodo', () => {
    pedidosService.resumenDashboard.mockReturnValue(
      of(
        resumenDashboard({
          ventasDiarias: [{ fecha: '2026-09-26', total: 999 }],
          totalVentasPeriodo: 0,
        }),
      ),
    );
    const fixture = TestBed.createComponent(AdminDashboardComponent);
    fixture.detectChanges();
    expect(fixture.componentInstance.puntosVenta().every((punto) => punto.total === 0)).toBe(true);
    expect(fixture.componentInstance.ventasPeriodo()).toEqual([]);
    expect(fixture.nativeElement.textContent).toContain('Sin ventas en el periodo');
  });

  it('renders the server-ranked best sellers without loading the full order history', () => {
    const fixture = TestBed.createComponent(AdminDashboardComponent);
    fixture.detectChanges();

    expect(fixture.componentInstance.productosMasVendidos()).toEqual(
      resumenDashboard().productosMasVendidos,
    );
    expect(pedidosService.resumenDashboard).toHaveBeenCalledOnce();
    expect(pedidosService).not.toHaveProperty('buscarTodos');
  });

  it('renders a safe fallback for invalid order dates', () => {
    const fixture = TestBed.createComponent(AdminDashboardComponent);
    fixture.detectChanges();

    expect(fixture.componentInstance.formatearFecha('not-a-valid-date')).toBe(
      'Fecha no disponible',
    );
  });

  it('uses backend active-inventory aggregates and stock thresholds', () => {
    const fixture = TestBed.createComponent(AdminDashboardComponent);
    fixture.detectChanges();
    const dashboard = fixture.componentInstance;

    expect(productosService.inventarioActivo).toHaveBeenCalledOnce();
    expect(dashboard.totalProductos()).toBe(1);
    expect(dashboard.inventarioResumen()).toEqual({
      stockTotal: 11,
      variantesTotales: 3,
      disponibles: 1,
      bajos: 1,
      agotados: 1,
    });
    expect(dashboard.variantesStockBajo().map((variante) => variante.talla)).toEqual(['40']);
  });

  it('renders the backend-selected low-stock variants without loading products', () => {
    productosService.inventarioActivo.mockReturnValue(
      of(
        inventarioActivo({
          variantesStockBajo: Array.from({ length: 5 }, (_, index) => ({
            id: index + 1,
            productoId: index + 1,
            producto:
              index === 0
                ? 'Producto con un nombre largo para revisar listas pobladas'
                : `Producto ${index + 1}`,
            marca: 'SOHO',
            imagen: null,
            genero: 'M',
            color: 'Negro',
            codigoColor: 'BK',
            talla: '38',
            sku: `SN-${index + 1}-M-BK-38`,
            stock: 1,
          })),
          bajas: 5,
        }),
      ),
    );

    const fixture = TestBed.createComponent(AdminDashboardComponent);
    fixture.detectChanges();

    const list = fixture.nativeElement.querySelector('[aria-label="Variantes con stock bajo"]');
    expect(list.querySelectorAll('.low-stock-item')).toHaveLength(5);
    expect(list.querySelectorAll('ng-icon[aria-hidden="true"] svg')).toHaveLength(5);
    expect(list.textContent).toContain('Producto con un nombre largo para revisar listas pobladas');
    expect(fixture.componentInstance.inventarioResumen().bajos).toBe(5);
  });

  it('shows empty data separately from API errors', () => {
    pedidosService.resumenDashboard.mockReturnValue(
      of(
        resumenDashboard({
          totalPedidos: 0,
          pedidosRecientes: [],
          totalVentasPeriodo: 0,
          ventasPeriodoAnterior: 0,
          ventasDiarias: [],
          productosMasVendidos: [],
        }),
      ),
    );
    productosService.inventarioActivo.mockReturnValue(
      of(
        inventarioActivo({
          productosActivos: 0,
          stockTotal: 0,
          variantesTotales: 0,
          disponibles: 0,
          bajas: 0,
          agotadas: 0,
          variantesStockBajo: [],
        }),
      ),
    );

    const fixture = TestBed.createComponent(AdminDashboardComponent);
    fixture.detectChanges();
    const dashboard = fixture.componentInstance;

    expect(dashboard.errorPedidos()).toBe(false);
    expect(dashboard.errorProductos()).toBe(false);
    expect(dashboard.cargandoPedidos()).toBe(false);
    expect(dashboard.cargandoProductos()).toBe(false);
    expect(fixture.nativeElement.textContent).toContain('No hay pedidos todavía');
    expect(fixture.nativeElement.textContent).toContain('Sin ventas en el periodo');
    expect(fixture.nativeElement.textContent).toContain('Sin productos todavía');
  });

  it('sets error states on failed requests and clears them on retry', () => {
    pedidosService.resumenDashboard.mockReturnValue(
      throwError(() => new Error('Orders unavailable')),
    );
    productosService.inventarioActivo.mockReturnValue(
      throwError(() => new Error('Inventory unavailable')),
    );

    const fixture = TestBed.createComponent(AdminDashboardComponent);
    fixture.detectChanges();
    const dashboard = fixture.componentInstance;

    expect(dashboard.errorPedidos()).toBe(true);
    expect(dashboard.errorProductos()).toBe(true);
    expect(dashboard.cargandoPedidos()).toBe(false);
    expect(dashboard.cargandoProductos()).toBe(false);

    pedidosService.resumenDashboard.mockReturnValue(of(resumenDashboard()));
    productosService.inventarioActivo.mockReturnValue(of(inventarioActivo()));
    dashboard.cargar();
    fixture.detectChanges();

    expect(dashboard.errorPedidos()).toBe(false);
    expect(dashboard.errorProductos()).toBe(false);
    expect(dashboard.pedidos()).toHaveLength(2);
  });

  it('renders low stock variants from the active inventory summary', () => {
    const fixture = TestBed.createComponent(AdminDashboardComponent);
    fixture.detectChanges();
    expect(fixture.componentInstance.variantesStockBajo()).toHaveLength(1);
  });
});
