import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { MarcasService } from '../../../core/services/marcas.service';
import { AdminMarcasComponent } from './admin-marcas.component';

describe('AdminMarcasComponent request errors', () => {
  let marcasService: {
    buscarTodas: ReturnType<typeof vi.fn>;
    crear: ReturnType<typeof vi.fn>;
    actualizar: ReturnType<typeof vi.fn>;
    subirLogo: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    marcasService = {
      buscarTodas: vi.fn().mockReturnValue(of([])),
      crear: vi.fn(),
      actualizar: vi.fn(),
      subirLogo: vi.fn(),
    };
  });

  it('muestra el conteo real de cada marca y lo refresca al cargar de nuevo', async () => {
    const adidas = { id: 2, nombre: 'Adidas', codigo: 'AD', logo: null };
    const nike = { id: 1, nombre: 'Nike', codigo: 'NK', logo: null };
    marcasService.buscarTodas
      .mockReturnValueOnce(of([{ ...adidas, _count: { productos: 0 } }, { ...nike, _count: { productos: 2 } }]))
      .mockReturnValueOnce(of([{ ...adidas, _count: { productos: 1 } }, { ...nike, _count: { productos: 2 } }]));
    await TestBed.configureTestingModule({
      imports: [AdminMarcasComponent],
      providers: [{ provide: MarcasService, useValue: marcasService }],
    }).compileComponents();
    const fixture = TestBed.createComponent(AdminMarcasComponent);
    fixture.detectChanges();
    const conteos = () => [...fixture.nativeElement.querySelectorAll('.marca-card__productos')]
      .map((elemento) => (elemento as HTMLElement).textContent?.replace(/\s+/g, ' ').trim());
    expect(conteos()).toEqual(['0 productos', '2 productos']);
    fixture.componentInstance.cargar();
    fixture.detectChanges();
    expect(conteos()).toEqual(['1 producto', '2 productos']);
  });

  it('no presenta un cero falso si la respuesta no contiene el conteo', async () => {
    marcasService.buscarTodas.mockReturnValue(of([{ id: 2, nombre: 'Adidas', codigo: 'AD', logo: null }]));
    await TestBed.configureTestingModule({
      imports: [AdminMarcasComponent],
      providers: [{ provide: MarcasService, useValue: marcasService }],
    }).compileComponents();
    const fixture = TestBed.createComponent(AdminMarcasComponent);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.marca-card__productos').textContent).toContain('—');
  });

  it('shows an error and clears loading when the brand list request fails', async () => {
    marcasService.buscarTodas.mockReturnValue(
      throwError(() => new Error('Brands unavailable')),
    );
    await TestBed.configureTestingModule({
      imports: [AdminMarcasComponent],
      providers: [{ provide: MarcasService, useValue: marcasService }],
    }).compileComponents();

    const fixture = TestBed.createComponent(AdminMarcasComponent);
    fixture.detectChanges();

    expect(fixture.componentInstance.cargando()).toBe(false);
    expect(fixture.componentInstance.errorCarga()).toBe(true);
    expect(fixture.nativeElement.textContent).toContain(
      'No se pudieron cargar las marcas.',
    );
  });

  it('explains that the brand was created when the logo upload fails', async () => {
    const marca = { id: 4, nombre: 'Nike', codigo: 'NK', logo: null };
    marcasService.crear.mockReturnValue(of(marca));
    marcasService.subirLogo.mockReturnValue(
      throwError(() => new Error('Cloudinary unavailable')),
    );

    await TestBed.configureTestingModule({
      imports: [AdminMarcasComponent],
      providers: [{ provide: MarcasService, useValue: marcasService }],
    }).compileComponents();

    const fixture = TestBed.createComponent(AdminMarcasComponent);
    const component = fixture.componentInstance;
    component.form = { nombre: 'Nike', codigo: 'NK' };
    component.archivoLogo.set(new File(['logo'], 'logo.png', { type: 'image/png' }));
    fixture.detectChanges();

    component.guardar();

    expect(component.marcaEditar()?.id).toBe(4);
    expect(component.errorForm()).toBe(
      'La marca se creó, pero el logo no se pudo subir. Vuelve a guardar para reintentar el logo.',
    );
    expect(marcasService.crear).toHaveBeenCalledOnce();
    expect(marcasService.subirLogo).toHaveBeenCalledWith(
      4,
      component.archivoLogo(),
    );
  });
});
