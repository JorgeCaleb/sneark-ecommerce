import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { environment } from '../../../environments/environment';
import { AuthService } from './auth.service';

describe('AuthService storage resilience', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
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
      token: 'header.payload.signature',
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
});
