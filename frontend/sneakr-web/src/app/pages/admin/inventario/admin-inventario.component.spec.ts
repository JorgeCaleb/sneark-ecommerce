import { TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { of } from 'rxjs';
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

    expect(productosService.actualizarStockTalla).toHaveBeenCalledWith(7, 12, 4);
    expect(component.guardandoIds().has(12)).toBe(false);
  });
});
