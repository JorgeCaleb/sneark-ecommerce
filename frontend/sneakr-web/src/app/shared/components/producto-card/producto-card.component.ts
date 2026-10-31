import { Component, ElementRef, computed, effect, inject, input, signal, viewChild } from '@angular/core';
import { NgIcon } from '@ng-icons/core';
import { RouterLink } from '@angular/router';
import { ProductoPublico } from '../../../core/services/productos.service';
import { FavoritosService } from '../../../core/services/favoritos.service';
import { GruposModelosService, ModeloRelacionado } from '../../../core/services/grupos-modelos.service';
import { colorVisual } from '../../../core/utils/color-visual.util';
import { MonedaPipe } from '../../pipes/moneda.pipe';

@Component({
  selector: 'app-producto-card',
  standalone: true,
  imports: [RouterLink, MonedaPipe, NgIcon],
  templateUrl: './producto-card.component.html',
  styleUrl: './producto-card.component.css',
  host: { '[class.is-expanded]': 'expandida()' },
})
export class ProductoCardComponent {
  private static secuencia = 0;
  readonly idVista = `product-preview-${++ProductoCardComponent.secuencia}`;
  readonly producto = input.required<ProductoPublico>();
  private readonly grupos = inject(GruposModelosService);
  readonly grupoId = computed(() => this.producto().grupoModeloId ?? this.producto().grupoModelo?.id ?? null);
  private readonly modelosGrupo = signal<{ id: number; modelos: ModeloRelacionado[] } | null>(null);
  readonly cargandoModelos = signal(false);
  readonly errorModelos = signal(false);
  private readonly intentoModelos = signal(0);
  readonly miniaturas = computed(() => {
    const grupo = this.modelosGrupo();
    if (grupo?.id !== this.grupoId()) return [];
    return [...new Map(grupo?.modelos.map((modelo) => [modelo.id, modelo])).values()]
      .filter((modelo) => modelo.id !== this.producto().id);
  });
  readonly modelosPanel = computed<ModeloRelacionado[]>(() => {
    const producto = this.producto();
    return [
      {
        id: producto.id,
        nombre: producto.nombre,
        imagenes: producto.imagenes,
      },
      ...this.miniaturas(),
    ];
  });
  readonly modeloPrevisualizado = signal<ModeloRelacionado | null>(null);
  readonly tienePanel = computed(() => this.miniaturas().length > 0 || (!!this.grupoId() && (this.cargandoModelos() || this.errorModelos())));
  readonly hayDesplazamiento = signal(false);
  private readonly previewNavigation = viewChild<ElementRef<HTMLElement>>('previewNavigation');
  readonly favoritos = inject(FavoritosService);
  readonly colorVisual = colorVisual;
  readonly punteroDentro = signal(false);
  readonly focoDentro = signal(false);
  readonly vistaTactil = signal(false);
  private readonly descartada = signal(false);
  private readonly imagenCargada = signal('');
  private readonly imagenesFallidas = signal<string[]>([]);
  readonly imagenes = computed(() => this.producto().imagenes.filter((imagen) => !!imagen.url));
  readonly expandida = computed(
    () => !this.descartada() && (this.punteroDentro() || this.focoDentro() || this.vistaTactil()),
  );
  readonly fotoVista = computed(() => this.imagenes()[1]);
  readonly mostrarVista = computed(
    () =>
      this.expandida() &&
      !!this.fotoVista() &&
      this.imagenCargada() === this.fotoVista()?.url &&
      !this.imagenesFallidas().includes(this.fotoVista()?.url ?? ''),
  );
  readonly colores = computed(() => [
    ...new Map(this.producto().tallas.map((t) => [t.color.id, t.color])).values(),
  ]);
  readonly nombresColores = computed(() =>
    this.colores()
      .map((c) => c.nombre)
      .join(' / '),
  );
  readonly agotado = computed(() => !this.producto().tallas.some((t) => t.disponible));

