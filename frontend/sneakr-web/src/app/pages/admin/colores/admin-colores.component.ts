import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ColoresService, Color } from '../../../core/services/colores.service';

@Component({
  selector: 'app-admin-colores',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './admin-colores.component.html',
  styleUrl: './admin-colores.component.css',
})
export class AdminColoresComponent implements OnInit {
  private readonly coloresService = inject(ColoresService);

  readonly colores = signal<Color[]>([]);
  readonly cargando = signal(true);
  readonly errorCarga = signal('');
  readonly modalAbierto = signal(false);
  readonly guardando = signal(false);
  readonly errorForm = signal('');
  readonly colorEditar = signal<Color | null>(null);

  nombre = '';
  codigo = '';

  ngOnInit() {
    this.cargar();
  }

  cargar() {
    this.cargando.set(true);
    this.errorCarga.set('');
    this.coloresService.buscarTodos().subscribe({
      next: (colores) => {
        this.colores.set(colores);
        this.cargando.set(false);
      },
      error: () => {
        this.errorCarga.set('No se pudieron cargar los colores. Intenta de nuevo.');
        this.cargando.set(false);
      },
    });
  }

  abrirCrear() {
    this.colorEditar.set(null);
    this.nombre = '';
    this.codigo = '';
    this.errorForm.set('');
    this.modalAbierto.set(true);
  }

  abrirEditar(color: Color) {
    this.colorEditar.set(color);
    this.nombre = color.nombre;
    this.codigo = color.codigo;
    this.errorForm.set('');
    this.modalAbierto.set(true);
  }

  cerrarModal() {
    if (!this.guardando()) this.modalAbierto.set(false);
  }

  guardar() {
    const nombre = this.nombre.trim();
    const codigo = this.codigo.trim().toUpperCase();

    if (!nombre) {
      this.errorForm.set('El nombre es obligatorio.');
      return;
    }
    if (!codigo) {
      this.errorForm.set('El código es obligatorio.');
      return;
    }

    this.guardando.set(true);
    this.errorForm.set('');

    const color = this.colorEditar();
    const request$ = color
      ? this.coloresService.actualizar(color.id, { nombre, codigo })
      : this.coloresService.crear(nombre, codigo);

    request$.subscribe({
      next: () => {
        this.guardando.set(false);
        this.modalAbierto.set(false);
        this.cargar();
      },
      error: (err) => {
        this.guardando.set(false);
        this.errorForm.set(err?.error?.message ?? 'No se pudo guardar el color.');
      },
    });
  }

  eliminar(color: Color) {
    if (
      !confirm(
        `¿Eliminar el color "${color.nombre}" (${color.codigo})? Solo se puede eliminar si no tiene variantes asociadas.`,
      )
    ) {
      return;
    }

    this.coloresService.eliminar(color.id).subscribe({
      next: () => this.cargar(),
      error: (err) =>
        alert(err?.error?.message ?? 'No se pudo eliminar el color.'),
    });
  }
}
