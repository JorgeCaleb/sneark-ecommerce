import { Injectable, signal } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { finalize, tap } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import type { ValorMonetario } from '../models/valor-monetario';

export type { ValorMonetario } from '../models/valor-monetario';

export interface ImagenProducto {
  id: number;
  url: string;
  publicId: string;
}

export interface TallaProducto {
  id: number;
  talla: string;
  stock: number;
}

export interface Producto {
  id: number;
  nombre: string;
  descripcion: string | null;
  precio: ValorMonetario;
  activo: boolean;
  creadoEn: string;
  actualizadoEn: string;
  marca: { id: number; nombre: string; logo: string | null };
  categoria: { id: number; nombre: string };
  imagenes: ImagenProducto[];
  tallas: TallaProducto[];
}

export interface PaginacionMeta {
  total: number;
  pagina: number;
  limite: number;
  totalPaginas: number;
}

export interface ProductosPaginados {
  datos: Producto[];
  meta: PaginacionMeta;
}

export interface FiltrosProducto {
  busqueda?: string;
  marcaId?: number;
  categoriaId?: number;
  precioMin?: number;
  precioMax?: number;
  pagina?: number;
  limite?: number;
}

export interface ProductoInput {
  nombre: string;
  descripcion?: string;
  precio: number;
  marcaId: number;
  categoriaId: number;
  tallas?: { talla: string; stock: number }[];
}

@Injectable({ providedIn: 'root' })
export class ProductosService {
  private readonly API = `${environment.apiUrl}/productos`;

  // Signal con la lista de productos del catálogo
  readonly productos = signal<Producto[]>([]);
  readonly meta = signal<PaginacionMeta | null>(null);
  readonly cargando = signal(false);
  private busquedaActiva = 0;

  constructor(private http: HttpClient) {}

  buscarTodos(filtros: FiltrosProducto = {}) {
    const busqueda = ++this.busquedaActiva;
    this.cargando.set(true);
    return this.buscarPagina(filtros).pipe(
      tap((res) => {
        if (busqueda !== this.busquedaActiva) return;
        this.productos.set(res.datos);
        this.meta.set(res.meta);
      }),
      finalize(() => {
        if (busqueda === this.busquedaActiva) this.cargando.set(false);
      }),
    );
  }

  buscarPagina(filtros: FiltrosProducto = {}) {
    let params = new HttpParams();

    if (filtros.busqueda) params = params.set('busqueda', filtros.busqueda);
    if (filtros.marcaId) params = params.set('marcaId', filtros.marcaId);
    if (filtros.categoriaId) params = params.set('categoriaId', filtros.categoriaId);
    if (filtros.precioMin !== undefined) params = params.set('precioMin', filtros.precioMin);
    if (filtros.precioMax !== undefined) params = params.set('precioMax', filtros.precioMax);
    if (filtros.pagina) params = params.set('pagina', filtros.pagina);
    if (filtros.limite) params = params.set('limite', filtros.limite);

    return this.http.get<ProductosPaginados>(this.API, { params });
  }

  buscarPorId(id: number) {
    return this.http.get<Producto>(`${this.API}/${id}`);
  }

  // Solo ADMIN
  crear(data: ProductoInput) {
    return this.http.post<Producto>(this.API, data);
  }

  actualizar(id: number, data: Partial<ProductoInput> & { activo?: boolean }) {
    return this.http.patch<Producto>(`${this.API}/${id}`, data);
  }

  subirImagenes(id: number, archivos: FormData) {
    return this.http.post<Producto>(`${this.API}/${id}/imagenes`, archivos);
  }

  eliminarImagen(productoId: number, imagenId: number) {
    return this.http.delete(`${this.API}/${productoId}/imagenes/${imagenId}`);
  }
}
