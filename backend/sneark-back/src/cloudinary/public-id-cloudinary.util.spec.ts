import { publicIdDesdeUrlCloudinary } from './public-id-cloudinary.util.js';

describe('publicIdDesdeUrlCloudinary', () => {
  const carpeta = 'sneark/comprobantes/42';

  it('extracts the public ID with a version and extension', () => {
    expect(
      publicIdDesdeUrlCloudinary(
        'https://res.cloudinary.com/demo/image/upload/v123/sneark/comprobantes/42/receipt.jpg',
        carpeta,
      ),
    ).toBe('sneark/comprobantes/42/receipt');
  });

  it('extracts the public ID without a version segment', () => {
    expect(
      publicIdDesdeUrlCloudinary(
        'https://res.cloudinary.com/demo/image/upload/sneark/comprobantes/42/receipt.webp',
        carpeta,
      ),
    ).toBe('sneark/comprobantes/42/receipt');
  });

  it.each([
    null,
    'not a URL',
    'https://example.com/demo/image/upload/sneark/comprobantes/42/receipt.jpg',
    'https://res.cloudinary.com/demo/image/upload/sneark/comprobantes/7/receipt.jpg',
    'https://res.cloudinary.com/demo/image/upload/sneark/comprobantes/42/',
  ])('returns null for an invalid or out-of-folder URL: %s', (url) => {
    expect(publicIdDesdeUrlCloudinary(url, carpeta)).toBeNull();
  });
});
