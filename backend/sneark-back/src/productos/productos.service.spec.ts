import { BadRequestException } from '@nestjs/common';
import { CloudinaryService } from '../cloudinary/cloudinary.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ProductosService } from './productos.service.js';

describe('ProductosService actualizar tallas', () => {
  let service: ProductosService;
  let tx: {
    producto: { findUnique: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
    tallaProducto: {
      findMany: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
      deleteMany: ReturnType<typeof vi.fn>;
    };
  };

  beforeEach(() => {
    tx = {
      producto: {
        findUnique: vi.fn().mockResolvedValue({ id: 3 }),
        update: vi.fn().mockResolvedValue({ id: 3 }),
      },
      tallaProducto: {
        findMany: vi.fn().mockResolvedValue([]),
        update: vi.fn(),
        create: vi.fn(),
        deleteMany: vi.fn(),
      },
    };
    const prisma = {
      $transaction: vi.fn((callback) => callback(tx)),
    };
    service = new ProductosService(
      prisma as unknown as PrismaService,
      {} as CloudinaryService,
    );
  });

  it('actualiza y agrega tallas en la misma transacción', async () => {
    tx.tallaProducto.findMany.mockResolvedValue([
      {
        id: 10,
        talla: '38',
        _count: { itemsCarrito: 0, itemsPedido: 0 },
      },
    ]);

    await service.actualizar(3, {
      tallas: [
        { talla: '38', stock: 4 },
        { talla: '39', stock: 2 },
      ],
    });

    expect(tx.tallaProducto.update).toHaveBeenCalledWith({
      where: { id: 10 },
      data: { stock: 4 },
    });
    expect(tx.tallaProducto.create).toHaveBeenCalledWith({
      data: { talla: '39', stock: 2, productoId: 3 },
    });
    expect(tx.producto.update).toHaveBeenCalled();
  });

  it('elimina tallas omitidas cuando no tienen referencias', async () => {
    tx.tallaProducto.findMany.mockResolvedValue([
      {
        id: 10,
        talla: '38',
        _count: { itemsCarrito: 0, itemsPedido: 0 },
      },
    ]);

    await service.actualizar(3, { tallas: [] });

    expect(tx.tallaProducto.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: [10] } },
    });
  });

  it('rechaza quitar tallas vinculadas a carritos o pedidos', async () => {
    tx.tallaProducto.findMany.mockResolvedValue([
      {
        id: 10,
        talla: '38',
        _count: { itemsCarrito: 0, itemsPedido: 1 },
      },
    ]);

    await expect(service.actualizar(3, { tallas: [] })).rejects.toThrow(
      BadRequestException,
    );
    expect(tx.tallaProducto.deleteMany).not.toHaveBeenCalled();
    expect(tx.producto.update).not.toHaveBeenCalled();
  });

  it('rechaza nombres de talla repetidos sin distinguir mayúsculas', async () => {
    await expect(
      service.actualizar(3, {
        tallas: [
          { talla: ' 38 ', stock: 4 },
          { talla: '38', stock: 2 },
        ],
      }),
    ).rejects.toThrow(BadRequestException);

    expect(tx.producto.findUnique).not.toHaveBeenCalled();
  });
});
