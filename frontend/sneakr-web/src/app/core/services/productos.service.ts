import { Injectable, signal } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { tap } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

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
  precio: number;
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

@Injectable({ providedIn: 'root' })
export class ProductosService {
  private readonly API = `${environment.apiUrl}/productos`;

  // Signal con la lista de productos del catálogo
  readonly productos = signal<Producto[]>([]);
  readonly meta = signal<PaginacionMeta | null>(null);
  readonly cargando = signal(false);

  constructor(private http: HttpClient) {}

  buscarTodos(filtros: FiltrosProducto = {}) {
    this.cargando.set(true);
    let params = new HttpParams();

    if (filtros.busqueda) params = params.set('busqueda', filtros.busqueda);
    if (filtros.marcaId)  params = params.set('marcaId', filtros.marcaId);
    if (filtros.categoriaId) params = params.set('categoriaId', filtros.categoriaId);
    if (filtros.precioMin !== undefined) params = params.set('precioMin', filtros.precioMin);
    if (filtros.precioMax !== undefined) params = params.set('precioMax', filtros.precioMax);
    if (filtros.pagina)  params = params.set('pagina', filtros.pagina);
    if (filtros.limite)  params = params.set('limite', filtros.limite);

    return this.http.get<ProductosPaginados>(this.API, { params }).pipe(
      tap((res) => {
        this.productos.set(res.datos);
        this.meta.set(res.meta);
        this.cargando.set(false);
      }),
    );
  }

  buscarPorId(id: number) {
    return this.http.get<Producto>(`${this.API}/${id}`);
  }

  // Solo ADMIN
  crear(data: FormData) {
    return this.http.post<Producto>(this.API, data);
  }

  actualizar(id: number, data: Partial<Producto>) {
    return this.http.patch<Producto>(`${this.API}/${id}`, data);
  }

  subirImagenes(id: number, archivos: FormData) {
    return this.http.post<Producto>(`${this.API}/${id}/imagenes`, archivos);
  }

  eliminarImagen(productoId: number, imagenId: number) {
    return this.http.delete(`${this.API}/${productoId}/imagenes/${imagenId}`);
  }
}
