import { Injectable, signal } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { finalize, tap } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import type { ValorMonetario } from '../models/valor-monetario';

export type { ValorMonetario } from '../models/valor-monetario';

export interface ImagenProducto {
  id: number;
  url: string;
  publicId?: string; // solo disponible en endpoints de admin
}

export interface TallaProducto {
  id: number;
  genero: 'M' | 'W' | 'X';
  colorId: number;
  color: { id: number; nombre: string; codigo: string };
  talla: string;
  stock: number;
  sku?: string; // solo disponible en endpoints de admin
}

export interface Producto {
  id: number;
  nombre: string;
  codigoModelo: string;
  descripcion: string | null;
  precio: ValorMonetario;
  activo: boolean;
  creadoEn: string;
  actualizadoEn: string;
  marca: { id: number; nombre: string; codigo: string; logo: string | null };
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
  genero?: 'M' | 'W' | 'X';
  colorId?: number;
  pagina?: number;
  limite?: number;
}

export type EstadoProductosAdmin = 'todos' | 'activos' | 'inactivos';

export interface FiltrosProductosAdmin extends FiltrosProducto {
  estado: EstadoProductosAdmin;
}

export interface ProductoInput {
  nombre: string;
  codigoModelo: string;
  descripcion?: string;
  precio: number;
  marcaId: number;
  categoriaId: number;
  tallas?: {
    id?: number;
    genero: 'M' | 'W' | 'X';
    colorId: number;
    talla: string;
    stock: number;
  }[];
}

export interface InventarioActivo {
  productosActivos: number;
  stockTotal: number;
  variantesTotales: number;
  disponibles: number;
  bajas: number;
  agotadas: number;
  variantesStockBajo: {
    id: number;
    productoId: number;
    producto: string;
    marca: string;
    imagen: string | null;
    genero: 'M' | 'W' | 'X';
    color: string;
    codigoColor: string;
    talla: string;
    sku: string;
    stock: number;
  }[];
}

export interface VarianteInventario {
  id: number;
  genero: 'M' | 'W' | 'X';
  talla: string;
  stock: number;
  sku: string;
  color: { id: number; nombre: string; codigo: string };
  producto: {
    id: number;
    nombre: string;
    marca: string;
    imagen: string | null;
  };
}

export interface VariantesInventarioPaginadas {
  datos: VarianteInventario[];
  meta: PaginacionMeta;
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
    return this.buscarYActualizar(this.buscarPagina(filtros));
  }

  buscarTodosAdmin(filtros: FiltrosProductosAdmin) {
    return this.buscarYActualizar(this.buscarAdminPagina(filtros));
  }

  private buscarYActualizar(request: ReturnType<ProductosService['buscarPagina']>) {
    const busqueda = ++this.busquedaActiva;
    this.cargando.set(true);
    return request.pipe(
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
    const params = this.crearParametros(filtros);
    return this.http.get<ProductosPaginados>(this.API, { params });
  }

  buscarAdminPagina(filtros: FiltrosProductosAdmin) {
    const { estado, ...filtrosProducto } = filtros;
    const params = this.crearParametros(filtrosProducto).set('estado', estado);
    return this.http.get<ProductosPaginados>(`${this.API}/admin`, { params });
  }

  private crearParametros(filtros: FiltrosProducto) {
    let params = new HttpParams();
    if (filtros.busqueda) params = params.set('busqueda', filtros.busqueda);
    if (filtros.marcaId) params = params.set('marcaId', filtros.marcaId);
    if (filtros.categoriaId) params = params.set('categoriaId', filtros.categoriaId);
    if (filtros.precioMin !== undefined) params = params.set('precioMin', filtros.precioMin);
    if (filtros.precioMax !== undefined) params = params.set('precioMax', filtros.precioMax);
    if (filtros.genero) params = params.set('genero', filtros.genero);
    if (filtros.colorId) params = params.set('colorId', filtros.colorId);
    if (filtros.pagina) params = params.set('pagina', filtros.pagina);
    if (filtros.limite) params = params.set('limite', filtros.limite);
    return params;
  }

  buscarPorId(id: number) {
    return this.http.get<Producto>(`${this.API}/${id}`);
  }

  inventarioActivo() {
    return this.http.get<InventarioActivo>(`${this.API}/admin/inventario`);
  }

  buscarVariantesInventario(
    pagina: number,
    limite = 25,
    busqueda = '',
    estado?: 'bajo' | 'agotado' | 'disponible',
  ) {
    let params = new HttpParams().set('pagina', pagina).set('limite', limite);
    if (busqueda.trim()) params = params.set('busqueda', busqueda.trim());
    if (estado) params = params.set('estado', estado);
    return this.http.get<VariantesInventarioPaginadas>(`${this.API}/admin/variantes`, { params });
  }

  previsualizarSku(variant: {
    marcaId: number;
    codigoModelo: string;
    genero: 'M' | 'W' | 'X';
    colorId: number;
    talla: string;
  }) {
    const params = new HttpParams()
      .set('marcaId', variant.marcaId)
      .set('codigoModelo', variant.codigoModelo)
      .set('genero', variant.genero)
      .set('colorId', variant.colorId)
      .set('talla', variant.talla);
    return this.http.get<{ sku: string }>(`${this.API}/sku-preview`, { params });
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

  actualizarStockTalla(
    productoId: number,
    tallaId: number,
    stock: number,
    stockEsperado: number,
  ) {
    return this.http.patch<{
      id: number;
      stock: number;
    }>(`${this.API}/${productoId}/tallas/${tallaId}`, {
      stock,
      stockEsperado,
    });
  }
}
