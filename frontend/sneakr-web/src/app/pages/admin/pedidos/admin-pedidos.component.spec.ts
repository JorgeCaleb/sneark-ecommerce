import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { EstadoPedido, Pedido, PedidosService } from '../../../core/services/pedidos.service';
import { AdminPedidosComponent } from './admin-pedidos.component';

function crearPedido(estado: EstadoPedido, cambios: Partial<Pedido> = {}): Pedido {
  return {
    id: 7, estado, total: 125, costoEnvio: 0, metodoPago: 'MERCADOPAGO',
    telefono: '999999999', ciudad: 'Trujillo', direccion: 'Calle 1',
    creadoEn: '2026-10-10T12:00:00Z', items: [],
    usuario: { id: 3, nombre: 'Cliente', email: 'cliente@example.test' },
    mpRequiereRevision: true, mpEstadoPago: 'approved', mpMontoReembolsado: 0,
    ...cambios,
  };
}

describe('Gestion de incidencias de pago', () => {
  let component: AdminPedidosComponent;
  let actualizarEstado: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    actualizarEstado = vi.fn();
    TestBed.configureTestingModule({ providers: [{ provide: PedidosService, useValue: {
      actualizarEstado,
      buscarPagina: () => of({ datos: [], meta: { total: 0, pagina: 1, totalPaginas: 0 } }),
    } }] });
    component = TestBed.runInInjectionContext(() => new AdminPedidosComponent());
  });

  it('confirma una disputa resuelta manteniendo el estado entregado', () => {
    const pedido = crearPedido('ENTREGADO');
    component.abrirDetalle(pedido);
    actualizarEstado.mockReturnValue(of({ ...pedido, mpRequiereRevision: false }));
    expect(component.puedeResolverRevision(pedido)).toBe(true);
    component.cambiarEstado();
    expect(actualizarEstado).toHaveBeenCalledWith(7, 'ENTREGADO');
    expect(component.pedidoDetalle()?.mpRequiereRevision).toBe(false);
  });

  it.each([
    { mpEstadoPago: 'refunded', mpMontoReembolsado: 125 },
    { mpEstadoPago: 'charged_back' },
    { mpEstadoPago: 'in_mediation' },
    { mpMontoReembolsado: 25 },
  ])('impide confirmar una incidencia pendiente (%j)', (cambios) => {
    const pedido = crearPedido('ENTREGADO', cambios);
    component.abrirDetalle(pedido);
    expect(component.puedeResolverRevision(pedido)).toBe(false);
    expect(component.estadosParaPedido(pedido)).toEqual(['ENTREGADO']);
    component.cambiarEstado();
    expect(actualizarEstado).not.toHaveBeenCalled();
  });

  it('exige confirmar el pago de un pedido en revision mediante la transicion correspondiente', () => {
    const pedido = crearPedido('PAGO_REQUIERE_REVISION');
    expect(component.puedeResolverRevision(pedido)).toBe(false);
    expect(component.estadosParaPedido(pedido)).toContain('PAGO_VERIFICADO');
  });
});
