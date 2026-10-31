import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { NgIcon } from '@ng-icons/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ProductosService, ProductoPublico } from '../../core/services/productos.service';
import { MarcasService, Marca } from '../../core/services/marcas.service';
import { FavoritosService } from '../../core/services/favoritos.service';
import { ProductoCardComponent } from '../../shared/components/producto-card/producto-card.component';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [RouterLink, ProductoCardComponent, NgIcon],
  templateUrl: './home.component.html',
  styleUrl: './home.component.css',
})
export class HomeComponent implements OnInit {
  private readonly destroyRef = inject(DestroyRef);
  private readonly productosService = inject(ProductosService);
  private readonly marcasService = inject(MarcasService);
  private readonly params = toSignal(inject(ActivatedRoute).queryParamMap);
  readonly favoritos = inject(FavoritosService);

  readonly destacados = signal<ProductoPublico[]>([]);
  readonly marcas = signal<Marca[]>([]);
  readonly cargando = signal(true);
  readonly errorCarga = signal(false);
  readonly mostrandoFavoritos = computed(() => this.params()?.get('favoritos') === '1');
  // La API actual no publica un ranking de ventas; se conserva la selección del Inicio.
  readonly masVendidosFiltrados = computed(() => this.destacados().slice(0, 4));

  readonly categorias = [
    { nombre: 'HOMBRE', genero: 'M', imagen: 'dd2b9.png', alt: 'Estilo urbano para hombre en una calle de la ciudad' },
    { nombre: 'MUJER', genero: 'W', imagen: 'dbd41.png', alt: 'Estilo urbano para mujer, denim y zapatillas' },
    { nombre: 'UNISEX', genero: 'X', imagen: '17f38.png', alt: 'Dos personas con zapatillas de estilo unisex' },
  ];

  ngOnInit(): void {
    this.cargarDestacados();
    this.marcasService.buscarTodas()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (marcas) => this.marcas.set(marcas),
        error: () => this.marcas.set([]),
      });
  }

  cargarDestacados(): void {
    this.cargando.set(true);
    this.errorCarga.set(false);
    this.productosService.buscarPagina({ limite: 12 })
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

}
