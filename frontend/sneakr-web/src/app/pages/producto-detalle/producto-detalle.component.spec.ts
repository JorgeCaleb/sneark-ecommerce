import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { Observable, Subject, of, throwError } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { Carrito, CarritoService } from '../../core/services/carrito.service';
import { FavoritosService } from '../../core/services/favoritos.service';
import { GruposModelosService } from '../../core/services/grupos-modelos.service';
import { ProductoPublico, ProductosService } from '../../core/services/productos.service';
import { ProductoDetalleComponent } from './producto-detalle.component';

function producto(id = 1): ProductoPublico {
  return {
    id,
    nombre: `Modelo ${id}`,
    codigoModelo: `REF${id}`,
    grupoModeloId: 7,
    descripcion: 'Descripción real',
    precio: 299,
    activo: true,
    creadoEn: '',
    actualizadoEn: '',
    marca: { id: 1, nombre: 'Marca', codigo: 'MAR', logo: null },
    categoria: { id: 1, nombre: 'Zapatillas' },
    imagenes: [
      { id: 1, url: 'uno.png' },
      { id: 2, url: 'dos.png' },
    ],
    tallas: [
      {
        id: 11,
        genero: 'M',
        colorId: 1,
        color: { id: 1, nombre: 'Blanco', codigo: 'WH' },
        talla: '38',
        disponible: false,
      },
      {
        id: 12,
        genero: 'M',
        colorId: 2,
        color: { id: 2, nombre: 'Negro', codigo: 'BK' },
        talla: '39',
        disponible: true,
      },
      {
        id: 13,
        genero: 'W',
        colorId: 1,
        color: { id: 1, nombre: 'Blanco', codigo: 'WH' },
        talla: '37.5',
        disponible: true,
      },
    ],
  };
}
function setup() {
  const productos = {
    buscarPorId: vi.fn((_id: number) => of(producto(_id))),
    buscarPagina: vi.fn(() => of({ datos: [] as ProductoPublico[] })),
  };
  const carrito = {
    agregar: vi.fn<(talla: number, cantidad: number) => Observable<Carrito>>(() =>
      of({} as Carrito),
    ),
  };
  const auth = { estaAutenticado: vi.fn(() => true) };
  const favoritos = { contiene: vi.fn(() => false), alternar: vi.fn() };
  const router = { navigate: vi.fn() };
  const grupos = { buscarModelos: vi.fn(() => of([producto(1), producto(2)])) };
  TestBed.configureTestingModule({
    providers: [
      { provide: ProductosService, useValue: productos },
      { provide: CarritoService, useValue: carrito },
      { provide: AuthService, useValue: auth },
      { provide: FavoritosService, useValue: favoritos },
      { provide: Router, useValue: router },
      { provide: GruposModelosService, useValue: grupos },
    ],
  });
  const component = TestBed.runInInjectionContext(() => new ProductoDetalleComponent());
  component.id = '1';
  return { component, productos, carrito, auth, favoritos, router, grupos };
}

