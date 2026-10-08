import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { CarritoService } from '../../core/services/carrito.service';
import { Producto, ProductosService } from '../../core/services/productos.service';
import { ProductoDetalleComponent } from './producto-detalle.component';

describe('ProductoDetalleComponent route reuse', () => {
  it('reloads on id changes and ignores a late response for the previous id', () => {
    const firstResponse = new Subject<Producto>();
    const secondResponse = new Subject<Producto>();
    const buscarPorId = vi
      .fn()
      .mockReturnValueOnce(firstResponse)
      .mockReturnValueOnce(secondResponse);
    const router = { navigate: vi.fn() };

    TestBed.configureTestingModule({
      providers: [
        { provide: ProductosService, useValue: { buscarPorId } },
        { provide: CarritoService, useValue: { agregar: vi.fn() } },
        { provide: AuthService, useValue: { estaAutenticado: () => true } },
        { provide: Router, useValue: router },
      ],
    });
    const component = TestBed.runInInjectionContext(
      () => new ProductoDetalleComponent(),
    );

    component.id = '1';
    component.ngOnChanges();
    component.id = '2';
    component.ngOnChanges();

    secondResponse.next({ id: 2 } as Producto);
    secondResponse.complete();
    firstResponse.next({ id: 1 } as Producto);
    firstResponse.complete();

    expect(buscarPorId).toHaveBeenNthCalledWith(1, 1);
    expect(buscarPorId).toHaveBeenNthCalledWith(2, 2);
    expect(component.producto()?.id).toBe(2);
    expect(component.cargando()).toBe(false);
    expect(router.navigate).not.toHaveBeenCalled();
  });
});
