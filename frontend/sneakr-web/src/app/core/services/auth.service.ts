import { Injectable, inject, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { tap } from 'rxjs/operators';
import { ApiUrlService } from './api-url.service';

export interface Usuario {
  id: number;
  nombre: string;
  email: string;
  rol: 'CLIENTE' | 'ADMIN';
  creadoEn: string;
}

export interface AuthResponse {
  usuario: Usuario;
  token: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly API = inject(ApiUrlService).endpoint('auth');

  // Signals reactivos — el estado de auth es observable en toda la app
  readonly almacenamientoDisponible = signal(true);
  private _token = signal<string | null>(this.leerTokenStorage());
  private _usuario = signal<Usuario | null>(this.leerUsuarioStorage());
  private readonly relojExpiracion = signal(0);
  private temporizadorExpiracion?: ReturnType<typeof setTimeout>;

  // Computed públicos de solo lectura
  readonly token = this._token.asReadonly();
  readonly usuario = this._usuario.asReadonly();
  readonly estaAutenticado = computed(() => {
    this.relojExpiracion();
    const token = this._token();
    return !!token && !!this._usuario() && this.tokenNoExpirado(token);
  });
  readonly esAdmin = computed(
    () => this.estaAutenticado() && this._usuario()?.rol === 'ADMIN',
  );

  constructor(
    private http: HttpClient,
    private router: Router,
  ) {
    this.programarExpiracion(this._token());
  }

  sesionValida(): boolean {
    const token = this._token();
    if (!token || !this.tokenNoExpirado(token) || !this._usuario()) {
      this.limpiarSesion();
      return false;
    }
    return true;
  }

  obtenerTokenValido(): string | null {
    return this.sesionValida() ? this._token() : null;
  }

  registro(nombre: string, email: string, password: string) {
    return this.http
      .post<AuthResponse>(`${this.API}/registro`, { nombre, email, password })
      .pipe(tap((res) => this.guardarSesion(res)));
  }

  login(email: string, password: string) {
    return this.http
      .post<AuthResponse>(`${this.API}/login`, { email, password })
      .pipe(tap((res) => this.guardarSesion(res)));
  }

  logout() {
    this.limpiarSesion();
    this.router.navigate(['/']);
  }

  limpiarSesion() {
    if (this.temporizadorExpiracion) {
      clearTimeout(this.temporizadorExpiracion);
      this.temporizadorExpiracion = undefined;
    }
    this.eliminarSesionStorage();
    this._token.set(null);
    this._usuario.set(null);
  }

  private guardarSesion(res: AuthResponse) {
    try {
      globalThis.localStorage?.setItem('SOHO_token', res.token);
      globalThis.localStorage?.setItem('SOHO_usuario', JSON.stringify(res.usuario));
    } catch {
      this.almacenamientoDisponible.set(false);
    }
    this._token.set(res.token);
    this._usuario.set(res.usuario);
    this.programarExpiracion(res.token);
  }

  private leerTokenStorage(): string | null {
    const token = this.leerValorStorage('SOHO_token');
    if (!token || this.tokenNoExpirado(token)) return token;
    this.eliminarSesionStorage();
    return null;
  }

  private leerUsuarioStorage(): Usuario | null {
    const raw = this.leerValorStorage('SOHO_usuario');
    if (!raw) return null;

    try {
      const usuario: unknown = JSON.parse(raw);
      if (this.esUsuario(usuario)) return usuario;
    } catch {
      this.eliminarSesionStorage();
      return null;
    }

    this.eliminarSesionStorage();
    return null;
  }

  private tokenNoExpirado(token: string): boolean {
    const expiracion = this.expiracionToken(token);
    return expiracion !== null && expiracion > Date.now();
  }

  private expiracionToken(token: string): number | null {
    try {
      const segmento = token.split('.')[1];
      if (!segmento) return null;
      const base64 = segmento
        .replace(/-/g, '+')
        .replace(/_/g, '/')
        .padEnd(segmento.length + ((4 - (segmento.length % 4)) % 4), '=');
      const payload: unknown = JSON.parse(atob(base64));
      return typeof payload === 'object' &&
        payload !== null &&
        'exp' in payload &&
        typeof payload.exp === 'number'
        ? payload.exp * 1000
        : null;
    } catch {
      return null;
    }
  }

  private programarExpiracion(token: string | null) {
    if (this.temporizadorExpiracion) {
      clearTimeout(this.temporizadorExpiracion);
      this.temporizadorExpiracion = undefined;
    }
    if (!token) return;

    const expiracion = this.expiracionToken(token);
    if (expiracion === null) return;
    const demora = Math.max(0, expiracion - Date.now());
    this.temporizadorExpiracion = setTimeout(() => {
      this.relojExpiracion.update((reloj) => reloj + 1);
      if (!this.tokenNoExpirado(token)) {
        this.limpiarSesion();
      } else {
        this.programarExpiracion(token);
      }
    }, Math.min(demora, 2_147_483_647));
  }

  private eliminarSesionStorage() {
    try {
      globalThis.localStorage?.removeItem('SOHO_token');
      globalThis.localStorage?.removeItem('SOHO_usuario');
    } catch {
      this.almacenamientoDisponible.set(false);
    }
  }

  private leerValorStorage(clave: string): string | null {
    try {
      return globalThis.localStorage?.getItem(clave) ?? null;
    } catch {
      this.almacenamientoDisponible.set(false);
      return null;
    }
  }

  private esUsuario(valor: unknown): valor is Usuario {
    return (
      typeof valor === 'object' &&
      valor !== null &&
      'id' in valor &&
      typeof valor.id === 'number' &&
      'nombre' in valor &&
      typeof valor.nombre === 'string' &&
      'email' in valor &&
      typeof valor.email === 'string' &&
      'rol' in valor &&
      (valor.rol === 'CLIENTE' || valor.rol === 'ADMIN') &&
      'creadoEn' in valor &&
      typeof valor.creadoEn === 'string'
    );
  }
}
