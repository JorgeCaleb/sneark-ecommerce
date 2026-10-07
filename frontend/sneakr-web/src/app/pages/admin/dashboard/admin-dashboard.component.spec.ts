import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import {
  Pedido,
  PedidosService,
  ResumenPedidosDashboard,
} from '../../../core/services/pedidos.service';
import { Producto, ProductosService } from '../../../core/services/productos.service';
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
    metodoPago: 'YAPE',
    comprobante: null,
    numeroOperacion: null,
    telefono: '999999999',
    ciudad: 'Lima',
    direccion: 'Calle 1',
    creadoEn: fechaDiasAtras(id),
    usuario: { id: 2, nombre: 'Cliente', email: 'cliente@example.test' },
    items: [],
  };
}

function resumenDashboard(
  cambios: Partial<ResumenPedidosDashboard> = {},
): ResumenPedidosDashboard {
  return {
    totalPedidos: 12,
    pedidosRecientes: [pedido(1), pedido(2)],
    totalVentasPeriodo: 750,
    ventasPeriodoAnterior: 500,
    ventasDiarias: [
      { fecha: new Date().toISOString().slice(0, 10), total: 750 },
    ],
    productosMasVendidos: [
      {
        id: 8,
        nombre: 'Sneaker edición roja',
        marca: 'SNEARK',
        imagen: 'https://example.test/sneaker.png',
        precio: 250,
        cantidad: 5,
      },
    ],
    ...cambios,
  };
}

const producto: Producto = {
  id: 8,
  nombre: 'Sneaker edición roja',
  descripcion: null,
  precio: 250,
  activo: true,
  creadoEn: fechaDiasAtras(10),
  actualizadoEn: fechaDiasAtras(1),
  marca: { id: 1, nombre: 'SNEARK', logo: null },
  categoria: { id: 1, nombre: 'Running' },
  imagenes: [{ id: 1, url: 'https://example.test/sneaker.png', publicId: 'shoe' }],
  tallas: [
    { id: 1, talla: '39', stock: 0 },
    { id: 2, talla: '40', stock: 3 },
    { id: 3, talla: '41', stock: 8 },
  ],
};

