import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { ApiUrlService } from './api-url.service';

export interface ClienteAdmin {
  id: number;
  nombre: string;
  email: string;
  creadoEn: string;
  _count: { pedidos: number };
}

export interface ClientesPaginados {
  datos: ClienteAdmin[];
  meta: {
    total: number;
    pagina: number;
    limite: number;
    totalPaginas: number;
  };
}

@Injectable({ providedIn: 'root' })
export class ClientesService {
  private readonly API = inject(ApiUrlService).endpoint('usuarios/admin/clientes');

  constructor(private readonly http: HttpClient) {}

  buscarPagina(pagina: number, limite = 25, busqueda = '') {
    let params = new HttpParams().set('pagina', pagina).set('limite', limite);
    if (busqueda.trim()) params = params.set('busqueda', busqueda.trim());
    return this.http.get<ClientesPaginados>(this.API, { params });
  }
}
