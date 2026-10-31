import { ConflictException } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { generarSku, normalizarTalla } from './sku.util.js';

// La auditoría y la escritura usan la misma instantánea. Nunca se fusionan variantes.
export async function normalizarSkus(prisma: PrismaClient, aplicar = false) {
  return prisma.$transaction(
    async (tx) => {
      const variantes = await tx.tallaProducto.findMany({
        select: {
          id: true,
          productoId: true,
          genero: true,
          colorId: true,
          talla: true,
          tallaNumero: true,
          sku: true,
          producto: {
            select: {
              codigoModelo: true,
              marca: { select: { codigo: true } },
            },
          },
          color: { select: { codigo: true } },
        },
        orderBy: { id: 'asc' },
      });
      const identidades = new Map<string, number>();
      const skus = new Map<string, number>();
      const cambios: {
        id: number;
        tallaAnterior: string;
        talla: string;
        skuAnterior: string;
        sku: string;
      }[] = [];

      for (const variante of variantes) {
        const talla = normalizarTalla(variante.talla);
        const sku = generarSku(
          variante.producto.marca.codigo,
          variante.producto.codigoModelo,
          variante.genero,
          variante.color.codigo,
          talla,
        );
        const identidad = `${variante.productoId}:${variante.genero}:${variante.colorId}:${talla}`;
        const duplicada = identidades.get(identidad) ?? skus.get(sku);
        if (duplicada !== undefined) {
          throw new ConflictException(
            `Las variantes ${duplicada} y ${variante.id} producirían la misma identidad o SKU. Revisa sus referencias e inventario; no se modificó ninguna variante.`,
          );
        }
        identidades.set(identidad, variante.id);
        skus.set(sku, variante.id);
        if (
          variante.talla !== talla ||
          variante.sku !== sku ||
          Number(variante.tallaNumero) !== Number(talla)
        ) {
          cambios.push({
            id: variante.id,
            tallaAnterior: variante.talla,
            talla,
            skuAnterior: variante.sku,
            sku,
          });
        }
      }

      if (aplicar && cambios.length) {
        // Libera los códigos antiguos antes de asignar los nuevos. Ambos pasos
        // se confirman juntos; un error revierte incluso estos SKU temporales.
        const prefijoTemporal = `~${randomUUID()}-`;
        for (const cambio of cambios) {
          await tx.tallaProducto.update({
            where: { id: cambio.id },
            data: { sku: `${prefijoTemporal}${cambio.id}` },
          });
        }
        for (const cambio of cambios) {
          await tx.tallaProducto.update({
            where: { id: cambio.id },
            data: {
              talla: cambio.talla,
              tallaNumero: Number(cambio.talla),
              sku: cambio.sku,
            },
          });
        }
      }
      return { total: variantes.length, cambios, aplicado: aplicar };
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      timeout: 30_000,
    },
  );
}
