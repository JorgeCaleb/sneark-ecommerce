import { CurrencyPipe, registerLocaleData } from '@angular/common';
import localeEsPe from '@angular/common/locales/es-PE';
import { MonedaPipe } from './moneda.pipe';

describe('MonedaPipe', () => {
  const pipe = new MonedaPipe();

  beforeAll(() => registerLocaleData(localeEsPe));

  it('formatea un número entero como el formato actual', () => {
    expect(pipe.transform(99)).toBe('S/\u00a099');
  });

  it('conserva decimales sin agregar ceros innecesarios', () => {
    expect(pipe.transform(99.9)).toBe('S/\u00a099.9');
  });

  it('formatea cero como importe', () => {
    expect(pipe.transform(0)).toBe('S/\u00a00');
  });

  it('acepta cadenas numéricas', () => {
    expect(pipe.transform('99.9')).toBe('S/\u00a099.9');
  });

  it.each([null, undefined, 'no es un número'])(
    'muestra un marcador para valores inválidos: %s',
    (valor) => {
      expect(pipe.transform(valor)).toBe('—');
    },
  );

  it('puede mantener dos decimales en el resumen administrativo', () => {
    expect(pipe.transform(99.9, true)).toBe('S/\u00a099.90');
  });

  it('confirma que CurrencyPipe cambia el formato usado por los componentes', () => {
    const currencyPipe = new CurrencyPipe('es-PE', 'PEN');

    expect(currencyPipe.transform(99.9)).toBe('S/\u00a099.90');
    expect(currencyPipe.transform(99.9)).not.toBe(pipe.transform(99.9));
  });
});
