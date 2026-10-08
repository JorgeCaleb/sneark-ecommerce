import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { CarritoService } from './carrito.service.js';

function conflictoUnico() {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint', {
    code: 'P2002',
    clientVersion: 'test',
  });
}

describe('CarritoService agregar', () => {
  let service: CarritoService;
  let cantidad: number | null;
  let stock: number;
  let updateMany: ReturnType<typeof vi.fn>;
  let create: ReturnType<typeof vi.fn>;
  let findUniqueItem: ReturnType<typeof vi.fn>;
  let transaction: ReturnType<typeof vi.fn>;
  let cartFindUnique: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    cantidad = 1;
    stock = 2;
    updateMany = vi.fn(async ({ where, data }) => {
      if (
        cantidad === null ||
        cantidad > where.cantidad.lte ||
        cantidad + data.cantidad.increment > stock
      ) {
        return { count: 0 };
      }
      cantidad += data.cantidad.increment;
      return { count: 1 };
    });
    findUniqueItem = vi.fn(async () =>
      cantidad === null
        ? null
        : {
            id: 5,
            cantidad,
            tallaProductoId: 9,
          },
    );
    create = vi.fn(async ({ data }) => {
      if (cantidad !== null) throw conflictoUnico();
      cantidad = data.cantidad;
      return { id: 5, ...data };
    });
    const tx = {
      tallaProducto: {
        findUnique: vi.fn().mockResolvedValue({
          id: 9,
          stock,
          producto: { activo: true },
        }),
      },
      carrito: {
        upsert: vi.fn().mockResolvedValue({ id: 2 }),
      },
      itemCarrito: {
        updateMany,
        findUnique: findUniqueItem,
        create,
      },
    };
    transaction = vi.fn((callback) => callback(tx));
    cartFindUnique = vi.fn(async () => ({
      id: 2,
      items:
        cantidad === null
          ? []
          : [
              {
                id: 5,
                cantidad,
                subtotal: 0,
                tallaProductoId: 9,
                tallaProducto: {
                  talla: '42',
                  stock,
                  producto: { precio: 10 },
                },
              },
            ],
    }));
    service = new CarritoService({
      $transaction: transaction,
      carrito: { findUnique: cartFindUnique },
    } as unknown as PrismaService);
  });

  it('uses a conditional atomic increment bounded by available stock', async () => {
    await expect(
      service.agregar(7, { tallaProductoId: 9, cantidad: 1 }),
    ).resolves.toMatchObject({
      items: [{ cantidad: 2 }],
    });

    expect(updateMany).toHaveBeenCalledWith({
      where: {
        carritoId: 2,
        tallaProductoId: 9,
        cantidad: { lte: 1 },
      },
      data: { cantidad: { increment: 1 } },
    });
  });

  it('applies only the concurrent addition that fits the stock', async () => {
    stock = 2;

    const resultados = await Promise.allSettled([
      service.agregar(7, { tallaProductoId: 9, cantidad: 1 }),
      service.agregar(7, { tallaProductoId: 9, cantidad: 1 }),
    ]);

    expect(
      resultados.filter((resultado) => resultado.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      resultados.filter((resultado) => resultado.status === 'rejected'),
    ).toHaveLength(1);
    expect(cantidad).toBe(2);
  });

  it('retries a concurrent first insert as a conditional increment', async () => {
    cantidad = null;
    create.mockImplementationOnce(({ data }) => {
      cantidad = data.cantidad;
      throw conflictoUnico();
    });

    await expect(
      service.agregar(7, { tallaProductoId: 9, cantidad: 1 }),
    ).resolves.toMatchObject({
      items: [{ cantidad: 2 }],
    });

    expect(create).toHaveBeenCalledOnce();
    expect(updateMany).toHaveBeenCalledTimes(2);
  });

  it('rejects additions when the product is inactive', async () => {
    const tallaFindUnique = vi.fn().mockResolvedValue({
      id: 9,
      stock,
      producto: { activo: false },
    });
    transaction.mockImplementation((callback) =>
      callback({
        tallaProducto: { findUnique: tallaFindUnique },
      }),
    );

    await expect(
      service.agregar(7, { tallaProductoId: 9, cantidad: 1 }),
    ).rejects.toThrow('Este producto no está disponible');

    expect(updateMany).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });
});

describe('CarritoService actualizar artículo inactivo', () => {
  it('rejects quantity changes but allows removing an inactive item', async () => {
    const item = {
      id: 5,
      tallaProductoId: 9,
      cantidad: 1,
      tallaProducto: {
        stock: 2,
        producto: { activo: false },
      },
    };
    const itemFindFirst = vi.fn().mockResolvedValue(item);
    const itemUpdate = vi.fn();
    const itemDelete = vi.fn();
    const cartFindUnique = vi.fn().mockResolvedValue({
      id: 2,
      items: [],
    });
    const service = new CarritoService({
      carrito: { findUnique: cartFindUnique },
      itemCarrito: {
        findFirst: itemFindFirst,
        update: itemUpdate,
        delete: itemDelete,
      },
    } as unknown as PrismaService);

    await expect(service.actualizarItem(7, 5, { cantidad: 2 })).rejects.toThrow(
      'Este producto no está disponible',
    );
    expect(itemUpdate).not.toHaveBeenCalled();

    await expect(service.eliminarItem(7, 5)).resolves.toMatchObject({
      items: [],
    });
    expect(itemDelete).toHaveBeenCalledWith({ where: { id: 5 } });
  });
});
