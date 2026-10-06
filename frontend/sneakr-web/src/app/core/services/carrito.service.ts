import { Injectable, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { tap } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

export interface ItemCarrito {
  id: number;
  cantidad: number;
  subtotal: number;
  tallaProductoId: number;
  tallaProducto: {
    talla: string;
    stock: number;
    producto: {
      id: number;
      nombre: string;
      precio: number;
      marca: { nombre: string };
      imagenes: { url: string }[];
    };
  };
}

export interface Carrito {
  id: number;
  items: ItemCarrito[];
  total: number;
  cantidadItems: number;
}

@Injectable({ providedIn: 'root' })
export class CarritoService {
  private readonly API = `${environment.apiUrl}/carrito`;

  // Signal reactivo del carrito — accesible en toda la app
  readonly carrito = signal<Carrito | null>(null);

  // Computed: cantidad de items para el badge del navbar
  readonly cantidadItems = computed(() => this.carrito()?.cantidadItems ?? 0);
  readonly total = computed(() => this.carrito()?.total ?? 0);

  constructor(private http: HttpClient) {}

  obtener() {
    return this.http.get<Carrito>(this.API).pipe(
      tap((c) => this.carrito.set(c)),
    );
  }

  agregar(tallaProductoId: number, cantidad: number) {
    return this.http
      .post<Carrito>(`${this.API}/items`, { tallaProductoId, cantidad })
      .pipe(tap((c) => this.carrito.set(c)));
  }

  actualizarCantidad(itemId: number, cantidad: number) {
    return this.http
      .patch<Carrito>(`${this.API}/items/${itemId}`, { cantidad })
      .pipe(tap((c) => this.carrito.set(c)));
  }

  eliminarItem(itemId: number) {
    return this.http
      .delete<Carrito>(`${this.API}/items/${itemId}`)
      .pipe(tap((c) => this.carrito.set(c)));
  }

  vaciar() {
    return this.http
      .delete<Carrito>(this.API)
      .pipe(tap((c) => this.carrito.set(c)));
  }

  limpiarLocal() {
    this.carrito.set(null);
  }
}
