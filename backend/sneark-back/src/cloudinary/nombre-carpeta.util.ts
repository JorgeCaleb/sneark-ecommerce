import { BadRequestException } from '@nestjs/common';

export function nombreCarpetaCloudinary(nombre: string): string {
  const slug = nombre
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  if (!slug) {
    throw new BadRequestException(
      'El nombre debe contener letras o números para crear la carpeta de imágenes',
    );
  }

  return slug;
}
