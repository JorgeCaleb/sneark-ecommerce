import { Injectable, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { tap } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

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
  private readonly API = `${environment.apiUrl}/auth`;

  // Signals reactivos — el estado de auth es observable en toda la app
  private _token = signal<string | null>(this.leerTokenStorage());
  private _usuario = signal<Usuario | null>(this.leerUsuarioStorage());

  // Computed públicos de solo lectura
  readonly token = this._token.asReadonly();
  readonly usuario = this._usuario.asReadonly();
  readonly estaAutenticado = computed(() => !!this._token());
  readonly esAdmin = computed(() => this._usuario()?.rol === 'ADMIN');

  constructor(private http: HttpClient, private router: Router) {}

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
    localStorage.removeItem('sneark_token');
    localStorage.removeItem('sneark_usuario');
    this._token.set(null);
    this._usuario.set(null);
    this.router.navigate(['/']);
  }

  private guardarSesion(res: AuthResponse) {
    localStorage.setItem('sneark_token', res.token);
    localStorage.setItem('sneark_usuario', JSON.stringify(res.usuario));
    this._token.set(res.token);
    this._usuario.set(res.usuario);
  }

  private leerTokenStorage(): string | null {
    return localStorage.getItem('sneark_token');
  }

  private leerUsuarioStorage(): Usuario | null {
    const raw = localStorage.getItem('sneark_usuario');
    return raw ? JSON.parse(raw) : null;
  }
}
