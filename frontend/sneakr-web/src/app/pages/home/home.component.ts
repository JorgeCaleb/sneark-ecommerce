import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { ProductosService, Producto } from '../../core/services/productos.service';
import { MarcasService, Marca } from '../../core/services/marcas.service';
import { MonedaPipe } from '../../shared/pipes/moneda.pipe';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [RouterLink, MonedaPipe],
  templateUrl: './home.component.html',
  styleUrl: './home.component.css',
})
export class HomeComponent implements OnInit {
  private destroyRef = inject(DestroyRef);
  private productosService = inject(ProductosService);
  private marcasService = inject(MarcasService);

  readonly destacados = signal<Producto[]>([]);
  readonly marcas = signal<Marca[]>([]);
  readonly cargando = signal(true);
  readonly errorCarga = signal(false);

  ngOnInit() {
    this.cargarDestacados();

    this.marcasService.buscarTodas().subscribe({
      next: (marcas) => this.marcas.set(marcas),
    });
  }

  cargarDestacados() {
    this.cargando.set(true);
    this.errorCarga.set(false);
    // Usamos buscarPagina() en lugar de buscarTodos() para no contaminar
    // los signals globales (productos/meta/cargando) que usa el Catálogo.
    this.productosService.buscarPagina({ limite: 8 })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.destacados.set(res.datos);
          this.cargando.set(false);
        },
        error: () => {
          this.errorCarga.set(true);
          this.cargando.set(false);
        },
      });
  }

  // Verifica si el producto tiene stock disponible
  tieneStock(producto: Producto): boolean {
    return producto.tallas.some((t) => t.stock > 0);
  }
}
