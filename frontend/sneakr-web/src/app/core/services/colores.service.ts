import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export interface Color {
  id: number;
  nombre: string;
  codigo: string;
}

@Injectable({ providedIn: 'root' })
export class ColoresService {
  private readonly API = `${environment.apiUrl}/colores`;

  constructor(private http: HttpClient) {}

  buscarTodos() {
    return this.http.get<Color[]>(this.API);
  }

  crear(nombre: string, codigo: string) {
    return this.http.post<Color>(this.API, { nombre, codigo });
  }
}
