import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { Pedido, PedidosService } from '../../core/services/pedidos.service';
import { MisPedidosComponent } from './mis-pedidos.component';

describe('MisPedidosComponent cancellation', () => {
  let component: MisPedidosComponent;
  let cancelar: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    cancelar = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        { provide: PedidosService, useValue: { cancelar } },
      ],
    });
    component = TestBed.runInInjectionContext(
      () => new MisPedidosComponent(),
    );
    vi.stubGlobal('confirm', vi.fn().mockReturnValue(true));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows the API error and leaves the displayed order unchanged', () => {
    const pedido = { id: 14, estado: 'PENDIENTE' } as Pedido;
    component.pedidos.set([pedido]);
    cancelar.mockReturnValue(
      throwError(() => ({ error: { message: 'El pedido ya no se puede cancelar.' } })),
    );

    component.cancelar(pedido.id);

    expect(component.errorCancelacion()).toBe('El pedido ya no se puede cancelar.');
    expect(component.pedidos()).toEqual([pedido]);
  });

  it('updates the order and clears a previous error after successful cancellation', () => {
    const pedido = { id: 14, estado: 'PENDIENTE' } as Pedido;
    const pedidoCancelado = { ...pedido, estado: 'CANCELADO' } as Pedido;
    component.pedidos.set([pedido]);
    component.errorCancelacion.set('Error anterior');
    cancelar.mockReturnValue(of(pedidoCancelado));

    component.cancelar(pedido.id);

    expect(component.errorCancelacion()).toBe('');
    expect(component.pedidos()).toEqual([pedidoCancelado]);
  });
});
