import { Injectable, signal } from '@angular/core';
import { ProductoPublico } from './productos.service';

/** Lista de deseos local; la disponibilidad se confirma en la ficha del producto. */
@Injectable({ providedIn: 'root' })
export class FavoritosService {
  private readonly clave = 'soho.favoritos';
  private readonly lista = signal<ProductoPublico[]>(this.leer());
  readonly productos = this.lista.asReadonly();

  contiene(id: number): boolean {
    return this.lista().some((producto) => producto.id === id);
  }

  alternar(producto: ProductoPublico): void {
    this.lista.update((lista) => this.contiene(producto.id)
      ? lista.filter((item) => item.id !== producto.id)
      : [...lista, producto]);
    try {
      localStorage.setItem(this.clave, JSON.stringify(this.lista()));
    } catch {
      // La lista sigue funcionando cuando el navegador bloquea el almacenamiento.
    }
  }

  private leer(): ProductoPublico[] {
    try {
      const valor: unknown = JSON.parse(localStorage.getItem(this.clave) ?? '[]');
      return Array.isArray(valor) ? valor.filter((item): item is ProductoPublico =>
        item && typeof item.id === 'number' && typeof item.nombre === 'string'
        && item.marca && Array.isArray(item.imagenes) && Array.isArray(item.tallas)
        && item.tallas.every((talla: ProductoPublico['tallas'][number]) => talla?.color),
      ) : [];
    } catch {
      return [];
    }
  }
}
