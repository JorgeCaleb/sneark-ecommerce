import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
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

function resumenDashboard(cambios: Partial<ResumenPedidosDashboard> = {}): ResumenPedidosDashboard {
  return {
    totalPedidos: 12,
    pedidosRecientes: [pedido(1), pedido(2)],
    totalVentasPeriodo: 750,
    ventasPeriodoAnterior: 500,
    ventasDiarias: [{ fecha: new Date().toISOString().slice(0, 10), total: 750 }],
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
        marca: 'SNEARK',
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
    pedidosService = {
      resumenDashboard: vi.fn().mockReturnValue(of(resumenDashboard())),
    };
    productosService = {
      inventarioActivo: vi.fn().mockReturnValue(of(inventarioActivo())),
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
    const [inicioAnterior, inicioActual, finActual] = pedidosService.resumenDashboard.mock.calls[0];
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
            marca: 'SNEARK',
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
    expect(list.querySelectorAll('svg[aria-hidden="true"]')).toHaveLength(5);
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