  constructor() {
    effect(() => {
      const productoId = this.producto().id;
      if (productoId > 0) this.modeloPrevisualizado.set(null);
    });
    effect((onCleanup) => {
      const cantidadModelos = this.modelosPanel().length;
      if (!this.expandida() || !this.tienePanel()) {
        this.hayDesplazamiento.set(false);
        return;
      }
      const navigation = this.previewNavigation()?.nativeElement;
      if (!navigation) return;

      const actualizar = () => this.actualizarDesplazamiento(navigation, cantidadModelos);
      const frame =
        typeof requestAnimationFrame === 'undefined' ? 0 : requestAnimationFrame(actualizar);
      const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(actualizar);
      observer?.observe(navigation);
      onCleanup(() => {
        if (frame && typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(frame);
        observer?.disconnect();
      });
    });
    effect((onCleanup) => {
      const grupoId = this.grupoId();
      this.intentoModelos();
      if (!grupoId || !this.expandida()) return;
      this.cargandoModelos.set(true);
      this.errorModelos.set(false);
      const lectura = this.grupos.buscarModelos(grupoId).subscribe({
        next: (modelos) => {
          this.modelosGrupo.set({ id: grupoId, modelos });
          this.cargandoModelos.set(false);
        },
        error: () => { this.cargandoModelos.set(false); this.errorModelos.set(true); },
      });
      onCleanup(() => { lectura.unsubscribe(); this.cargandoModelos.set(false); });
    });
  }

  reintentarModelos(): void { this.intentoModelos.update((intento) => intento + 1); }

  entrarPuntero(event: PointerEvent): void {
    if (event.pointerType !== 'mouse' || !matchMedia('(hover: hover) and (pointer: fine)').matches)
      return;
    this.descartada.set(false);
    this.punteroDentro.set(true);
  }

  salirPuntero(): void {
    this.punteroDentro.set(false);
    this.modeloPrevisualizado.set(null);
    this.restaurarVista();
  }

  entrarFoco(): void {
    this.descartada.set(false);
    this.focoDentro.set(true);
  }

  salirFoco(event: FocusEvent): void {
    if ((event.currentTarget as HTMLElement).contains(event.relatedTarget as Node | null)) return;
    this.focoDentro.set(false);
    this.restaurarVista();
  }

  desplazarModelos(contenedor: HTMLElement, direccion: number): void {
    contenedor.scrollBy({
      left: direccion * Math.max(48, contenedor.clientWidth - 48),
      behavior: 'instant',
    });
  }

  actualizarDesplazamiento(navigation: HTMLElement, cantidadModelos = this.modelosPanel().length): void {
    this.hayDesplazamiento.set(cantidadModelos * 48 > navigation.clientWidth + 1);
  }

  previsualizarModelo(modelo: ModeloRelacionado, event?: PointerEvent): void {
    if (
      event &&
      (event.pointerType !== 'mouse' || !matchMedia('(hover: hover) and (pointer: fine)').matches)
    )
      return;
    this.modeloPrevisualizado.set(modelo);
  }

  restaurarModelo(): void {
    this.modeloPrevisualizado.set(null);
  }

  vistaCargada(event: Event): void {
    this.imagenCargada.set((event.target as HTMLImageElement).getAttribute('src') ?? '');
  }

  vistaFallida(event: Event): void {
    const url = (event.target as HTMLImageElement).getAttribute('src') ?? '';
    this.imagenesFallidas.update((urls) => (urls.includes(url) ? urls : [...urls, url]));
  }

  alternarVistaTactil(event: Event): void {
    if (this.vistaTactil()) {
      this.cerrarVista();
      (event.currentTarget as HTMLElement).blur();
    } else {
      this.descartada.set(false);
      this.vistaTactil.set(true);
    }
  }

  cerrarVista(): void {
    this.descartada.set(true);
    this.vistaTactil.set(false);
    this.modeloPrevisualizado.set(null);
  }

  private restaurarVista(): void {
    if (!this.focoDentro() && !this.punteroDentro() && !this.vistaTactil()) {
      this.descartada.set(false);
    }
  }

  imagenAlternativa(event: Event): void {
    const imagen = event.target as HTMLImageElement;
    if (!imagen.src.endsWith('/placeholder-shoe.svg')) imagen.src = 'placeholder-shoe.svg';
  }
}
