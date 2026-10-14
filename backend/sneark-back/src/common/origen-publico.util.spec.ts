import { obtenerOrigenPublico } from './origen-publico.util.js';

describe('obtenerOrigenPublico', () => {
  it('usa el fallback local fuera de producción', () => {
    expect(
      obtenerOrigenPublico(undefined, 'FRONTEND_ORIGIN', false, 'http://localhost:4200'),
    ).toBe('http://localhost:4200');
  });

  it('exige un origen HTTPS en producción', () => {
    expect(() =>
      obtenerOrigenPublico(undefined, 'BACKEND_URL', true),
    ).toThrow('BACKEND_URL es obligatorio');
    expect(() =>
      obtenerOrigenPublico('http://api.example', 'BACKEND_URL', true),
    ).toThrow('BACKEND_URL debe usar HTTPS');
    expect(() =>
      obtenerOrigenPublico('https://localhost:3000', 'BACKEND_URL', true),
    ).toThrow('BACKEND_URL no puede apuntar a localhost');
  });

  it('rechaza rutas para que el valor configurado sea un solo origen', () => {
    expect(() =>
      obtenerOrigenPublico(
        'https://shop.example/store',
        'FRONTEND_ORIGIN',
        true,
      ),
    ).toThrow('FRONTEND_ORIGIN debe contener solo un origen HTTP(S)');
  });
});
