import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { NEVER, of, Subject, throwError } from 'rxjs';
import { Carrito, CarritoService } from '../../core/services/carrito.service';
import { PedidosService } from '../../core/services/pedidos.service';
import { PagosService } from '../../core/services/pagos.service';
import { CheckoutComponent } from './checkout.component';

function carrito(items: Carrito['items']): Carrito {
  return {
    id: 1,
    items,
    total: 25,
    cantidadItems: items.reduce((total, item) => total + item.cantidad, 0),
  };
}

function itemCarrito() {
  return {
    id: 5,
    cantidad: 1,
    subtotal: 25,
    tallaProductoId: 10,
    tallaProducto: {
      genero: 'M' as const,
      colorId: 3,
      color: { id: 3, nombre: 'Negro', codigo: 'BK' },
      talla: '42',
      disponible: true,
      sku: 'SN-M-BK-42',
      producto: {
        id: 8,
        nombre: 'SOHO',
        precio: 25,
        activo: true,
        marca: { nombre: 'SOHO' },
        imagenes: [],
      },
    },
  };
}

describe('CheckoutComponent cart loading', () => {
  let component: CheckoutComponent;
  let carritoSignal: ReturnType<typeof signal<Carrito | null>>;
  let obtener: ReturnType<typeof vi.fn>;
  let limpiarLocal: ReturnType<typeof vi.fn>;
  let crearPedido: ReturnType<typeof vi.fn>;
  let crearPreferencia: ReturnType<typeof vi.fn>;
  let cotizarEnvio: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    carritoSignal = signal<Carrito | null>(null);
    obtener = vi.fn();
    limpiarLocal = vi.fn(() => carritoSignal.set(null));
    crearPedido = vi.fn().mockReturnValue(of({ id: 45 }));
    crearPreferencia = vi.fn().mockReturnValue(NEVER);
    cotizarEnvio = vi.fn().mockImplementation((distrito: string) =>
      of({ distrito, costoEnvio: distrito === 'La Esperanza' ? 0 : 15 }),
    );
    TestBed.configureTestingModule({
      providers: [
        {
          provide: CarritoService,
          useValue: {
            carrito: carritoSignal,
            total: computed(() => carritoSignal()?.total ?? 0),
            obtener,
            limpiarLocal,
          },
        },
        {
          provide: PedidosService,
          useValue: {
            crear: crearPedido,
            opcionesEnvio: vi.fn().mockReturnValue(
              of([
                { distrito: 'La Esperanza', costoEnvio: 0 },
                { distrito: 'Trujillo', costoEnvio: 15 },
              ]),
            ),
            cotizarEnvio,
          },
        },
        {
          provide: PagosService,
          useValue: { crearPreferencia },
        },
      ],
    });
    component = TestBed.runInInjectionContext(() => new CheckoutComponent());
  });

  function elegirDistritoGratis() {
    component.distrito = 'La Esperanza';
    component.costoEnvio.set(0);
  }

  it('keeps confirmation disabled while the initial cart request is pending', () => {
    obtener.mockReturnValue(new Subject<Carrito>());
    component.telefono = '999999999';
    elegirDistritoGratis();
    component.direccion = 'Calle 1';

    component.ngOnInit();
    component.confirmar();

    expect(component.cargandoCarrito()).toBe(true);
    expect(component.confirmacionDeshabilitada()).toBe(true);
    expect(crearPedido).not.toHaveBeenCalled();
  });

  it('shows a load error and retries without losing entered form data', () => {
    const primeraCarga = new Subject<Carrito>();
    const reintento = new Subject<Carrito>();
    obtener.mockReturnValueOnce(primeraCarga).mockReturnValueOnce(reintento);
    component.telefono = '999999999';
    elegirDistritoGratis();
    component.direccion = 'Calle 1';

    component.ngOnInit();
    primeraCarga.error({ error: { message: 'API no disponible' } });

    expect(component.errorCargaCarrito()).toBe('API no disponible');
    expect(component.confirmacionDeshabilitada()).toBe(true);

    component.reintentarCarga();

    expect(component.cargandoCarrito()).toBe(true);
    expect(component.telefono).toBe('999999999');
    expect(component.distrito).toBe('La Esperanza');
    expect(component.direccion).toBe('Calle 1');

    const carritoDisponible = carrito([itemCarrito()]);
    carritoSignal.set(carritoDisponible);
    reintento.next(carritoDisponible);
    reintento.complete();

    expect(component.carritoCargado()).toBe(true);
    expect(component.errorCargaCarrito()).toBe('');
    expect(component.confirmacionDeshabilitada()).toBe(false);
  });

  it('keeps confirmation disabled when the successfully loaded cart is empty', () => {
    obtener.mockReturnValue(of(carrito([])));
    component.telefono = '999999999';
    elegirDistritoGratis();
    component.direccion = 'Calle 1';

    component.ngOnInit();
    component.confirmar();

    expect(component.carritoCargado()).toBe(true);
    expect(component.confirmacionDeshabilitada()).toBe(true);
    expect(crearPedido).not.toHaveBeenCalled();
  });

  it('clears the shared cart after a successful order', () => {
    const carritoDisponible = carrito([itemCarrito()]);
    obtener.mockReturnValue(of(carritoDisponible));
    carritoSignal.set(carritoDisponible);
    component.telefono = '999999999';
    elegirDistritoGratis();
    component.direccion = 'Calle 1';

    component.ngOnInit();
    component.confirmar();

    expect(limpiarLocal).toHaveBeenCalledOnce();
    expect(carritoSignal()).toBeNull();
    expect(crearPreferencia).toHaveBeenCalledWith(45);
  });

  it('preserves a created pending order for payment retry if preference creation fails', () => {
    const carritoDisponible = carrito([itemCarrito()]);
    obtener.mockReturnValue(of(carritoDisponible));
    carritoSignal.set(carritoDisponible);
    crearPreferencia.mockReturnValue(
      throwError(() => ({ error: { message: 'Mercado Pago no disponible' } })),
    );
    component.telefono = '999999999';
    elegirDistritoGratis();
    component.direccion = 'Calle 1';

    component.ngOnInit();
    component.confirmar();

    expect(limpiarLocal).toHaveBeenCalledOnce();
    expect(component.pedidoPendientePagoId()).toBe(45);
    expect(component.mostrarAccesoPedidos()).toBe(true);
    expect(component.error()).toBe('Mercado Pago no disponible');
    expect(crearPreferencia).toHaveBeenCalledWith(45);
  });
});
