import { ServiceUnavailableException } from '@nestjs/common';
import { calcularCostoEnvio, DISTRITOS_ENVIO } from './envio.util.js';

describe('calcularCostoEnvio', () => {
  it('retorna 0 para La Esperanza (distrito con envío gratis)', () => {
    expect(calcularCostoEnvio('La Esperanza')).toBe(0);
  });

  it('retorna 15 para distritos con costo de envío', () => {
    expect(calcularCostoEnvio('Trujillo')).toBe(15);
    expect(calcularCostoEnvio('Moche')).toBe(15);
    expect(calcularCostoEnvio('Huanchaco')).toBe(15);
    expect(calcularCostoEnvio('Víctor Larco')).toBe(15);
    expect(calcularCostoEnvio('El Porvenir')).toBe(15);
    expect(calcularCostoEnvio('Florencia de Mora')).toBe(15);
  });

  it('expone todos los distritos de envío permitidos', () => {
    expect(DISTRITOS_ENVIO).toContain('La Esperanza');
    expect(DISTRITOS_ENVIO).toHaveLength(7);
  });

  it.each(['Fuera de cobertura', '', 'Lima'])(
    'rechaza un distrito no permitido (%s)',
    (distrito) => {
      expect(() => calcularCostoEnvio(distrito)).toThrow(
        ServiceUnavailableException,
      );
    },
  );
});
