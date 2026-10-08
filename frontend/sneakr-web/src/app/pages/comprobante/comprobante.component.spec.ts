import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { Pedido, PedidosService } from '../../core/services/pedidos.service';
import { ComprobanteComponent } from './comprobante.component';

describe('ComprobanteComponent', () => {
  let buscarPorId: ReturnType<typeof vi.fn>;
  let subirComprobante: ReturnType<typeof vi.fn>;
  let router: { navigate: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    buscarPorId = vi.fn();
    subirComprobante = vi.fn();
    router = { navigate: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        {
          provide: PedidosService,
          useValue: { buscarPorId, subirComprobante },
        },
        { provide: Router, useValue: router },
      ],
    });
  });

  it('reloads on id changes and ignores a late response for the previous order', () => {
    const firstResponse = new Subject<Pedido>();
    const secondResponse = new Subject<Pedido>();
    buscarPorId
      .mockReturnValueOnce(firstResponse)
      .mockReturnValueOnce(secondResponse);
    const component = TestBed.runInInjectionContext(
      () => new ComprobanteComponent(),
    );

    component.id = '10';
    component.ngOnChanges();
    component.id = '11';
    component.ngOnChanges();

    secondResponse.next({
      id: 11,
      estado: 'PENDIENTE',
      comprobante: null,
    } as Pedido);
    secondResponse.complete();
    firstResponse.next({
      id: 10,
      estado: 'PENDIENTE',
      comprobante: null,
    } as Pedido);
    firstResponse.complete();

    expect(buscarPorId).toHaveBeenNthCalledWith(1, 10);
    expect(buscarPorId).toHaveBeenNthCalledWith(2, 11);
    expect(component.pedido()?.id).toBe(11);
    expect(component.cargando()).toBe(false);
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('clears the previous file if a newly selected file has an invalid type', () => {
    const component = TestBed.runInInjectionContext(
      () => new ComprobanteComponent(),
    );
    const previousFile = new File(['valid'], 'receipt.png', {
      type: 'image/png',
    });
    const invalidFile = new File(['invalid'], 'notes.txt', {
      type: 'text/plain',
    });
    const input = document.createElement('input');
    input.type = 'file';
    Object.defineProperty(input, 'files', {
      value: [invalidFile],
      configurable: true,
    });
    component.archivo.set(previousFile);
    component.preview.set('data:image/png;base64,previous');

    component.onArchivoSeleccionado({ target: input } as unknown as Event);
    expect(component.error()).toContain('Solo se permiten');
    component.enviar();

    expect(component.archivo()).toBeNull();
    expect(component.preview()).toBeNull();
    expect(input.value).toBe('');
    expect(subirComprobante).not.toHaveBeenCalled();
    expect(component.error()).toContain('seleccioná una imagen');
  });

  it('clears the previous file if a newly selected file exceeds the size limit', () => {
    const component = TestBed.runInInjectionContext(
      () => new ComprobanteComponent(),
    );
    const previousFile = new File(['valid'], 'receipt.png', {
      type: 'image/png',
    });
    const oversizedFile = new File(['x'], 'large.png', {
      type: 'image/png',
    });
    Object.defineProperty(oversizedFile, 'size', {
      value: 10 * 1024 * 1024 + 1,
    });
    const input = document.createElement('input');
    input.type = 'file';
    Object.defineProperty(input, 'files', {
      value: [oversizedFile],
      configurable: true,
    });
    component.archivo.set(previousFile);
    component.preview.set('data:image/png;base64,previous');

    component.onArchivoSeleccionado({ target: input } as unknown as Event);
    expect(component.error()).toContain('no puede superar 10MB');
    component.enviar();

    expect(component.archivo()).toBeNull();
    expect(component.preview()).toBeNull();
    expect(input.value).toBe('');
    expect(subirComprobante).not.toHaveBeenCalled();
    expect(component.error()).toContain('seleccioná una imagen');
  });
});
