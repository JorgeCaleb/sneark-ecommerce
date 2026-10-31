import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { environment } from '../../../environments/environment';
import { AuthService } from './auth.service';

describe('AuthService storage resilience', () => {
  let http: HttpTestingController;
  const tokenValido = `header.${btoa(
    JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 }),
  )}.signature`;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('cleans invalid stored user data without throwing during initialization', () => {
    localStorage.setItem('SOHO_usuario', '{invalid-json');

    const auth = TestBed.inject(AuthService);

    expect(auth.usuario()).toBeNull();
    expect(localStorage.getItem('SOHO_usuario')).toBeNull();
  });

  it('fails closed when storage reads throw', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('Storage unavailable');
    });

    const auth = TestBed.inject(AuthService);

    expect(auth.sesionValida()).toBe(false);
    expect(auth.almacenamientoDisponible()).toBe(false);
  });

  it('keeps the in-memory session and reports unavailable storage when writes throw', () => {
    const auth = TestBed.inject(AuthService);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Storage unavailable');
    });

    auth.login('admin@example.test', 'password').subscribe();
    http.expectOne(`${environment.apiUrl}/auth/login`).flush({
      token: tokenValido,
      usuario: {
        id: 1,
        nombre: 'Admin',
        email: 'admin@example.test',
        rol: 'ADMIN',
        creadoEn: '2026-01-01T00:00:00.000Z',
      },
    });

    expect(auth.estaAutenticado()).toBe(true);
    expect(auth.almacenamientoDisponible()).toBe(false);
  });

  it('no cambia la identidad de sesion al comprobar repetidamente un usuario anonimo', () => {
    const auth = TestBed.inject(AuthService);
    const cambios = vi.fn();
    auth.cambiosSesion$.subscribe(cambios);
    const inicial = auth.idSesion;
    expect(auth.sesionValida()).toBe(false);
    expect(auth.obtenerTokenValido()).toBeNull();
    expect(auth.idSesion).toBe(inicial);
    expect(cambios).not.toHaveBeenCalled();
  });

  it('notifica cada autenticacion despues de guardar el usuario, incluso con el mismo JWT', () => {
    const auth = TestBed.inject(AuthService);
    const cambios = vi.fn(() => ({ sesion: auth.idSesion, id: auth.usuario()?.id }));
    auth.cambiosSesion$.subscribe(cambios);
    const usuario = {
      id: 1,
      nombre: 'Cliente',
      email: 'cliente@example.test',
      rol: 'CLIENTE',
      creadoEn: '2026-01-01T00:00:00Z',
    };
    auth.login(usuario.email, 'password').subscribe();
    http.expectOne(`${environment.apiUrl}/auth/login`).flush({ token: tokenValido, usuario });
    const primera = auth.idSesion;
    auth.login(usuario.email, 'password').subscribe();
    http.expectOne(`${environment.apiUrl}/auth/login`).flush({ token: tokenValido, usuario });
    expect(auth.idSesion).toBeGreaterThan(primera);
    expect(cambios).toHaveBeenCalledTimes(2);
    expect(cambios.mock.results.every((resultado) => resultado.value.id === 1)).toBe(true);
    auth.limpiarSesion();
    expect(cambios).toHaveBeenCalledTimes(3);
    expect(auth.usuario()).toBeNull();
  });
});
