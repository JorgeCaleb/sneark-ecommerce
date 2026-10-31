import { of, Subject, throwError } from 'rxjs';
import { GruposModelosService, ModeloRelacionado } from '../../../core/services/grupos-modelos.service';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideIcons } from '@ng-icons/core';
import {
  lucideChevronLeft,
  lucideChevronRight,
  lucideHeart,
  lucideImage,
  lucideX,
} from '@ng-icons/lucide';
import { FavoritosService } from '../../../core/services/favoritos.service';
import { ProductoPublico } from '../../../core/services/productos.service';
import { ProductoCardComponent } from './producto-card.component';

function producto(id = 1): ProductoPublico {
  return {
    id,
    nombre: `Modelo ${id}`,
    grupoModeloId: 7,
    codigoModelo: 'TEST',
    descripcion: null,
    precio: 359,
    activo: true,
    creadoEn: '',
    actualizadoEn: '',
    marca: { id: 1, nombre: 'Adidas', codigo: 'AD', logo: null },
    categoria: { id: 1, nombre: 'Urbanas' },
    imagenes: [1, 2, 3].map((numero) => ({ id: numero, url: `/modelo-${id}-vista-${numero}.jpg` })),
    tallas: [
      {
        id: 1,
        genero: 'X',
        talla: '40',
        colorId: 1,
        color: { id: 1, nombre: 'Negro', codigo: '#242424' },
        disponible: true,
      },
    ],
  };
}

