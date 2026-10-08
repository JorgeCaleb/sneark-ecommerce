import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { CarritoService, ItemCarrito } from '../../core/services/carrito.service';
import { CarritoComponent } from './carrito.component';

describe('CarritoComponent unavailable products', () => {
  it('prevents quantity changes but still allows removing an inactive product', () => {
    const actualizarCantidad = vi.fn();
    const eliminarItem = vi.fn().mockReturnValue(of({}));
    const carritoSignal = signal(null);

    TestBed.configureTestingModule({
      providers: [
        {
          provide: CarritoService,
          useValue: {
            carrito: carritoSignal,
            total: computed(() => 0),
            actualizarCantidad,
            eliminarItem,
          },
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

    expect(actualizarCantidad).not.toHaveBeenCalled();
    expect(eliminarItem).toHaveBeenCalledWith(9);
  });
});
