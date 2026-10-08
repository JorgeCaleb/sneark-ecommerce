import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MarcasService, Marca } from '../../../core/services/marcas.service';

interface MarcaForm {
  nombre: string;
  codigo: string;
}

@Component({
  selector: 'app-admin-marcas',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './admin-marcas.component.html',
  styleUrl: './admin-marcas.component.css',
})
export class AdminMarcasComponent implements OnInit, OnDestroy {
  private marcasService = inject(MarcasService);

  readonly marcas = signal<Marca[]>([]);
  readonly cargando = signal(true);
  readonly errorCarga = signal(false);
  readonly modalAbierto = signal(false);
  readonly guardando = signal(false);
  readonly errorForm = signal('');
  readonly marcaEditar = signal<Marca | null>(null);
  readonly archivoLogo = signal<File | null>(null);
  readonly vistaPreviaLogo = signal<string | null>(null);
  private urlVistaPreviaLogo: string | null = null;

  form: MarcaForm = { nombre: '', codigo: '' };

  ngOnInit() {
    this.cargar();
  }

  ngOnDestroy() {
    this.limpiarVistaPreviaLogo();
  }

  cargar() {
    this.cargando.set(true);
    this.errorCarga.set(false);
    this.marcasService.buscarTodas().subscribe({
      next: (m) => {
        this.marcas.set(m);
        this.cargando.set(false);
      },
      error: () => {
        this.cargando.set(false);
        this.errorCarga.set(true);
      },
    });
  }

  abrirCrear() {
    this.marcaEditar.set(null);
    this.form = { nombre: '', codigo: '' };
    this.limpiarSeleccionLogo();
    this.errorForm.set('');
    this.modalAbierto.set(true);
  }

  abrirEditar(m: Marca) {
    this.marcaEditar.set(m);
    this.form = { nombre: m.nombre, codigo: m.codigo };
    this.limpiarSeleccionLogo();
    this.errorForm.set('');
    this.modalAbierto.set(true);
  }

  cerrarModal() {
    this.modalAbierto.set(false);
    this.limpiarSeleccionLogo();
  }

  seleccionarLogo(event: Event) {
    const input = event.target as HTMLInputElement;
    const archivo = input.files?.[0] ?? null;
    if (!archivo) return;

    const tiposPermitidos = ['image/svg+xml', 'image/png', 'image/jpeg', 'image/webp'];
    if (!tiposPermitidos.includes(archivo.type)) {
      this.errorForm.set('El logo debe estar en formato SVG, PNG, JPG o WEBP.');
      input.value = '';
      this.limpiarSeleccionLogo();
      return;
    }
    if (archivo.size > 2 * 1024 * 1024) {
      this.errorForm.set('El logo debe pesar 2 MB o menos.');
      input.value = '';
      this.limpiarSeleccionLogo();
      return;
    }

    this.limpiarVistaPreviaLogo();
    this.urlVistaPreviaLogo = URL.createObjectURL(archivo);
    this.vistaPreviaLogo.set(this.urlVistaPreviaLogo);
    this.errorForm.set('');
    this.archivoLogo.set(archivo);
  }

  limpiarSeleccionLogo() {
    this.archivoLogo.set(null);
    this.limpiarVistaPreviaLogo();
  }

  formatearTamanoLogo(bytes: number): string {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }

  guardar() {
    if (!this.form.nombre.trim() || !this.form.codigo.trim()) {
      this.errorForm.set('El nombre y el código son obligatorios.');
      return;
    }

    this.guardando.set(true);
    this.errorForm.set('');
    const archivoLogo = this.archivoLogo();
    const data = {
      nombre: this.form.nombre.trim(),
      codigo: this.form.codigo.trim().toUpperCase(),
    };

    const marcaActual = this.marcaEditar();
    const req$ = marcaActual
      ? this.marcasService.actualizar(marcaActual.id, data.nombre, data.codigo)
      : this.marcasService.crear(data.nombre, data.codigo);
    const creandoMarca = !marcaActual;

    req$.subscribe({
      next: (marca) => {
        if (!archivoLogo) {
          this.guardando.set(false);
          this.modalAbierto.set(false);
          this.limpiarSeleccionLogo();
          this.cargar();
          return;
        }

        this.marcaEditar.set(marca);
        this.marcasService.subirLogo(marca.id, archivoLogo).subscribe({
          next: () => {
            this.guardando.set(false);
            this.modalAbierto.set(false);
            this.limpiarSeleccionLogo();
            this.cargar();
          },
          error: (err) => {
            this.guardando.set(false);
            this.errorForm.set(
              creandoMarca
                ? 'La marca se creó, pero el logo no se pudo subir. Vuelve a guardar para reintentar el logo.'
                : (err?.error?.message ??
                    'No se pudo completar la operación del logo.'),
            );
            this.cargar();
          },
        });
      },
      error: (err) => {
        this.guardando.set(false);
        this.errorForm.set(err?.error?.message ?? 'Error al guardar.');
      },
    });
  }

  private limpiarVistaPreviaLogo() {
    if (this.urlVistaPreviaLogo) {
      URL.revokeObjectURL(this.urlVistaPreviaLogo);
      this.urlVistaPreviaLogo = null;
    }
    this.vistaPreviaLogo.set(null);
  }

  eliminar(id: number) {
    if (!confirm('¿Eliminar esta marca? Solo es posible si no tiene productos.')) return;
    this.marcasService.eliminar(id).subscribe({
      next: () => this.cargar(),
      error: (err) => {
        this.cargar();
        alert(err?.error?.message ?? 'No se pudo eliminar.');
      },
    });
  }
}
