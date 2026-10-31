import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject, Subject, of, throwError } from 'rxjs';
import { CatalogoComponent } from './catalogo.component';
import { ProductosService } from '../../core/services/productos.service';
import { MarcasService } from '../../core/services/marcas.service';
import { CategoriasService } from '../../core/services/categorias.service';
import { ColoresService } from '../../core/services/colores.service';

describe('Estado del catálogo', () => {
  const params = new BehaviorSubject(convertToParamMap({}));
  let buscar: ReturnType<typeof vi.fn>;
  let componente: CatalogoComponent;

  beforeEach(() => {
    params.next(convertToParamMap({}));
    buscar = vi.fn().mockReturnValue(of({ datos: [], meta: { total: 0, totalPaginas: 0 } }));
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { queryParamMap: params } },
        {
          provide: ProductosService,
          useValue: {
            productos: signal([]),
            meta: signal(null),
            cargando: signal(false),
            buscarTodos: buscar,
            facetas: () => of({ tallas: ['38', '39'], precioMax: 400 }),
          },
        },
        { provide: MarcasService, useValue: { buscarTodas: () => of([]) } },
        { provide: CategoriasService, useValue: { buscarTodas: () => of([]) } },
        { provide: ColoresService, useValue: { buscarTodos: () => of([]) } },
      ],
    });
    componente = TestBed.runInInjectionContext(() => new CatalogoComponent());
  });

  it('restaura enlaces antiguos y envía la talla y el orden al servidor', () => {
    params.next(
      convertToParamMap({
        marcaId: '2',
        genero: 'W',
        colorId: '3',
        talla: '38',
        orden: 'precio-desc',
      }),
    );
    componente.ngOnInit();
    expect(buscar).toHaveBeenCalledWith(
      expect.objectContaining({
        marcaIds: [2],
        generos: ['W'],
        colorIds: [3],
        talla: '38',
        orden: 'precio-desc',
        limite: 8,
      }),
    );
  });

  it('cancela una petición anterior al cambiar los filtros y permite reintentar un error', () => {
    const pendiente = new Subject<never>();
    const cancelar = vi.spyOn(pendiente, 'subscribe');
    buscar
      .mockReturnValueOnce(pendiente)
      .mockReturnValueOnce(throwError(() => new Error('Sin conexión')));
    componente.ngOnInit();
    const suscripcion = cancelar.mock.results[0].value;
    params.next(convertToParamMap({ marcaIds: '1,3' }));
    expect(suscripcion.closed).toBe(true);
    expect(componente.errorCarga()).toBe(true);
    componente.reintentar();
    expect(componente.errorCarga()).toBe(false);
    expect(buscar).toHaveBeenCalledTimes(3);
  });

  it('al cambiar una marca vuelve a la primera página y conserva las demás marcas', () => {
    params.next(convertToParamMap({ marcaIds: '1', pagina: '3' }));
    buscar.mockReturnValue(of({ datos: [], meta: { total: 24, totalPaginas: 3 } }));
    componente.ngOnInit();
    const navegar = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    componente.alternarMarca(3);
    expect(navegar).toHaveBeenCalledWith(
      [],
      expect.objectContaining({ queryParams: { marcaIds: '1,3' } }),
    );
    expect(componente.filtros().pagina).toBe(1);
  });

  it('limpiar todo elimina también los límites de precio y la categoría', () => {
    params.next(convertToParamMap({ precioMin: '100', precioMax: '250', categoriaId: '2' }));
    componente.ngOnInit();
    const navegar = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    componente.limpiarFiltros();
    expect(navegar).toHaveBeenCalledWith([], expect.objectContaining({ queryParams: {} }));
    expect(componente.filtros().precioMax).toBeUndefined();
    expect(componente.filtros().categoriaId).toBeUndefined();
  });

  it('expone filtros aplicados como chips removibles', () => {
    params.next(convertToParamMap({ marcaIds: '2', talla: '38', precioMin: '100' }));
    componente.ngOnInit();
    componente.marcas.set([{ id: 2, nombre: 'Adidas', codigo: 'AD', logo: null }]);

    expect(componente.filtrosAplicados().map((filtro) => filtro.etiqueta)).toEqual([
      'Adidas',
      'Talla 38',
      'S/ 100 – S/ 400',
    ]);
    const navegar = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const filtroMarca = componente.filtrosAplicados()[0];
    componente.quitarFiltroAplicado(filtroMarca);

    expect(componente.filtros().marcaIds).toEqual([]);
    expect(navegar).toHaveBeenCalledWith(
      [],
      expect.objectContaining({ queryParams: { talla: '38', precioMin: 100 } }),
    );
  });
});
