import { TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { of, throwError } from 'rxjs';
import { PagosService } from '../../core/services/pagos.service';
import { PagoResultadoComponent } from './pago-resultado.component';
import type { EstadoPedido } from '../../core/services/pedidos.service';
import { AuthService } from '../../core/services/auth.service';

describe('PagoResultadoComponent', () => {
  function crearComponente(
    estadoUrl: string,
    estadoServidor: EstadoPedido,
    falloConsulta = false,
    mpRequiereRevision = false,
  ) {
    const consultarEstado = vi.fn().mockReturnValue(
      falloConsulta
        ? throwError(() => new Error('API no disponible'))
        : of({
            id: 12,
            mpRequiereRevision,
            estado: estadoServidor,
            total: 99,
            metodoPago: 'MERCADOPAGO',
            mpPagoId: null,
            creadoEn: new Date().toISOString(),
          }),
    );
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: {} },
        {
          provide: ActivatedRoute,
          useValue: {
            queryParams: of({ pedido: '12', estado: estadoUrl }),
          },
        },
        { provide: PagosService, useValue: { consultarEstado } },
      ],
    });
    const component = TestBed.runInInjectionContext(() => new PagoResultadoComponent());
    component.ngOnInit();
    return { component, consultarEstado };
  }

  it('does not show success based only on an approved query parameter', async () => {
    const { component, consultarEstado } = crearComponente('exitoso', 'PENDIENTE');

    await vi.waitFor(() => expect(consultarEstado).toHaveBeenCalledWith(12));
    expect(component.resultado()).toBe('pendiente');
    component.ngOnDestroy();
  });

  it('shows success only after the server reports a verified payment', async () => {
    const { component } = crearComponente('fallido', 'PAGO_VERIFICADO');

    await vi.waitFor(() => expect(component.resultado()).toBe('exitoso'));
    component.ngOnDestroy();
  });

  it('reports when the server status could not be checked', async () => {
    const { component } = crearComponente('exitoso', 'PENDIENTE', true);

    await vi.waitFor(() =>
      expect(component.errorConsulta()).toContain('No se pudo consultar el pedido'),
    );
    expect(component.resultado()).toBe('pendiente');
    component.ngOnDestroy();
  });

  it('muestra la incidencia financiera aunque el pedido ya este entregado', async () => {
    const { component } = crearComponente('exitoso', 'ENTREGADO', false, true);
    await vi.waitFor(() => expect(component.resultado()).toBe('revision'));
    component.ngOnDestroy();
  });
});
