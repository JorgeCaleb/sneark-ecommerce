import { publicIdDesdeUrlCloudinary } from './public-id-cloudinary.util.js';

describe('publicIdDesdeUrlCloudinary', () => {
  const carpeta = 'SOHO/productos/42';

  it('extrae el publicId con versión y extensión', () => {
    expect(
      publicIdDesdeUrlCloudinary(
        'https://res.cloudinary.com/demo/image/upload/v123/SOHO/productos/42/shoe.jpg',
        carpeta,
      ),
    ).toBe('SOHO/productos/42/shoe');
  });

  it('extrae el publicId sin segmento de versión', () => {
    expect(
      publicIdDesdeUrlCloudinary(
        'https://res.cloudinary.com/demo/image/upload/SOHO/productos/42/shoe.webp',
        carpeta,
      ),
    ).toBe('SOHO/productos/42/shoe');
  });

  it.each([
    null,
    'no es una URL',
    'https://example.com/demo/image/upload/SOHO/productos/42/shoe.jpg',
    'https://res.cloudinary.com/demo/image/upload/SOHO/productos/7/shoe.jpg',
    'https://res.cloudinary.com/demo/image/upload/SOHO/productos/42/',
  ])('retorna null para una URL inválida o fuera de la carpeta: %s', (url) => {
    expect(publicIdDesdeUrlCloudinary(url, carpeta)).toBeNull();
  });
});
