import { BadRequestException } from '@nestjs/common';
import { nombreCarpetaCloudinary } from './nombre-carpeta.util.js';

describe('nombreCarpetaCloudinary', () => {
  it('normaliza nombres para usarlos como carpetas legibles', () => {
    expect(nombreCarpetaCloudinary(' Nike Air Max 90 — Rojo ')).toBe(
      'nike-air-max-90-rojo',
    );
    expect(nombreCarpetaCloudinary('Nike Perú')).toBe('nike-peru');
  });

  it('rechaza nombres sin letras ni números', () => {
    expect(() => nombreCarpetaCloudinary('🔥!!!')).toThrow(BadRequestException);
  });
});
