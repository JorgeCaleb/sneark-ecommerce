import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ProductosService, Producto } from '../../core/services/productos.service';
import { MarcasService, Marca } from '../../core/services/marcas.service';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './home.component.html',
  styleUrl: './home.component.css',
})
export class HomeComponent implements OnInit {
  private productosService = inject(ProductosService);
  private marcasService = inject(MarcasService);

  readonly destacados = signal<Producto[]>([]);
  readonly marcas = signal<Marca[]>([]);
  readonly cargando = signal(true);

  ngOnInit() {
    // Cargar productos destacados (los 8 más recientes)
    this.productosService.buscarTodos({ limite: 8 }).subscribe({
      next: (res) => {
        this.destacados.set(res.datos);
        this.cargando.set(false);
      },
      error: () => this.cargando.set(false),
    });

    // Cargar marcas para la sección de marcas
    this.marcasService.buscarTodas().subscribe({
      next: (marcas) => this.marcas.set(marcas),
    });
  }

  // Formatea precio en soles peruanos
  formatearPrecio(precio: number): string {
    return new Intl.NumberFormat('es-PE', {
      style: 'currency',
      currency: 'PEN',
      minimumFractionDigits: 0,
    }).format(precio);
  }

  // Verifica si el producto tiene stock disponible
  tieneStock(producto: Producto): boolean {
    return producto.tallas.some((t) => t.stock > 0);
  }
}
