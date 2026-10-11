import { publicIdDesdeUrlCloudinary } from './public-id-cloudinary.util.js';

describe('publicIdDesdeUrlCloudinary', () => {
  const carpeta = 'SOHO/productos/42';

  it('extracts the public ID with a version and extension', () => {
    expect(
      publicIdDesdeUrlCloudinary(
        'https://res.cloudinary.com/demo/image/upload/v123/SOHO/productos/42/shoe.jpg',
        carpeta,
      ),
    ).toBe('SOHO/productos/42/shoe');
  });

  it('extracts the public ID without a version segment', () => {
    expect(
      publicIdDesdeUrlCloudinary(
        'https://res.cloudinary.com/demo/image/upload/SOHO/productos/42/shoe.webp',
        carpeta,
      ),
    ).toBe('SOHO/productos/42/shoe');
  });

  it.each([
    null,
    'not a URL',
    'https://example.com/demo/image/upload/SOHO/productos/42/shoe.jpg',
    'https://res.cloudinary.com/demo/image/upload/SOHO/productos/7/shoe.jpg',
    'https://res.cloudinary.com/demo/image/upload/SOHO/productos/42/',
  ])('returns null for an invalid or out-of-folder URL: %s', (url) => {
    expect(publicIdDesdeUrlCloudinary(url, carpeta)).toBeNull();
  });
});
