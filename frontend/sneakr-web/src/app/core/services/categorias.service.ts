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
}