describe('Vista previa de la tarjeta de producto', () => {
  const buscarModelos = vi.fn();
  beforeEach(() => {
    buscarModelos.mockReset();
    TestBed.configureTestingModule({
      imports: [ProductoCardComponent],
      providers: [
        provideRouter([]),
        { provide: GruposModelosService, useValue: { buscarModelos } },
        provideIcons({ lucideHeart, lucideImage, lucideChevronLeft, lucideChevronRight, lucideX }),
        { provide: FavoritosService, useValue: { contiene: () => false, alternar: vi.fn() } },
      ],
    });
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
  });
  afterEach(() => vi.unstubAllGlobals());

  async function montar(datos = producto(), modelos = [producto(2), producto(3)]) {
    const fixture = TestBed.createComponent(ProductoCardComponent);
    fixture.componentRef.setInput('producto', datos);
    buscarModelos.mockReturnValue(of(modelos.filter((modelo) => modelo.activo)));
    await fixture.whenStable();
    fixture.componentInstance.entrarFoco();
    await fixture.whenStable();
    return fixture;
  }

  it('espera a que cargue la segunda foto y restaura la portada al salir', async () => {
    const fixture = await montar();
    const card = fixture.componentInstance;
    card.entrarPuntero({ pointerType: 'mouse' } as PointerEvent);
    expect(card.mostrarVista()).toBe(false);
    fixture.nativeElement.querySelector('.product-preview-photo').dispatchEvent(new Event('load'));
    await fixture.whenStable();
    expect(card.mostrarVista()).toBe(true);
    expect(
      fixture.nativeElement.querySelector('.product-photo').classList.contains('is-hidden'),
    ).toBe(true);
    card.salirPuntero();
    card.salirFoco({ currentTarget: fixture.nativeElement, relatedTarget: null } as FocusEvent);
    await fixture.whenStable();
    expect(card.expandida()).toBe(false);
    expect(
      fixture.nativeElement.querySelector('.product-photo').classList.contains('is-hidden'),
    ).toBe(false);
  });

  it('muestra primero el modelo actual y previsualiza otro modelo en la foto principal', async () => {
    const fixture = await montar();
    fixture.nativeElement
      .querySelector('.product-visual a')
      .dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    await fixture.whenStable();
    const miniaturas = fixture.nativeElement.querySelectorAll('.preview-thumbnail');
    expect(miniaturas).toHaveLength(3);
    expect(miniaturas[0].getAttribute('href')).toBe('/producto/1');
    expect(miniaturas[0].getAttribute('aria-current')).toBe('page');
    expect(miniaturas[0].classList.contains('is-hovered')).toBe(false);
    expect(miniaturas[1].getAttribute('href')).toBe('/producto/2');
    const miniatura = miniaturas[2];
    const pointerEnter = new Event('pointerenter');
    Object.defineProperty(pointerEnter, 'pointerType', { value: 'mouse' });
    miniaturas[1].dispatchEvent(pointerEnter);
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('.product-photo').getAttribute('src')).toBe(
      '/modelo-2-vista-1.jpg',
    );
    expect(miniaturas[1].classList.contains('is-hovered')).toBe(true);
    expect(miniaturas[0].classList.contains('is-hovered')).toBe(false);
    miniaturas[1].dispatchEvent(new Event('pointerleave'));
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('.product-photo').getAttribute('src')).toBe(
      '/modelo-1-vista-1.jpg',
    );
    expect(miniaturas[1].classList.contains('is-hovered')).toBe(false);
    miniatura.dispatchEvent(new FocusEvent('focus'));
    await fixture.whenStable();
    expect(miniatura.getAttribute('href')).toBe('/producto/3');
    expect(miniatura.querySelector('img').getAttribute('src')).toBe('/modelo-3-vista-1.jpg');
    expect(fixture.nativeElement.querySelector('.product-photo').getAttribute('src')).toBe(
      miniatura.querySelector('img').getAttribute('src'),
    );
    expect(miniatura.classList.contains('is-hovered')).toBe(true);
    expect(fixture.nativeElement.querySelector('.product-photo').getAttribute('src')).toBe(
      '/modelo-3-vista-1.jpg',
    );
    expect(fixture.componentInstance.fotoVista()?.url).toBe('/modelo-1-vista-2.jpg');
    fixture.nativeElement.querySelector('.product-preview-photo').dispatchEvent(new Event('load'));
    await fixture.whenStable();
    expect(fixture.componentInstance.mostrarVista()).toBe(true);
    expect(
      fixture.nativeElement.querySelector('.product-preview-photo').classList.contains('is-visible'),
    ).toBe(false);
    fixture.componentInstance.restaurarModelo();
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('.product-photo').getAttribute('src')).toBe(
      '/modelo-1-vista-1.jpg',
    );
    expect(
      fixture.nativeElement.querySelector('.product-preview-photo').classList.contains('is-visible'),
    ).toBe(true);
    miniatura.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await fixture.whenStable();
    expect(fixture.componentInstance.expandida()).toBe(false);
    expect(fixture.nativeElement.querySelector('.product-preview').inert).toBe(true);
  });

  it('conserva la portada si falla una foto alternativa', async () => {
    const fixture = await montar();
    fixture.componentInstance.entrarPuntero({ pointerType: 'mouse' } as PointerEvent);
    fixture.nativeElement.querySelector('.product-preview-photo').dispatchEvent(new Event('error'));
    await fixture.whenStable();
    expect(fixture.componentInstance.mostrarVista()).toBe(false);
    expect(fixture.nativeElement.querySelector('.product-photo').getAttribute('src')).toBe(
      '/modelo-1-vista-1.jpg',
    );
  });

  it('usa la imagen de respaldo cuando no hay fotos ni otros modelos', async () => {
    const datos = producto();
    datos.imagenes = [];
    const fixture = await montar(datos, []);
    expect(fixture.nativeElement.querySelector('.product-preview')).toBeNull();
    expect(fixture.nativeElement.querySelector('.product-photo').getAttribute('src')).toBe(
      'placeholder-shoe.svg',
    );
  });

  it('actualiza la foto y los modelos sugeridos al reutilizar una tarjeta', async () => {
    const fixture = await montar();
    fixture.componentRef.setInput('producto', producto(2));
    await fixture.whenStable();
    expect(fixture.componentInstance.fotoVista()?.url).toBe('/modelo-2-vista-2.jpg');
    expect(fixture.componentInstance.miniaturas().map((modelo) => modelo.id)).toEqual([3]);
  });

  it('excluye el modelo actual, los duplicados y los productos inactivos de la tira', async () => {
    const inactivo = { ...producto(4), activo: false };
    const fixture = await montar(producto(), [producto(), producto(2), producto(2), inactivo]);
    expect(fixture.componentInstance.miniaturas().map((modelo) => modelo.id)).toEqual([2]);
    expect(fixture.nativeElement.querySelectorAll('.preview-thumbnail')).toHaveLength(2);
    expect(
      [...fixture.nativeElement.querySelectorAll('.preview-thumbnail')].map((miniatura) =>
        miniatura.getAttribute('href'),
      ),
    ).toEqual(['/producto/1', '/producto/2']);
  });

  it('muestra las flechas solo cuando los modelos no caben en la tira', async () => {
    const modelos = Array.from({ length: 8 }, (_, indice) => producto(indice + 2));
    const fixture = await montar(producto(), modelos);
    const navigation = fixture.nativeElement.querySelector('.preview-navigation');
    Object.defineProperty(navigation, 'clientWidth', { configurable: true, value: 240 });

    fixture.componentInstance.actualizarDesplazamiento(navigation, 9);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('.preview-arrow')).toHaveLength(2);
    expect(fixture.nativeElement.querySelectorAll('.preview-thumbnail')).toHaveLength(9);
    expect(fixture.nativeElement.querySelector('.preview-thumbnail img').width).toBe(48);
    expect(fixture.nativeElement.querySelector('.preview-thumbnail img').height).toBe(48);

    Object.defineProperty(navigation, 'clientWidth', { configurable: true, value: 500 });
    fixture.componentInstance.actualizarDesplazamiento(navigation, 9);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('.preview-arrow')).toHaveLength(0);
  });

  it('no reutiliza las fotos del mismo modelo como miniaturas si no hay otros productos', async () => {
    const fixture = await montar(producto(), [producto()]);
    fixture.componentInstance.entrarPuntero({ pointerType: 'mouse' } as PointerEvent);
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('.product-preview-photo').getAttribute('src')).toBe(
      '/modelo-1-vista-2.jpg',
    );
    expect(fixture.nativeElement.querySelector('.product-preview')).toBeNull();
    expect(fixture.nativeElement.querySelectorAll('.preview-thumbnail')).toHaveLength(0);
  });

  it('no consulta otros modelos cuando la ficha no tiene un grupo', async () => {
    const fixture = await montar({ ...producto(), grupoModeloId: null });
    expect(buscarModelos).not.toHaveBeenCalled();
    expect(fixture.componentInstance.miniaturas()).toEqual([]);
  });

  it('descarta una respuesta pendiente al cambiar de grupo y permite reintentar errores', async () => {
    const fixture = await montar();
    const pendiente = new Subject<ModeloRelacionado[]>();
    buscarModelos.mockReturnValueOnce(pendiente);
    fixture.componentRef.setInput('producto', { ...producto(8), grupoModeloId: 8 });
    await fixture.whenStable();
    expect(fixture.componentInstance.miniaturas()).toEqual([]);
    expect(fixture.componentInstance.cargandoModelos()).toBe(true);
    buscarModelos.mockReturnValueOnce(throwError(() => new Error('Sin conexión')));
    fixture.componentRef.setInput('producto', { ...producto(9), grupoModeloId: 9 });
    await fixture.whenStable();
    expect(pendiente.observed).toBe(false);
    expect(fixture.componentInstance.errorModelos()).toBe(true);
    buscarModelos.mockReturnValueOnce(of([producto(10)]));
    fixture.nativeElement.querySelector('.preview-status button').click();
    await fixture.whenStable();
    expect(fixture.componentInstance.miniaturas().map((modelo) => modelo.id)).toEqual([10]);
    expect(fixture.componentInstance.errorModelos()).toBe(false);
  });

  it('usa identificadores distintos cuando el mismo producto aparece dos veces', async () => {
    const primera = await montar();
    const segunda = await montar();
    expect(primera.componentInstance.idVista).not.toBe(segunda.componentInstance.idVista);
  });
});
