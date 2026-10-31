import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { ApiUrlService } from '../services/api-url.service';
import { authInterceptor } from './auth.interceptor';

describe('authInterceptor', () => {
  const root = 'https://api.example.test/api';
  let token: string | null;
  let sesion: number;
  let limpiarSesion: ReturnType<typeof vi.fn>;
  let navigate: ReturnType<typeof vi.fn>;
  let http: HttpClient;
  let requests: HttpTestingController;

  beforeEach(() => {
    token = null;
    sesion = 1;
    limpiarSesion = vi.fn();
    navigate = vi.fn().mockResolvedValue(true);
    TestBed.configureTestingModule({ providers: [
      provideHttpClient(withInterceptors([authInterceptor])),
      provideHttpClientTesting(),
      { provide: ApiUrlService, useValue: { endpoint: () => `${root}/` } },
      { provide: AuthService, useValue: {
        obtenerTokenValido: () => token,
        token: () => token,
        get idSesion() { return sesion; },
        limpiarSesion,
      } },
      { provide: Router, useValue: { navigate } },
    ] });
    http = TestBed.inject(HttpClient);
    requests = TestBed.inject(HttpTestingController);
  });

  afterEach(() => requests.verify());

  it.each([null, 'jwt-vigente'])('envía al login ante un 401 con token %s', (actual) => {
    token = actual;
    http.delete(`${root}/productos/1/imagenes/9`).subscribe({ error: () => {} });
    const req = requests.expectOne(`${root}/productos/1/imagenes/9`);
    expect(req.request.headers.get('Authorization')).toBe(actual ? `Bearer ${actual}` : null);
    req.flush({}, { status: 401, statusText: 'Unauthorized' });
    expect(limpiarSesion).toHaveBeenCalledOnce();
    expect(navigate).toHaveBeenCalledWith(['/auth/login']);
  });

  it('mantiene el error de credenciales en el formulario de login', () => {
    http.post(`${root}/auth/login`, {}).subscribe({ error: () => {} });
    requests.expectOne(`${root}/auth/login`).flush({}, { status: 401, statusText: 'Unauthorized' });
    expect(limpiarSesion).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('no modifica la sesión por un 401 de otro servicio', () => {
    token = 'jwt-vigente';
    http.get('https://otro.example.test/imagen').subscribe({ error: () => {} });
    const req = requests.expectOne('https://otro.example.test/imagen');
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush({}, { status: 401, statusText: 'Unauthorized' });
    expect(limpiarSesion).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('no cierra una nueva sesión cuando llega un rechazo de la anterior', () => {
    http.delete(`${root}/productos/1/imagenes/9`).subscribe({ error: () => {} });
    const req = requests.expectOne(`${root}/productos/1/imagenes/9`);
    token = 'nuevo-jwt';
    sesion++;
    req.flush({}, { status: 401, statusText: 'Unauthorized' });
    expect(limpiarSesion).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });
});
