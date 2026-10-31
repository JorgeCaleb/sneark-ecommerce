import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { environment } from '../../../environments/environment';
import { Carrito, CarritoService } from './carrito.service';
import { AuthService } from './auth.service';
import { authInterceptor } from '../interceptors/auth.interceptor';

function carrito(cantidadItems: number): Carrito {
  return {
    id: 1,
    items: [],
    total: 0,
    cantidadItems,
  };
}

describe('CarritoService mutation ordering', () => {
  let service: CarritoService;
  let http: HttpTestingController;
  let auth: AuthService;

  function sesion(id: number, segundos = 3600) {
    return {
      token: `header.${btoa(JSON.stringify({ sub: id, exp: Math.floor(Date.now() / 1000) + segundos }))}.signature`,
      usuario: {
        id,
        nombre: `Cliente ${id}`,
        email: `cliente${id}@example.test`,
        rol: 'CLIENTE',
        creadoEn: '2026-01-01T00:00:00Z',
      },
    };
  }

  function iniciarSesion(id: number, segundos = 3600) {
    const datos = sesion(id, segundos);
    auth.login(datos.usuario.email, 'password').subscribe();
    http.expectOne(`${environment.apiUrl}/auth/login`).flush(datos);
    return datos;
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-26T17:00:00Z'));
    localStorage.clear();
    const inicial = sesion(1);
    localStorage.setItem('SOHO_token', inicial.token);
    localStorage.setItem('SOHO_usuario', JSON.stringify(inicial.usuario));
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    });
    service = TestBed.inject(CarritoService);
    http = TestBed.inject(HttpTestingController);
    auth = TestBed.inject(AuthService);
    vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  });

  afterEach(() => {
    http.verify();
    TestBed.resetTestingModule();
    localStorage.clear();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('serializes concurrent mutations so an older response cannot overwrite a newer cart', () => {
    const firstResponse = vi.fn();
    const secondResponse = vi.fn();

    service.actualizarCantidad(10, 2).subscribe(firstResponse);
    service.actualizarCantidad(20, 3).subscribe(secondResponse);

    const firstRequest = http.expectOne(`${environment.apiUrl}/carrito/items/10`);
    expect(firstRequest.request.method).toBe('PATCH');
    http.expectNone(`${environment.apiUrl}/carrito/items/20`);

    firstRequest.flush(carrito(2));
    expect(service.carrito()).toEqual(carrito(2));
    expect(firstResponse).toHaveBeenCalledWith(carrito(2));

    const secondRequest = http.expectOne(`${environment.apiUrl}/carrito/items/20`);
    expect(secondRequest.request.method).toBe('PATCH');
    secondRequest.flush(carrito(5));

    expect(service.carrito()).toEqual(carrito(5));
    expect(secondResponse).toHaveBeenCalledWith(carrito(5));
  });

  it('does not let a cart read started before a mutation overwrite its response', () => {
    service.obtener().subscribe();
    const readRequest = http.expectOne(`${environment.apiUrl}/carrito`);

    service.actualizarCantidad(10, 2).subscribe();
    const mutationRequest = http.expectOne(`${environment.apiUrl}/carrito/items/10`);
    mutationRequest.flush(carrito(2));
    readRequest.flush(carrito(1));

    expect(service.carrito()).toEqual(carrito(2));
  });

  it('ignores an older cart read that responds after a newer read', () => {
    service.obtener().subscribe();
    const olderRead = http.expectOne(`${environment.apiUrl}/carrito`);
    service.obtener().subscribe();
    const newerRead = http.expectOne(`${environment.apiUrl}/carrito`);

    newerRead.flush(carrito(2));
    olderRead.flush(carrito(1));

    expect(service.carrito()).toEqual(carrito(2));
  });

  it('cancela la lectura y vacia productos, total y contador al cerrar sesion', () => {
    service.obtener().subscribe();
    http.expectOne(`${environment.apiUrl}/carrito`).flush({ ...carrito(3), total: 150 });
    const error = vi.fn();
    service.obtener().subscribe({ error });
    const lectura = http.expectOne(`${environment.apiUrl}/carrito`);

    auth.logout();

    expect(lectura.cancelled).toBe(true);
    expect(error).toHaveBeenCalledOnce();
    expect(service.carrito()).toBeNull();
    expect(service.total()).toBe(0);
    expect(service.cantidadItems()).toBe(0);
  });

  it('cancela la mutacion activa y descarta la cola antes de entrar con otra cuenta', () => {
    const errores = [vi.fn(), vi.fn()];
    service.agregar(10, 1).subscribe({ error: errores[0] });
    const anterior = http.expectOne(`${environment.apiUrl}/carrito/items`);
    service.agregar(20, 1).subscribe({ error: errores[1] });
    auth.logout();
    const nueva = iniciarSesion(2);

    expect(anterior.cancelled).toBe(true);
    expect(errores.every((error) => error.mock.calls.length === 1)).toBe(true);
    http.expectNone(`${environment.apiUrl}/carrito/items`);
    service.agregar(30, 1).subscribe();
    const nuevaPeticion = http.expectOne(`${environment.apiUrl}/carrito/items`);
    expect(nuevaPeticion.request.body).toEqual({ tallaProductoId: 30, cantidad: 1 });
    expect(nuevaPeticion.request.headers.get('Authorization')).toBe(`Bearer ${nueva.token}`);
    nuevaPeticion.flush({ ...carrito(1), id: 2 });
    expect(service.carrito()?.id).toBe(2);
  });

  it('descarta operaciones antiguas aunque se cambie de cuenta sin llamar a logout', () => {
    service.agregar(10, 1).subscribe({ error: vi.fn() });
    const anterior = http.expectOne(`${environment.apiUrl}/carrito/items`);
    service.agregar(20, 1).subscribe({ error: vi.fn() });
    iniciarSesion(2);
    expect(anterior.cancelled).toBe(true);
    expect(service.carrito()).toBeNull();
    http.expectNone(`${environment.apiUrl}/carrito/items`);
  });

  it.each(['lectura', 'mutacion'])(
    'no envia una %s creada por A pero suscrita despues de entrar B',
    (tipo) => {
      const solicitud = tipo === 'lectura' ? service.obtener() : service.agregar(10, 1);
      iniciarSesion(2);
      const error = vi.fn();
      solicitud.subscribe({ error });
      expect(error).toHaveBeenCalledOnce();
      http.expectNone((req) => req.url.startsWith(`${environment.apiUrl}/carrito`));
    },
  );

  it('cancela las solicitudes pendientes cuando la sesion expira automaticamente', () => {
    iniciarSesion(1, 2);
    service.obtener().subscribe();
    http.expectOne(`${environment.apiUrl}/carrito`).flush(carrito(3));
    service.agregar(10, 1).subscribe({ error: vi.fn() });
    const anterior = http.expectOne(`${environment.apiUrl}/carrito/items`);
    service.agregar(20, 1).subscribe({ error: vi.fn() });
    vi.advanceTimersByTime(2001);
    expect(auth.estaAutenticado()).toBe(false);
    expect(anterior.cancelled).toBe(true);
    expect(service.carrito()).toBeNull();
    http.expectNone(`${environment.apiUrl}/carrito/items`);
  });

  it('limpia el carrito y cancela la cola ante un 401 de la sesion actual', () => {
    service.agregar(10, 1).subscribe({ error: vi.fn() });
    const rechazada = http.expectOne(`${environment.apiUrl}/carrito/items`);
    service.agregar(20, 1).subscribe({ error: vi.fn() });
    rechazada.flush({}, { status: 401, statusText: 'Unauthorized' });
    expect(auth.estaAutenticado()).toBe(false);
    expect(service.carrito()).toBeNull();
    http.expectNone(`${environment.apiUrl}/carrito/items`);
    expect(TestBed.inject(Router).navigate).toHaveBeenCalledWith(['/auth/login']);
  });

  it.each([1, 2])('un 401 antiguo no borra la sesion nueva del usuario %i ni su carrito', (id) => {
    TestBed.inject(HttpClient)
      .get(`${environment.apiUrl}/pedidos/mis-pedidos`)
      .subscribe({ error: vi.fn() });
    const antigua = http.expectOne(`${environment.apiUrl}/pedidos/mis-pedidos`);
    const nueva = iniciarSesion(id);
    service.obtener().subscribe();
    http.expectOne(`${environment.apiUrl}/carrito`).flush({ ...carrito(4), id });
    antigua.flush({}, { status: 401, statusText: 'Unauthorized' });
    expect(auth.token()).toBe(nueva.token);
    expect(auth.estaAutenticado()).toBe(true);
    expect(service.carrito()).toEqual({ ...carrito(4), id });
    expect(TestBed.inject(Router).navigate).not.toHaveBeenCalled();
  });

  it('limpiarLocal tambien invalida mutaciones pendientes dentro de la misma sesion', () => {
    service.agregar(10, 1).subscribe({ error: vi.fn() });
    const anterior = http.expectOne(`${environment.apiUrl}/carrito/items`);
    service.agregar(20, 1).subscribe({ error: vi.fn() });
    service.limpiarLocal();
    expect(anterior.cancelled).toBe(true);
    expect(auth.estaAutenticado()).toBe(true);
    http.expectNone(`${environment.apiUrl}/carrito/items`);
    service.obtener().subscribe();
    http.expectOne(`${environment.apiUrl}/carrito`).flush(carrito(0));
    expect(service.carrito()).toEqual(carrito(0));
  });

  it('un fallo HTTP no bloquea las siguientes mutaciones de la misma sesion', () => {
    service.agregar(10, 1).subscribe({ error: vi.fn() });
    const primera = http.expectOne(`${environment.apiUrl}/carrito/items`);
    service.agregar(20, 1).subscribe();
    primera.flush({}, { status: 400, statusText: 'Bad Request' });
    const siguiente = http.expectOne(`${environment.apiUrl}/carrito/items`);
    expect(siguiente.request.body.tallaProductoId).toBe(20);
    siguiente.flush(carrito(1));
    expect(service.carrito()).toEqual(carrito(1));
  });

  it('no cancela una lectura de la sesion nueva iniciada al notificar la cancelacion anterior', () => {
    service.agregar(10, 1).subscribe({ error: () => service.obtener().subscribe() });
    const anterior = http.expectOne(`${environment.apiUrl}/carrito/items`);
    iniciarSesion(2);
    const nueva = http.expectOne(`${environment.apiUrl}/carrito`);
    expect(anterior.cancelled).toBe(true);
    expect(nueva.cancelled).toBe(false);
    nueva.flush({ ...carrito(2), id: 2 });
    expect(service.carrito()?.id).toBe(2);
  });

  it('detecta la expiracion al intentar operar aunque el temporizador aun no haya corrido', () => {
    service.agregar(10, 1).subscribe({ error: vi.fn() });
    const anterior = http.expectOne(`${environment.apiUrl}/carrito/items`);
    vi.setSystemTime(new Date('2026-10-26T19:00:00Z'));
    const error = vi.fn();
    service.agregar(20, 1).subscribe({ error });
    expect(error).toHaveBeenCalledOnce();
    expect(auth.estaAutenticado()).toBe(false);
    expect(anterior.cancelled).toBe(true);
    expect(service.carrito()).toBeNull();
    http.expectNone(`${environment.apiUrl}/carrito/items`);
  });

  it('rechaza solicitudes anonimas sin enviarlas al servidor', () => {
    auth.limpiarSesion();
    const errores = [vi.fn(), vi.fn()];
    service.obtener().subscribe({ error: errores[0] });
    service.agregar(10, 1).subscribe({ error: errores[1] });
    expect(errores.every((error) => error.mock.calls.length === 1)).toBe(true);
    http.expectNone((req) => req.url.startsWith(`${environment.apiUrl}/carrito`));
  });

  it.each(['lectura', 'mutacion'])(
    'descarta una respuesta de %s recibida despues de expirar la sesion',
    (tipo) => {
      const next = vi.fn();
      const error = vi.fn();
      const solicitud = tipo === 'lectura' ? service.obtener() : service.agregar(10, 1);
      solicitud.subscribe({ next, error });
      const anterior = http.expectOne(
        `${environment.apiUrl}/carrito${tipo === 'lectura' ? '' : '/items'}`,
      );
      vi.setSystemTime(new Date('2026-10-26T19:00:00Z'));
      anterior.flush(carrito(9));
      expect(next).not.toHaveBeenCalled();
      expect(error).toHaveBeenCalledOnce();
      expect(service.carrito()).toBeNull();
      expect(auth.estaAutenticado()).toBe(false);
    },
  );
});