describe('AdminDashboardComponent', () => {
  let pedidosService: { resumenDashboard: ReturnType<typeof vi.fn> };
  let productosService: { buscarPagina: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    pedidosService = {
      resumenDashboard: vi.fn().mockReturnValue(of(resumenDashboard())),
    };
    productosService = {
      buscarPagina: vi.fn().mockReturnValue(
        of({
          datos: [producto],
          meta: { total: 1, pagina: 1, limite: 100, totalPaginas: 1 },
        }),
      ),
    };

    await TestBed.configureTestingModule({
      imports: [AdminDashboardComponent],
      providers: [
        provideRouter([]),
        { provide: PedidosService, useValue: pedidosService },
        { provide: ProductosService, useValue: productosService },
      ],
    }).compileComponents();
  });

  it('uses server-side confirmed-sales aggregates and keeps all-order count separate', () => {
    const fixture = TestBed.createComponent(AdminDashboardComponent);
    fixture.detectChanges();
    const dashboard = fixture.componentInstance;

    expect(dashboard.totalVentasPeriodo()).toBe(750);
    expect(dashboard.variacionVentas()).toBe(50);
    expect(dashboard.pedidos().length).toBe(2);
    expect(dashboard.metricas()[1].valor).toBe('12');
    const [inicioAnterior, inicioActual, finActual] =
      pedidosService.resumenDashboard.mock.calls[0];
    expect(inicioActual.getTime() - inicioAnterior.getTime()).toBe(30 * 86_400_000);
    expect(finActual.getTime() - inicioActual.getTime()).toBe(30 * 86_400_000);
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

    expect(
      fixture.componentInstance.formatearFecha('not-a-valid-date'),
    ).toBe('Fecha no disponible');
  });

  it('uses pagination metadata and size-level inventory thresholds', () => {
    const fixture = TestBed.createComponent(AdminDashboardComponent);
    fixture.detectChanges();
    const dashboard = fixture.componentInstance;

    expect(productosService.buscarPagina).toHaveBeenCalledWith({
      pagina: 1,
      limite: 100,
    });
    expect(dashboard.totalProductos()).toBe(1);
    expect(dashboard.inventarioResumen()).toEqual({
      disponibles: 1,
      bajos: 1,
      agotados: 1,
    });
    expect(dashboard.variantesStockBajo().map((variante) => variante.talla)).toEqual([
      '40',
    ]);
  });

  it('loads all inventory pages while using the server total', () => {
    productosService.buscarPagina.mockImplementation(({ pagina }) =>
      of(
        pagina === 1
          ? {
              datos: [producto],
              meta: { total: 101, pagina: 1, limite: 100, totalPaginas: 2 },
            }
          : {
              datos: [{ ...producto, id: 9, nombre: 'Segundo producto' }],
              meta: { total: 101, pagina: 2, limite: 100, totalPaginas: 2 },
            },
      ),
    );

    const fixture = TestBed.createComponent(AdminDashboardComponent);
    fixture.detectChanges();

    expect(productosService.buscarPagina).toHaveBeenCalledTimes(2);
    expect(fixture.componentInstance.totalProductos()).toBe(101);
    expect(fixture.componentInstance.productos()).toHaveLength(2);
  });

  it('renders every low-stock variant across pages with missing-image fallbacks', () => {
    const products = Array.from({ length: 105 }, (_, index) => ({
      ...producto,
      id: index + 1,
      nombre:
        index === 0
          ? 'Producto con un nombre largo para revisar listas pobladas'
          : `Producto ${index + 1}`,
      imagenes: [],
      tallas: [{ id: index + 1, talla: '38', stock: 1 }],
    }));
    productosService.buscarPagina.mockImplementation(({ pagina }) =>
      of({
        datos: pagina === 1 ? products.slice(0, 100) : products.slice(100),
        meta: { total: 105, pagina, limite: 100, totalPaginas: 2 },
      }),
    );

    const fixture = TestBed.createComponent(AdminDashboardComponent);
    fixture.detectChanges();

    const list = fixture.nativeElement.querySelector(
      '[aria-label="Variantes con stock bajo"]',
    );
    expect(list.querySelectorAll('.low-stock-item')).toHaveLength(105);
    expect(list.querySelectorAll('svg[aria-hidden="true"]')).toHaveLength(105);
    expect(list.textContent).toContain(
      'Producto con un nombre largo para revisar listas pobladas',
    );
    expect(fixture.componentInstance.inventarioResumen().bajos).toBe(105);
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
    productosService.buscarPagina.mockReturnValue(
      of({
        datos: [],
        meta: { total: 0, pagina: 1, limite: 100, totalPaginas: 0 },
      }),
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
    productosService.buscarPagina.mockReturnValue(
      throwError(() => new Error('Products unavailable')),
    );

    const fixture = TestBed.createComponent(AdminDashboardComponent);
    fixture.detectChanges();
    const dashboard = fixture.componentInstance;

    expect(dashboard.errorPedidos()).toBe(true);
    expect(dashboard.errorProductos()).toBe(true);
    expect(dashboard.cargandoPedidos()).toBe(false);
    expect(dashboard.cargandoProductos()).toBe(false);

    pedidosService.resumenDashboard.mockReturnValue(of(resumenDashboard()));
    productosService.buscarPagina.mockReturnValue(
      of({
        datos: [producto],
        meta: { total: 1, pagina: 1, limite: 100, totalPaginas: 1 },
      }),
    );
    dashboard.cargar();
    fixture.detectChanges();

    expect(dashboard.errorPedidos()).toBe(false);
    expect(dashboard.errorProductos()).toBe(false);
    expect(dashboard.pedidos()).toHaveLength(2);
  });

  it('renders low stock variants without truncating the list', () => {
    const fixture = TestBed.createComponent(AdminDashboardComponent);
    fixture.detectChanges();
    const productos = Array.from({ length: 3 }, (_, productoIndex) => ({
      ...producto,
      id: productoIndex + 1,
      nombre: `Sneaker ${productoIndex + 1}`,
      tallas: Array.from({ length: 3 }, (_, tallaIndex) => ({
        id: productoIndex * 3 + tallaIndex + 1,
        talla: String(38 + tallaIndex),
        stock: tallaIndex + 1,
      })),
    }));

    fixture.componentInstance.productos.set(productos);

    expect(fixture.componentInstance.variantesStockBajo()).toHaveLength(9);
  });
});
