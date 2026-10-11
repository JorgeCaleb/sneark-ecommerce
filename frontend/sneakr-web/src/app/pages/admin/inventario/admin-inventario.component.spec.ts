import { TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { of, throwError } from 'rxjs';
import { ProductosService } from '../../../core/services/productos.service';
import { AdminInventarioComponent } from './admin-inventario.component';

describe('AdminInventarioComponent', () => {
  let productosService: {
    buscarVariantesInventario: ReturnType<typeof vi.fn>;
    actualizarStockTalla: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    productosService = {
      buscarVariantesInventario: vi.fn().mockReturnValue(
        of({
          datos: [
            {
              id: 12,
              genero: 'W',
              talla: '38',
              stock: 3,
              sku: 'NK-AF1-W-WH-38',
              color: { id: 4, nombre: 'Blanco', codigo: 'WH' },
              producto: {
                id: 7,
                nombre: 'Air Force 1',
                marca: 'Nike',
                imagen: null,
              },
            },
          ],
          meta: { total: 1, pagina: 1, limite: 25, totalPaginas: 1 },
        }),
      ),
      actualizarStockTalla: vi.fn().mockReturnValue(of({ id: 12, stock: 4 })),
    };
    await TestBed.configureTestingModule({
      imports: [AdminInventarioComponent],
      providers: [
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { data: { soloStockBajo: true } } },
        },
        { provide: ProductosService, useValue: productosService },
      ],
    }).compileComponents();
  });

  it('requests the low-stock threshold and renders active variants', () => {
    const fixture = TestBed.createComponent(AdminInventarioComponent);
    fixture.detectChanges();

    expect(productosService.buscarVariantesInventario).toHaveBeenCalledWith(
      1,
      25,
      '',
      'bajo',
    );
    expect(fixture.nativeElement.textContent).toContain('Stock bajo');
    expect(fixture.nativeElement.textContent).toContain('NK-AF1-W-WH-38');
  });

  it('updates stock using the existing product and variant identifiers', () => {
    const fixture = TestBed.createComponent(AdminInventarioComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    const variante = component.variantes()[0];
    component.cambiarStock(variante.id, 4);

    component.guardarStock(variante);

    expect(productosService.actualizarStockTalla).toHaveBeenCalledWith(
      7,
      12,
      4,
      3,
    );
    expect(component.guardandoIds().has(12)).toBe(false);
  });

  it('reloads the latest stock after a concurrent update conflict', () => {
    productosService.actualizarStockTalla.mockReturnValue(
      throwError(() => ({
        status: 409,
        error: {
          message: 'El stock cambió desde que se cargó.',
          stockActual: 2,
        },
      })),
    );
    const fixture = TestBed.createComponent(AdminInventarioComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    productosService.buscarVariantesInventario.mockReturnValue(
      of({
        datos: [
          {
            ...component.variantes()[0],
            stock: 2,
          },
        ],
        meta: { total: 1, pagina: 1, limite: 25, totalPaginas: 1 },
      }),
    );
    const variante = component.variantes()[0];
    component.cambiarStock(variante.id, 4);

    component.guardarStock(variante);

    expect(productosService.buscarVariantesInventario).toHaveBeenCalledTimes(2);
    expect(component.stockDraft()[variante.id]).toBe(2);
    expect(component.erroresStock()[variante.id]).toBe(
      'El stock cambió desde que se cargó.',
    );
  });

  it('preserva los borradores de las demás filas al guardar una fila', () => {
    productosService.buscarVariantesInventario.mockReturnValue(
      of({
        datos: [
          {
            id: 12,
            genero: 'W',
            talla: '38',
            stock: 3,
            sku: 'NK-AF1-W-WH-38',
            color: { id: 4, nombre: 'Blanco', codigo: 'WH' },
            producto: { id: 7, nombre: 'Air Force 1', marca: 'Nike', imagen: null },
          },
          {
            id: 13,
            genero: 'M',
            talla: '40',
            stock: 5,
            sku: 'NK-AF1-M-WH-40',
            color: { id: 4, nombre: 'Blanco', codigo: 'WH' },
            producto: { id: 7, nombre: 'Air Force 1', marca: 'Nike', imagen: null },
          },
        ],
        meta: { total: 2, pagina: 1, limite: 25, totalPaginas: 1 },
      }),
    );
    const fixture = TestBed.createComponent(AdminInventarioComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;

    // Modificar borradores en ambas filas
    component.cambiarStock(12, 4);
    component.cambiarStock(13, 9);

    // Al guardar la fila 12, el servicio recarga y devuelve la fila 12 con stock 4 y la 13 con su stock original 5
    productosService.buscarVariantesInventario.mockReturnValue(
      of({
        datos: [
          {
            id: 12,
            genero: 'W',
            talla: '38',
            stock: 4,
            sku: 'NK-AF1-W-WH-38',
            color: { id: 4, nombre: 'Blanco', codigo: 'WH' },
            producto: { id: 7, nombre: 'Air Force 1', marca: 'Nike', imagen: null },
          },
          {
            id: 13,
            genero: 'M',
            talla: '40',
            stock: 5,
            sku: 'NK-AF1-M-WH-40',
            color: { id: 4, nombre: 'Blanco', codigo: 'WH' },
            producto: { id: 7, nombre: 'Air Force 1', marca: 'Nike', imagen: null },
          },
        ],
        meta: { total: 2, pagina: 1, limite: 25, totalPaginas: 1 },
      }),
    );

    // Guardar solo la fila 12
    component.guardarStock(component.variantes()[0]);

    // La fila 12 tiene el stock guardado (4) y la fila 13 mantiene su borrador no guardado (9)
    expect(component.stockDraft()[12]).toBe(4);
    expect(component.stockDraft()[13]).toBe(9);
  });
});

