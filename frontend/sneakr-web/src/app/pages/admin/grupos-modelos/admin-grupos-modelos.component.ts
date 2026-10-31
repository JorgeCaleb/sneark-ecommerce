import { Component, DestroyRef, ElementRef, OnInit, ViewChild, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { NgIcon } from '@ng-icons/core';
import { Subscription } from 'rxjs';
import { GrupoModelo, GruposModelosService } from '../../../core/services/grupos-modelos.service';
import { PaginacionMeta, Producto, ProductosService } from '../../../core/services/productos.service';
import { PaginacionComponent } from '../../../shared/components/paginacion/paginacion.component';

@Component({
  selector: 'app-admin-grupos-modelos',
  standalone: true,
  imports: [FormsModule, RouterLink, NgIcon, PaginacionComponent],
  templateUrl: './admin-grupos-modelos.component.html',
  styleUrl: './admin-grupos-modelos.component.css',
})
export class AdminGruposModelosComponent implements OnInit {
  private readonly gruposService = inject(GruposModelosService);
  private readonly productosService = inject(ProductosService);
  private readonly destroyRef = inject(DestroyRef);
  private lecturaGrupos?: Subscription;
  private lecturaProductos?: Subscription;
  private botonFormulario?: HTMLElement;
  private campoNombre?: HTMLInputElement;
  private tituloProductos?: HTMLHeadingElement;
  private botonProductos?: HTMLElement;

  readonly grupos = signal<GrupoModelo[]>([]);
  readonly cargando = signal(false);
  readonly errorCarga = signal(false);
  readonly formularioAbierto = signal(false);
  readonly grupoEditar = signal<GrupoModelo | null>(null);
  readonly guardando = signal(false);
  readonly errorForm = signal('');
  readonly mensaje = signal('');
  readonly grupoSeleccionado = signal<GrupoModelo | null>(null);
  readonly productos = signal<Producto[]>([]);
  readonly metaProductos = signal<PaginacionMeta | null>(null);
  readonly cargandoProductos = signal(false);
  readonly errorProductos = signal(false);
  nombre = '';
  paginaProductos = 1;

  @ViewChild('nombreGrupo')
  private set nombreGrupo(elemento: ElementRef<HTMLInputElement> | undefined) {
    this.campoNombre = elemento?.nativeElement;
    this.campoNombre?.focus();
  }

  @ViewChild('tituloMiembros')
  private set tituloMiembros(elemento: ElementRef<HTMLHeadingElement> | undefined) {
    const titulo = elemento?.nativeElement;
    if (titulo !== this.tituloProductos) {
      this.tituloProductos = titulo;
      this.tituloProductos?.focus();
    }
  }

  ngOnInit() { this.cargar(); }

  cargar() {
    this.lecturaGrupos?.unsubscribe();
    this.cargando.set(true);
    this.errorCarga.set(false);
    this.lecturaGrupos = this.gruposService.buscarTodos().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (grupos) => {
        this.grupos.set(grupos);
        this.cargando.set(false);
        const seleccionado = this.grupoSeleccionado();
        if (seleccionado) this.grupoSeleccionado.set(grupos.find((g) => g.id === seleccionado.id) ?? null);
      },
      error: () => { this.errorCarga.set(true); this.cargando.set(false); },
    });
  }

  abrirFormulario(grupo: GrupoModelo | null, event?: Event) {
    if (this.guardando()) return;
    this.botonFormulario = event?.currentTarget as HTMLElement | undefined;
    this.grupoEditar.set(grupo);
    this.nombre = grupo?.nombre ?? '';
    this.errorForm.set('');
    this.mensaje.set('');
    this.formularioAbierto.set(true);
    this.campoNombre?.focus();
  }

  cerrarFormulario() {
    if (this.guardando()) return;
    this.formularioAbierto.set(false);
    this.botonFormulario?.focus();
  }

  guardar() {
    if (this.guardando()) return;
    const nombre = this.nombre.trim();
    if (!nombre || nombre.length > 100) {
      this.errorForm.set('Escribe un nombre de entre 1 y 100 caracteres.');
      return;
    }
    this.guardando.set(true);
    this.errorForm.set('');
    const editando = this.grupoEditar();
    const peticion = editando ? this.gruposService.actualizar(editando.id, nombre) : this.gruposService.crear(nombre);
    peticion.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (grupo) => {
        this.guardando.set(false);
        this.cerrarFormulario();
        this.mensaje.set(editando ? `Grupo «${grupo.nombre}» actualizado.` : `Grupo «${grupo.nombre}» creado. Ya puedes asignarlo a tus productos.`);
        if (this.grupoSeleccionado()?.id === grupo.id) this.grupoSeleccionado.set(grupo);
        this.cargar();
      },
      error: (err) => {
        this.guardando.set(false);
        const detalle = err?.error?.message;
        this.errorForm.set(Array.isArray(detalle) ? detalle.join(' ') : detalle ?? 'No se pudo guardar el grupo. Inténtalo otra vez.');
      },
    });
  }

  verProductos(grupo: GrupoModelo, pagina = 1, event?: Event) {
    this.lecturaProductos?.unsubscribe();
    this.grupoSeleccionado.set(grupo);
    this.paginaProductos = pagina;
    this.productos.set([]);
    this.metaProductos.set(null);
    this.cargandoProductos.set(true);
    this.errorProductos.set(false);
    if (event) {
      this.botonProductos = event.currentTarget as HTMLElement;
      this.tituloProductos?.focus();
    }
    this.lecturaProductos = this.productosService.buscarAdminPagina({
      grupoModeloId: grupo.id, estado: 'todos', pagina, limite: 10,
    }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (resultado) => {
        this.productos.set(resultado.datos);
        this.metaProductos.set(resultado.meta);
        this.cargandoProductos.set(false);
      },
      error: () => { this.errorProductos.set(true); this.cargandoProductos.set(false); },
    });
  }

  cambiarPagina(pagina: number) {
    const grupo = this.grupoSeleccionado();
    if (grupo && pagina >= 1 && pagina <= (this.metaProductos()?.totalPaginas ?? 1)) this.verProductos(grupo, pagina);
  }

  cerrarProductos() {
    this.lecturaProductos?.unsubscribe();
    this.grupoSeleccionado.set(null);
    this.productos.set([]);
    this.metaProductos.set(null);
    this.botonProductos?.focus();
  }

  imagenAlternativa(event: Event) {
    const imagen = event.target as HTMLImageElement;
    if (!imagen.src.endsWith('/placeholder-shoe.svg')) imagen.src = '/placeholder-shoe.svg';
  }
}
