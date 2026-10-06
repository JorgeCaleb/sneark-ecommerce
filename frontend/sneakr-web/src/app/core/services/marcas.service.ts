import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export interface Marca {
  id: number;
  nombre: string;
  logo: string | null;
  _count?: { productos: number };
}

@Injectable({ providedIn: 'root' })
export class MarcasService {
  private readonly API = `${environment.apiUrl}/marcas`;

  constructor(private http: HttpClient) {}

  buscarTodas() {
    return this.http.get<Marca[]>(this.API);
  }

  buscarPorId(id: number) {
    return this.http.get<Marca>(`${this.API}/${id}`);
  }

  subirLogo(id: number, archivo: File) {
    const data = new FormData();
    data.append('logo', archivo);
    return this.http.post<Marca>(`${this.API}/${id}/logo`, data);
  }
}
