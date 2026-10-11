import { validarApiUrlProduccion } from './api-url.service';

describe('validarApiUrlProduccion', () => {
  it('normalizes a trailing slash on a valid HTTPS API URL', () => {
    expect(validarApiUrlProduccion('https://api.example/api/')).toBe(
      'https://api.example/api',
    );
  });

  it.each([
    '',
    undefined,
    'http://api.example/api',
    'https://api.example',
    'https://user:password@api.example/api',
    'https://api.example/api?x=1',
    'https://localhost/api',
  ])('rejects invalid production URL %s', (url) => {
    expect(() => validarApiUrlProduccion(url)).toThrow();
  });
});
