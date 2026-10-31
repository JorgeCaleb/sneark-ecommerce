import { PrismaClient } from '@prisma/client';
import { normalizarSkus } from './normalizar-skus.js';

function variante(id: number, talla: string, sku: string) {
  return {
    id, productoId: 3, genero: 'M' as const, colorId: 5, talla,
    tallaNumero: Number(talla), sku, stock: 12,
    producto: { codigoModelo: 'AF1', marca: { codigo: 'NK' } },
    color: { codigo: 'BK' },
  };
}

function basePruebas(iniciales: ReturnType<typeof variante>[]) {
  let filas = structuredClone(iniciales);
  const update = vi.fn(async ({ where, data }) => {
    if (filas.some((fila) => fila.id !== where.id && fila.sku === data.sku)) {
      throw new Error('SKU duplicado');
    }
    const fila = filas.find((fila) => fila.id === where.id)!;
    Object.assign(fila, data);
    return fila;
  });
  const $transaction = vi.fn(async (callback) => {
    const respaldo = structuredClone(filas);
    try {
      return await callback({
        tallaProducto: { findMany: vi.fn(async () => structuredClone(filas)), update },
      });
    } catch (error) {
      filas = respaldo;
      throw error;
    }
  });
  return {
    prisma: { $transaction } as unknown as PrismaClient,
    update, filas: () => filas,
  };
}

describe('Normalización de SKU existentes', () => {
  it('audita sin modificar datos y convierte medias tallas y ceros iniciales', async () => {
    const iniciales = [
      variante(1, '3.5', 'NK-AF1-M-BK-35'),
      variante(2, '06.0', 'NK-AF1-M-BK-06'),
    ];
    const base = basePruebas(iniciales);
    await expect(normalizarSkus(base.prisma)).resolves.toEqual({
      total: 2, aplicado: false,
      cambios: [
        { id: 1, tallaAnterior: '3.5', talla: '3.5', skuAnterior: 'NK-AF1-M-BK-35', sku: 'NK-AF1-M-BK-3P5' },
        { id: 2, tallaAnterior: '06.0', talla: '6', skuAnterior: 'NK-AF1-M-BK-06', sku: 'NK-AF1-M-BK-6' },
      ],
    });
    expect(base.update).not.toHaveBeenCalled();
    expect(base.filas()).toEqual(iniciales);
  });

  it('libera códigos antiguos antes de reasignar, conserva identificadores y stock y es idempotente', async () => {
    const base = basePruebas([
      variante(2, '35', 'CODIGO-ANTERIOR'),
      variante(1, '3.5', 'NK-AF1-M-BK-35'),
    ]);
    await normalizarSkus(base.prisma, true);
    expect(base.filas()).toEqual([
      variante(2, '35', 'NK-AF1-M-BK-35'),
      variante(1, '3.5', 'NK-AF1-M-BK-3P5'),
    ]);
    for (const [{ data }] of base.update.mock.calls) {
      expect(Object.keys(data).every((clave) => ['sku', 'talla', 'tallaNumero'].includes(clave))).toBe(true);
    }
    base.update.mockClear();
    await expect(normalizarSkus(base.prisma, true)).resolves.toMatchObject({ cambios: [] });
    expect(base.update).not.toHaveBeenCalled();
  });

  it.each([false, true])('detiene tallas equivalentes sin fusionar stock (aplicar: %s)', async (aplicar) => {
    const iniciales = [variante(1, '06', 'A'), variante(2, '6.0', 'B')];
    const base = basePruebas(iniciales);
    await expect(normalizarSkus(base.prisma, aplicar)).rejects.toThrow('Las variantes 1 y 2');
    expect(base.update).not.toHaveBeenCalled();
    expect(base.filas()).toEqual(iniciales);
  });

  it('detecta SKU finales repetidos entre productos antes de cualquier escritura', async () => {
    const otra = { ...variante(2, '3.5', 'B'), productoId: 4 };
    const base = basePruebas([variante(1, '3.5', 'A'), otra]);
    await expect(normalizarSkus(base.prisma, true)).rejects.toThrow('la misma identidad o SKU');
    expect(base.update).not.toHaveBeenCalled();
  });

  it('revierte los SKU temporales si falla una actualización', async () => {
    const iniciales = [variante(1, '3.5', 'NK-AF1-M-BK-35')];
    const base = basePruebas(iniciales);
    base.update.mockImplementationOnce(async ({ where, data }) => {
      Object.assign(base.filas().find((fila) => fila.id === where.id)!, data);
      return base.filas()[0];
    }).mockRejectedValueOnce(new Error('Fallo de escritura'));
    await expect(normalizarSkus(base.prisma, true)).rejects.toThrow('Fallo de escritura');
    expect(base.update).toHaveBeenCalledTimes(2);
    expect(base.filas()).toEqual(iniciales);
  });

  it('rechaza datos de talla inválidos antes de escribir', async () => {
    const base = basePruebas([variante(1, '3P5', 'A')]);
    await expect(normalizarSkus(base.prisma, true)).rejects.toThrow('La talla debe ser');
    expect(base.update).not.toHaveBeenCalled();
  });
});