describe('ProductoDetalleComponent', () => {
  it('no mezcla fichas de otros grupos o de la misma marca cuando falta un grupo', () => {
    const { component, productos } = setup();
    productos.buscarPorId.mockReturnValueOnce(of({ ...producto(), grupoModeloId: null }));
    component.ngOnChanges();
    expect(productos.buscarPagina).not.toHaveBeenCalled();
    expect(component.relacionados()).toEqual([]);
  });
  it('carga las miniaturas de todo el grupo al abrir la ficha', () => {
    const { component, grupos } = setup();
    component.ngOnChanges();
    expect(grupos.buscarModelos).toHaveBeenCalledWith(7);
    expect(component.modelosGrupo().map((modelo) => modelo.id)).toEqual([1, 2]);
    expect(component.cargandoModelos()).toBe(false);
  });
  it('abre el color elegido en la tarjeta y descarta un color inexistente', () => {
    const { component } = setup();
    component.colorId = '1';
    component.ngOnChanges();
    expect(component.generoSeleccionado()).toBe('W');
    expect(component.colorSeleccionadoId()).toBe(1);
    expect(component.tallaSeleccionada()).toBeNull();
    component.colorId = '999';
    component.ngOnChanges();
    expect(component.colorSeleccionadoId()).toBe(2);
  });
  it('cancels the previous product and related requests when reusing the route', () => {
    const { component, productos } = setup();
    const first = new Subject<ProductoPublico>(),
      second = new Subject<ProductoPublico>();
    productos.buscarPorId.mockReturnValueOnce(first).mockReturnValueOnce(second);
    component.ngOnChanges();
    component.id = '2';
    component.ngOnChanges();
    expect(first.observed).toBe(false);
    second.next(producto(2));
    first.next(producto(1));
    expect(component.producto()?.id).toBe(2);
    expect(component.cargando()).toBe(false);
    const related = new Subject<{ datos: ProductoPublico[] }>();
    productos.buscarPagina.mockReturnValueOnce(related);
    component.cargarRelacionados();
    component.id = '3';
    component.ngOnChanges();
    related.next({ datos: [producto(9)] });
    expect(related.observed).toBe(false);
    expect(component.relacionados()).toEqual([]);
  });
  it('selects a stocked variant group without selecting a size, and clears size and quantity on changes', () => {
    const { component } = setup();
    component.ngOnChanges();
    expect(component.generoSeleccionado()).toBe('M');
    expect(component.tieneVariosColores()).toBe(true);
    expect(component.colorSeleccionadoId()).toBe(2);
    expect(component.tallaSeleccionada()).toBeNull();
    component.seleccionarTalla(component.tallasDisponibles()[0]);
    component.incrementar();
    expect(component.cantidad()).toBe(2);
    component.seleccionarGenero('W');
    expect(component.colorSeleccionadoId()).toBe(1);
    expect(component.tallaSeleccionada()).toBeNull();
    expect(component.cantidad()).toBe(1);
    expect(component.tallasDisponibles()[0].talla).toBe('37.5');
    component.seleccionarTalla(producto().tallas[1]);
    expect(component.tallaSeleccionada()).toBeNull();
  });
  it('rejects out-of-stock sizes and never sends a cart request before valid selection', () => {
    const { component, carrito } = setup();
    component.ngOnChanges();
    component.agregarAlCarrito();
    expect(component.error()).toContain('Selecciona una talla');
    component.seleccionarColor(1);
    component.seleccionarTalla(component.tallasDisponibles()[0]);
    expect(component.tallaSeleccionada()).toBeNull();
    expect(carrito.agregar).not.toHaveBeenCalled();
  });
  it('submits the selected variant and quantity once, while pending, and exposes server stock errors', () => {
    const { component, carrito } = setup();
    const pending = new Subject<Carrito>();
    carrito.agregar.mockReturnValueOnce(pending);
    component.ngOnChanges();
    component.seleccionarTalla(component.tallasDisponibles()[0]);
    component.incrementar();
    component.agregarAlCarrito();
    component.agregarAlCarrito();
    component.seleccionarGenero('W');
    expect(carrito.agregar).toHaveBeenCalledExactlyOnceWith(12, 2);
    expect(component.generoSeleccionado()).toBe('M');
    expect(component.agregando()).toBe(true);
    pending.error({ error: { message: 'No hay unidades suficientes.' } });
    expect(component.error()).toBe('No hay unidades suficientes.');
    expect(component.agregando()).toBe(false);
    component.agregarAlCarrito();
    expect(component.mensajeExito()).toBe(true);
  });
  it('does not let a late cart result modify another product', () => {
    const { component, carrito } = setup();
    const pending = new Subject<Carrito>();
    carrito.agregar.mockReturnValueOnce(pending);
    component.ngOnChanges();
    component.seleccionarTalla(component.tallasDisponibles()[0]);
    component.agregarAlCarrito();
    component.id = '2';
    component.ngOnChanges();
    pending.next({} as Carrito);
    expect(component.mensajeExito()).toBe(false);
    expect(component.agregando()).toBe(false);
  });
  it('redirects an anonymous shopper to login after a valid selection', () => {
    const { component, auth, carrito, router } = setup();
    auth.estaAutenticado.mockReturnValue(false);
    component.ngOnChanges();
    component.seleccionarTalla(component.tallasDisponibles()[0]);
    component.agregarAlCarrito();
    expect(router.navigate).toHaveBeenCalledWith(['/auth/login']);
    expect(carrito.agregar).not.toHaveBeenCalled();
  });
  it('keeps load errors recoverable and distinguishes missing or invalid product ids', () => {
    const { component, productos } = setup();
    productos.buscarPorId.mockReturnValueOnce(throwError(() => ({ status: 503 })));
    component.ngOnChanges();
    expect(component.errorCarga()).toContain('No pudimos');
    component.cargarProducto();
    expect(component.producto()?.id).toBe(1);
    productos.buscarPorId.mockReturnValueOnce(throwError(() => ({ status: 404 })));
    component.cargarProducto();
    expect(component.noEncontrado()).toBe(true);
    component.id = 'invalid';
    component.ngOnChanges();
    expect(component.noEncontrado()).toBe(true);
    expect(productos.buscarPorId).toHaveBeenCalledTimes(3);
  });
  it('uses the shared favorite service, real image count and related items excluding the current product', () => {
    const { component, favoritos, productos } = setup();
    productos.buscarPagina.mockReturnValueOnce(
      of({ datos: [producto(1), producto(2), producto(3), producto(4), producto(5)] }),
    );
    component.ngOnChanges();
    component.toggleFavorito();
    expect(productos.buscarPagina).toHaveBeenCalledWith({ limite: 5, grupoModeloId: 7 });
    expect(favoritos.alternar).toHaveBeenCalledWith(component.producto());
    expect(component.relacionados().map((p) => p.id)).toEqual([2, 3, 4, 5]);
    component.seleccionarImagen(1);
    expect(component.imagenesComplementarias()[0].index).toBe(0);
    component.seleccionarImagen(99);
    expect(component.imagenActiva()).toBe(1);
  });
});
