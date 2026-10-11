import { ServiceUnavailableException } from '@nestjs/common';
import { calcularCostoEnvio, DISTRITOS_ENVIO } from './envio.util.js';

describe('calcularCostoEnvio', () => {
  it('exposes the configured delivery districts and makes La Esperanza free by default', () => {
    expect(DISTRITOS_ENVIO).toContain('La Esperanza');
    expect(calcularCostoEnvio('La Esperanza', {})).toBe(0);
    expect(calcularCostoEnvio('Trujillo', {})).toBe(15);
  });

  it('supports a configured free district and a configured flat rate', () => {
    expect(
      calcularCostoEnvio('Moche', {
        DELIVERY_FREE_DISTRICT: 'Moche',
        DELIVERY_FLAT_RATE_PEN: '23.50',
      }),
    ).toBe(0);
    expect(
      calcularCostoEnvio('Trujillo', {
        DELIVERY_FREE_DISTRICT: 'Moche',
        DELIVERY_FLAT_RATE_PEN: '23.50',
      }),
    ).toBe(23.5);
  });

  it.each(['Fuera de cobertura', ''])(
    'rejects an unsupported district (%s)',
    (distrito) => {
      expect(() => calcularCostoEnvio(distrito, {})).toThrow(
        ServiceUnavailableException,
      );
    },
  );

  it.each(['-1', 'NaN', '100000000'])(
    'rejects an invalid flat rate (%s)',
    (tarifa) => {
      expect(() =>
        calcularCostoEnvio('Trujillo', {
          DELIVERY_FLAT_RATE_PEN: tarifa,
        }),
      ).toThrow(ServiceUnavailableException);
    },
  );
});
