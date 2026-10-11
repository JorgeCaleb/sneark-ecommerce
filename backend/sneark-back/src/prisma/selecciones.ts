import { Prisma } from '@prisma/client';

export const INCLUDE_PRODUCTO_RESUMEN = {
  imagenes: {
    take: 1,
    orderBy: { id: 'asc' },
    select: { url: true },
  },
  marca: { select: { nombre: true } },
} satisfies Prisma.ProductoInclude;
