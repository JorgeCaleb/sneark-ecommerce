import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CloudinaryService } from '../cloudinary/cloudinary.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { FiltrarProductosDto } from './dto/filtrar-productos.dto.js';
import { ProductosService } from './productos.service.js';

describe('Filtros públicos del catálogo', () => {
  const crear = () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const count = vi.fn().mockResolvedValue(23);
    const service = new ProductosService(
      { producto: { findMany, count } } as unknown as PrismaService,
      {} as CloudinaryService,
    );
    return { service, findMany, count };
  };

  it('filtra el grupo antes de paginar también en la ficha del producto', async () => {
    const { service, findMany, count } = crear();
    await service.buscarTodos(plainToInstance(FiltrarProductosDto, { grupoModeloId: '7', limite: '5' }));
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { activo: true, grupoModeloId: 7 }, take: 5 }));
    expect(count).toHaveBeenCalledWith({ where: { activo: true, grupoModeloId: 7 } });
    expect((await validate(plainToInstance(FiltrarProductosDto, { grupoModeloId: '-1' }))).length).toBeGreaterThan(0);
  });

  it('valida listas de query params y conserva los filtros anteriores', async () => {
    const dto = plainToInstance(FiltrarProductosDto, {
      marcaIds: '1,3', colorIds: '2,5', generos: 'M,X',
      disponibilidad: 'disponible,agotado', talla: '38.5', marcaId: '1', orden: 'precio-asc',
    });
    expect(await validate(dto)).toEqual([]);
    expect(dto.marcaIds).toEqual([1, 3]);
    expect(dto.colorIds).toEqual([2, 5]);
    expect(dto.marcaId).toBe(1);
  });

  it.each([
    { marcaIds: '1,-2' }, { colorIds: 'a' }, { generos: 'K' },
    { disponibilidad: 'cualquiera' }, { orden: 'sql' }, { talla: 'todas' },
  ])('rechaza filtros inválidos: %j', async (params) => {
    expect((await validate(plainToInstance(FiltrarProductosDto, params))).length).toBeGreaterThan(0);
  });

  it('combina talla, género, color y stock en la misma variante antes de paginar', async () => {
    const { service, findMany, count } = crear();
    const res = await service.buscarTodos(plainToInstance(FiltrarProductosDto, {
      marcaIds: '1,3', generos: 'M,W', colorIds: '2,5', talla: '38.5',
      disponibilidad: 'disponible', orden: 'precio-asc', pagina: 2, limite: 8,
    }));
    const consulta = findMany.mock.calls[0][0];
    expect(consulta.where).toEqual({
      activo: true, marcaId: { in: [1, 3] },
      tallas: { some: { genero: { in: ['M', 'W'] }, colorId: { in: [2, 5] }, tallaNumero: 38.5, stock: { gt: 0 } } },
    });
    expect(consulta).toMatchObject({ skip: 8, take: 8, orderBy: [{ precio: 'asc' }, { id: 'asc' }] });
    expect(count).toHaveBeenCalledWith({ where: consulta.where });
    expect(res.meta).toMatchObject({ total: 23, totalPaginas: 3, pagina: 2 });
  });

  it('un producto agotado no puede tener stock en otra variante coincidente', async () => {
    const { service, findMany } = crear();
    await service.buscarTodos(plainToInstance(FiltrarProductosDto, { talla: '39', disponibilidad: 'agotado' }));
    expect(findMany.mock.calls[0][0].where.tallas).toEqual({
      some: { tallaNumero: 39 }, none: { tallaNumero: 39, stock: { gt: 0 } },
    });
  });

  it('marcar ambos estados incluye disponibles y agotados', async () => {
    const { service, findMany } = crear();
    await service.buscarTodos(plainToInstance(FiltrarProductosDto, { disponibilidad: 'disponible,agotado' }));
    expect(findMany.mock.calls[0][0].where).toEqual({ activo: true });
  });

  it('busca también por modelo, marca y categoría sin perder los filtros de precio', async () => {
    const { service, findMany } = crear();
    await service.buscarTodos(plainToInstance(FiltrarProductosDto, { busqueda: 'Nike', precioMax: 0 }));
    expect(findMany.mock.calls[0][0].where).toMatchObject({
      activo: true, precio: { lte: 0 }, OR: expect.arrayContaining([{ marca: { nombre: { contains: 'Nike' } } }]),
    });
  });
});
