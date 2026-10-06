import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export interface Categoria {
  id: number;
  nombre: string;
  _count?: { productos: number };
}

@Injectable({ providedIn: 'root' })
export class CategoriasService {
  private readonly API = `${environment.apiUrl}/categorias`;

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
