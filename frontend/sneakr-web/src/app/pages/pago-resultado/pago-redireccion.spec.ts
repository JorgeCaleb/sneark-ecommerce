import { TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { of, Subject } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { PagosService, PreferenciaPagoResponse } from '../../core/services/pagos.service';
import { PedidosService } from '../../core/services/pedidos.service';
import { MisPedidosComponent } from '../mis-pedidos/mis-pedidos.component';
import { PagoResultadoComponent } from './pago-resultado.component';

describe.each(['Mis pedidos', 'Resultado del pago'])('Redirección de pago: %s', (pantalla) => {
  let preferencia: Subject<PreferenciaPagoResponse>;
  let cambiosSesion: Subject<void>;
  let auth: { idSesion: number; sesionValida: ReturnType<typeof vi.fn>; cambiosSesion$: Subject<void> };
  let crearPreferencia: ReturnType<typeof vi.fn>;
  let iniciarPago: () => void;
  let destruir: () => void;
  let ocupado: () => boolean;
  let errorVisible: () => string;
  let location: { href: string };
  const respuesta = { preferenciaId: 'pref-12', urlPago: 'https://www.mercadopago.com.pe/checkout/test' };

  beforeEach(() => {
    preferencia = new Subject<PreferenciaPagoResponse>();
    cambiosSesion = new Subject<void>();
    auth = { idSesion: 1, sesionValida: vi.fn().mockReturnValue(true), cambiosSesion$: cambiosSesion };
    crearPreferencia = vi.fn().mockReturnValue(preferencia);
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: auth },
        { provide: PagosService, useValue: { crearPreferencia } },
        { provide: PedidosService, useValue: {} },
        { provide: ActivatedRoute, useValue: { queryParams: of({}) } },
      ],
    });

    if (pantalla === 'Mis pedidos') {
      TestBed.overrideComponent(MisPedidosComponent, { set: { template: '', imports: [] } });
      const fixture = TestBed.createComponent(MisPedidosComponent);
      const component = fixture.componentInstance;
      iniciarPago = () => component.pagarConMercadoPago(12);
      destruir = () => fixture.destroy();
      ocupado = () => component.pagandoId() !== null;
      errorVisible = () => '';
    } else {
      TestBed.overrideComponent(PagoResultadoComponent, { set: { template: '', imports: [] } });
      const fixture = TestBed.createComponent(PagoResultadoComponent);
      const component = fixture.componentInstance;
      component.pedidoId.set(12);
      component.detalle.set({
        id: 12, estado: 'PENDIENTE', total: 99, metodoPago: 'MERCADOPAGO',
        mpPagoId: null, creadoEn: new Date().toISOString(), pagadoEn: null,
        mpEstadoPago: null, mpMontoReembolsado: 0, mpRequiereRevision: false,
      });
      iniciarPago = () => component.reintentarPago();
      destruir = () => fixture.destroy();
      ocupado = () => component.reintentandoPago();
      errorVisible = () => component.errorConsulta();
    }
    location = { href: 'https://sneark.example/mis-pedidos' };
    vi.stubGlobal('window', { location });
    vi.stubGlobal('alert', vi.fn());
  });

  afterEach(() => {
    destruir();
    vi.unstubAllGlobals();
  });

  it('abre Mercado Pago cuando la pantalla y la sesión siguen vigentes', () => {
    iniciarPago();
    expect(crearPreferencia).toHaveBeenCalledWith(12);
    expect(ocupado()).toBe(true);
    preferencia.next(respuesta);
    preferencia.complete();
    expect(location.href).toBe(respuesta.urlPago);
    expect(ocupado()).toBe(false);
  });

  it('cancela la solicitud al abandonar la pantalla y descarta la respuesta tardía', () => {
    iniciarPago();
    expect(preferencia.observed).toBe(true);
    destruir();
    expect(preferencia.observed).toBe(false);
    preferencia.next(respuesta);
    expect(location.href).not.toBe(respuesta.urlPago);
    expect(ocupado()).toBe(false);
  });

  it.each(['cerrar sesión', 'iniciar otra cuenta'])('cancela la solicitud al %s', (cambio) => {
    iniciarPago();
    auth.idSesion++;
    auth.sesionValida.mockReturnValue(cambio !== 'cerrar sesión');
    cambiosSesion.next();
    expect(preferencia.observed).toBe(false);
    preferencia.next(respuesta);
    expect(location.href).not.toBe(respuesta.urlPago);
    expect(ocupado()).toBe(false);
  });

  it('descarta una respuesta de otra sesión aunque no llegue el aviso de cambio', () => {
    iniciarPago();
    auth.idSesion++;
    preferencia.next(respuesta);
    preferencia.complete();
    expect(location.href).not.toBe(respuesta.urlPago);
    expect(ocupado()).toBe(false);
  });

  it('no redirige si la sesión vence mientras se espera el enlace', () => {
    iniciarPago();
    auth.sesionValida.mockReturnValue(false);
    preferencia.next(respuesta);
    preferencia.complete();
    expect(location.href).not.toBe(respuesta.urlPago);
  });

  it('no solicita el enlace si la sesión ya no es válida', () => {
    auth.sesionValida.mockReturnValue(false);
    iniciarPago();
    expect(crearPreferencia).not.toHaveBeenCalled();
    expect(ocupado()).toBe(false);
  });

  it('evita solicitudes duplicadas mientras espera el enlace', () => {
    iniciarPago();
    iniciarPago();
    expect(crearPreferencia).toHaveBeenCalledOnce();
  });

  it('muestra el error y permite reintentar cuando falla la solicitud', () => {
    iniciarPago();
    preferencia.error({ error: { message: 'Mercado Pago no disponible' } });
    expect(ocupado()).toBe(false);
    expect(location.href).not.toBe(respuesta.urlPago);
    if (pantalla === 'Mis pedidos') {
      expect(alert).toHaveBeenCalledWith('Mercado Pago no disponible');
    } else {
      expect(errorVisible()).toBe('Mercado Pago no disponible');
    }
    preferencia = new Subject<PreferenciaPagoResponse>();
    crearPreferencia.mockReturnValue(preferencia);
    iniciarPago();
    preferencia.next(respuesta);
    expect(location.href).toBe(respuesta.urlPago);
  });
});
