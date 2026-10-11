import { describe, expect, it } from 'vitest';
import { construirMetaPaginacion } from './paginacion.util.js';

describe('construirMetaPaginacion', () => {
  it('calcula correctamente totalPaginas con división exacta', () => {
    const meta = construirMetaPaginacion(100, 1, 25);
    expect(meta).toEqual({
      total: 100,
      pagina: 1,
      limite: 25,
      totalPaginas: 4,
    });
  });

  it('calcula correctamente totalPaginas con residuo', () => {
    const meta = construirMetaPaginacion(101, 2, 25);
    expect(meta).toEqual({
      total: 101,
      pagina: 2,
      limite: 25,
      totalPaginas: 5,
    });
  });

  it('devuelve totalPaginas 0 si total es 0', () => {
    const meta = construirMetaPaginacion(0, 1, 10);
    expect(meta).toEqual({
      total: 0,
      pagina: 1,
      limite: 10,
      totalPaginas: 0,
    });
  });
});
