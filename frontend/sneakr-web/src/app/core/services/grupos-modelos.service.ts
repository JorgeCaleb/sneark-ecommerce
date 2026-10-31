import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, shareReplay, tap } from 'rxjs';
import { ApiUrlService } from './api-url.service';

export interface GrupoModelo {
  id: number;
  nombre: string;
  _count?: { productos: number };
}

export interface ModeloRelacionado {
  id: number;
  nombre: string;
  imagenes: { id: number; url: string }[];
}

@Injectable({ providedIn: 'root' })
export class GruposModelosService {
  private readonly http = inject(HttpClient);
  private readonly API = inject(ApiUrlService).endpoint('grupos-modelos');
  private readonly cache = new Map<number, { hasta: number; datos: Observable<ModeloRelacionado[]> }>();

  buscarTodos() {
    return this.http.get<GrupoModelo[]>(this.API);
  }

  crear(nombre: string) {
    return this.http.post<GrupoModelo>(this.API, { nombre: nombre.trim() });
  }

  actualizar(id: number, nombre: string) {
    return this.http.patch<GrupoModelo>(`${this.API}/${id}`, { nombre: nombre.trim() }).pipe(
      tap(() => this.invalidar()),
    );
  }

  buscarModelos(id: number) {
    const existente = this.cache.get(id);
    if (existente && existente.hasta > Date.now()) return existente.datos;
    const datos = this.http.get<ModeloRelacionado[]>(`${this.API}/${id}/productos`).pipe(
      shareReplay({ bufferSize: 1, refCount: false }),
    );
    this.cache.set(id, { hasta: Date.now() + 60_000, datos });
    return datos;
  }

  invalidar() { this.cache.clear(); }
}
