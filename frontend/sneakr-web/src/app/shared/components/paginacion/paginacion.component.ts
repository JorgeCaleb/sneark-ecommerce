import { Component, computed, input, output } from '@angular/core';

@Component({
  selector: 'app-paginacion',
  standalone: true,
  imports: [],
  templateUrl: './paginacion.component.html',
  styleUrl: './paginacion.component.css',
})
export class PaginacionComponent {
  pagina = input.required<number>();
  totalPaginas = input.required<number>();
  modo = input<'numeros' | 'compacto'>('compacto');
  ariaLabel = input<string>('Paginación');

  cambioPagina = output<number>();

  paginasArray = computed(() => {
    const total = this.totalPaginas();
    if (total <= 1) return [];
    return Array.from({ length: total }, (_, i) => i + 1);
  });

  irAPagina(p: number) {
    if (p >= 1 && p <= this.totalPaginas() && p !== this.pagina()) {
      this.cambioPagina.emit(p);
    }
  }
}
