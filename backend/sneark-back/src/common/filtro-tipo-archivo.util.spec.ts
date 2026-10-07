import { BadRequestException } from '@nestjs/common';
import { aceptarTipoArchivo } from './filtro-tipo-archivo.util.js';

describe('aceptarTipoArchivo', () => {
  const permitidos = ['image/png', 'image/jpeg'];

  it('acepta tipos de archivo permitidos', () => {
    const callback = vi.fn();

    aceptarTipoArchivo('image/png', permitidos, 'Formato no permitido', callback);

    expect(callback).toHaveBeenCalledWith(null, true);
  });

  it('rechaza otros tipos con una respuesta HTTP 400', () => {
    const callback = vi.fn();

    aceptarTipoArchivo('text/html', permitidos, 'Formato no permitido', callback);

    const error = callback.mock.calls[0][0];
    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getStatus()).toBe(400);
    expect((error as BadRequestException).message).toBe('Formato no permitido');
    expect(callback).toHaveBeenCalledWith(error, false);
  });
});
