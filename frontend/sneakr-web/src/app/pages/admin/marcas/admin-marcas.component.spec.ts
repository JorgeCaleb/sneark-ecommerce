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
