import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { CarritoService, ItemCarrito } from '../../core/services/carrito.service';
import { CarritoComponent } from './carrito.component';

describe('CarritoComponent', () => {
  let carritoService: {
    carrito: ReturnType<typeof signal>;
    total: ReturnType<typeof computed>;
    obtener: ReturnType<typeof vi.fn>;
    actualizarCantidad: ReturnType<typeof vi.fn>;
    eliminarItem: ReturnType<typeof vi.fn>;
    vaciar: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    carritoService = {
      carrito: signal(null),
      total: computed(() => 0),
      obtener: vi.fn().mockReturnValue(of({ id: 1, items: [], total: 0, cantidadItems: 0 })),
      actualizarCantidad: vi.fn().mockReturnValue(of({})),
      eliminarItem: vi.fn().mockReturnValue(of({})),
      vaciar: vi.fn().mockReturnValue(of({})),
    };
  });

  it('prevents quantity changes but still allows removing an inactive product', () => {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: CarritoService,
          useValue: carritoService,
        },
      ],
    });
    const component = TestBed.runInInjectionContext(
      () => new CarritoComponent(),
    );
    const item = {
      id: 9,
      cantidad: 1,
      tallaProducto: {
        stock: 5,
        producto: { activo: false },
      },
    } as ItemCarrito;

    component.incrementar(item);
    component.decrementar(item);
    component.eliminar(item);

    expect(carritoService.actualizarCantidad).not.toHaveBeenCalled();
    expect(carritoService.eliminarItem).toHaveBeenCalledWith(9);
  });

  it('muestra error de carga y no mensaje de carrito vacío cuando obtener() falla', () => {
    carritoService.obtener.mockReturnValue(
      throwError(() => ({
        error: { message: 'Error interno del servidor al consultar el carrito' },
      })),
    );

    TestBed.configureTestingModule({
      imports: [CarritoComponent],
      providers: [
        provideRouter([]),
        { provide: CarritoService, useValue: carritoService },
      ],
    });
    const fixture = TestBed.createComponent(CarritoComponent);
    fixture.detectChanges();

    expect(fixture.componentInstance.errorCarga()).toContain(
      'Error interno del servidor al consultar el carrito',
    );
    expect(fixture.nativeElement.textContent).toContain('No pudimos cargar tu carrito');
    expect(fixture.nativeElement.textContent).not.toContain('Tu carrito está vacío');
  });

  it('muestra mensaje de error cuando incrementar falla', () => {
    carritoService.actualizarCantidad.mockReturnValue(
      throwError(() => ({
        error: { message: ['Stock insuficiente para la variante solicitada'] },
      })),
    );

    TestBed.configureTestingModule({
      imports: [CarritoComponent],
      providers: [
        provideRouter([]),
        { provide: CarritoService, useValue: carritoService },
      ],
    });
    const fixture = TestBed.createComponent(CarritoComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;

    const item = {
      id: 10,
      cantidad: 2,
      tallaProducto: { stock: 5, producto: { activo: true } },
    } as ItemCarrito;

    component.incrementar(item);

    expect(component.errorAccion()).toBe('Stock insuficiente para la variante solicitada');
    expect(component.actualizando().has(10)).toBe(false);
  });

  it('muestra mensaje de error cuando vaciar falla', () => {
    carritoService.vaciar.mockReturnValue(
      throwError(() => ({
        error: { message: 'No se pudo vaciar el carrito' },
      })),
    );

    TestBed.configureTestingModule({
      imports: [CarritoComponent],
      providers: [
        provideRouter([]),
        { provide: CarritoService, useValue: carritoService },
      ],
    });
    const fixture = TestBed.createComponent(CarritoComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;

    component.vaciar();

    expect(component.errorAccion()).toBe('No se pudo vaciar el carrito');
    expect(component.vaciando()).toBe(false);
  });
});

