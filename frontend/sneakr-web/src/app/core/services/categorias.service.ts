import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ApiUrlService } from './api-url.service';

export interface Categoria {
  id: number;
  nombre: string;
  _count?: { productos: number };
}

@Injectable({ providedIn: 'root' })
export class CategoriasService {
  private readonly API = inject(ApiUrlService).endpoint('categorias');

  constructor(private http: HttpClient) {}

  buscarTodas() {
    return this.http.get<Categoria[]>(this.API);
  }

  crear(nombre: string) {
    return this.http.post<Categoria>(this.API, { nombre });
  }

  actualizar(id: number, nombre: string) {
    return this.http.patch<Categoria>(`${this.API}/${id}`, { nombre });
  }

  eliminar(id: number) {
    return this.http.delete<void>(`${this.API}/${id}`);
  }
}
