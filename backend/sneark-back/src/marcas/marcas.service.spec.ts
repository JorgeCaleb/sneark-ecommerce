import { ConflictException } from '@nestjs/common';
import { CloudinaryService } from '../cloudinary/cloudinary.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { MarcasService } from './marcas.service.js';

describe('MarcasService logos', () => {
  let service: MarcasService;
  let prisma: {
    marca: {
      findUnique: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
      delete: ReturnType<typeof vi.fn>;
    };
    producto: { count: ReturnType<typeof vi.fn> };
  };
  let cloudinary: {
    subirLogo: ReturnType<typeof vi.fn>;
    eliminarImagen: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    prisma = {
      marca: {
        findUnique: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      producto: { count: vi.fn().mockResolvedValue(0) },
    };
    cloudinary = {
      subirLogo: vi.fn(),
      eliminarImagen: vi.fn().mockResolvedValue(undefined),
    };
    service = new MarcasService(
      prisma as unknown as PrismaService,
      cloudinary as unknown as CloudinaryService,
    );
  });

  it('elimina primero la marca y luego su logo de Cloudinary', async () => {
    prisma.marca.findUnique.mockResolvedValue({
      id: 7,
      nombre: 'Nike',
      logo: 'https://res.cloudinary.com/demo/image/upload/v1/SOHO/marcas/7/nike.svg',
      logoPublicId: 'SOHO/marcas/7/nike',
    });
    prisma.marca.delete.mockResolvedValue({ id: 7 });

    await service.eliminar(7);

    expect(cloudinary.eliminarImagen).toHaveBeenCalledWith(
      'SOHO/marcas/7/nike',
    );
    expect(prisma.marca.delete).toHaveBeenCalledWith({ where: { id: 7 } });
    expect(prisma.marca.delete.mock.invocationCallOrder[0]).toBeLessThan(
      cloudinary.eliminarImagen.mock.invocationCallOrder[0],
    );
  });

  it('recupera y elimina el publicId de logos antiguos de Cloudinary', async () => {
    prisma.marca.findUnique.mockResolvedValue({
      id: 7,
      nombre: 'Nike',
      logo: 'https://res.cloudinary.com/demo/image/upload/v123/SOHO/marcas/7/nike.svg',
      logoPublicId: null,
    });
    prisma.marca.delete.mockResolvedValue({ id: 7 });

    await service.eliminar(7);

    expect(cloudinary.eliminarImagen).toHaveBeenCalledWith(
      'SOHO/marcas/7/nike',
    );
  });

  it('no elimina el logo cuando la marca todavía tiene productos', async () => {
    prisma.marca.findUnique.mockResolvedValue({
      id: 7,
      nombre: 'Nike',
      logo: 'https://res.cloudinary.com/demo/image/upload/v1/SOHO/marcas/7/nike.svg',
      logoPublicId: 'SOHO/marcas/7/nike',
    });
    prisma.producto.count.mockResolvedValue(1);

    await expect(service.eliminar(7)).rejects.toThrow(ConflictException);

    expect(cloudinary.eliminarImagen).not.toHaveBeenCalled();
    expect(prisma.marca.delete).not.toHaveBeenCalled();
  });

  it('guarda el publicId nuevo y elimina el logo anterior al reemplazarlo', async () => {
    prisma.marca.findUnique.mockResolvedValue({
      id: 7,
      nombre: 'Nike',
      logo: 'https://res.cloudinary.com/demo/image/upload/v1/SOHO/marcas/7/old.svg',
      logoPublicId: 'SOHO/marcas/7/old',
    });
    cloudinary.subirLogo.mockResolvedValue({
      url: 'https://res.cloudinary.com/demo/image/upload/v2/SOHO/marcas/7/new.svg',
      publicId: 'SOHO/marcas/7/new',
    });
    prisma.marca.update.mockResolvedValue({
      id: 7,
      logoPublicId: 'SOHO/marcas/7/new',
    });

    await service.subirLogo(7, {
      buffer: Buffer.from('logo'),
    } as Express.Multer.File);

    expect(prisma.marca.update).toHaveBeenCalledWith({
      where: { id: 7 },
      data: {
        logo: 'https://res.cloudinary.com/demo/image/upload/v2/SOHO/marcas/7/new.svg',
        logoPublicId: 'SOHO/marcas/7/new',
      },
    });
    expect(cloudinary.eliminarImagen).toHaveBeenCalledWith(
      'SOHO/marcas/7/old',
    );
  });

  it('sube los logos a una carpeta basada solo en el nombre de la marca', async () => {
    const archivo = { buffer: Buffer.from('logo') } as Express.Multer.File;
    prisma.marca.findUnique.mockResolvedValue({
      id: 7,
      nombre: 'Nike Perú',
      logo: null,
      logoPublicId: null,
    });
    cloudinary.subirLogo.mockResolvedValue({
      url: 'https://res.cloudinary.com/demo/image/upload/v2/SOHO/marcas/nike-peru/logo.svg',
      publicId: 'SOHO/marcas/nike-peru/logo',
    });
    prisma.marca.update.mockResolvedValue({ id: 7 });

    await service.subirLogo(7, archivo);

    expect(cloudinary.subirLogo).toHaveBeenCalledWith(
      archivo,
      'SOHO/marcas/nike-peru',
    );
  });

  it('elimina el logo recién subido si falla su persistencia en la base de datos', async () => {
    const errorPersistencia = new Error('Database unavailable');
    prisma.marca.findUnique.mockResolvedValue({
      id: 7,
      nombre: 'Nike',
      logo: null,
      logoPublicId: null,
    });
    cloudinary.subirLogo.mockResolvedValue({
      url: 'https://res.cloudinary.com/demo/image/upload/v2/SOHO/marcas/nike/logo.svg',
      publicId: 'SOHO/marcas/nike/logo',
    });
    prisma.marca.update.mockRejectedValue(errorPersistencia);

    await expect(
      service.subirLogo(7, {
        buffer: Buffer.from('logo'),
      } as Express.Multer.File),
    ).rejects.toBe(errorPersistencia);

    expect(cloudinary.eliminarImagen).toHaveBeenCalledWith(
      'SOHO/marcas/nike/logo',
    );
  });

  it('expone si no puede limpiar el logo tras fallar la persistencia', async () => {
    prisma.marca.findUnique.mockResolvedValue({
      id: 7,
      nombre: 'Nike',
      logo: null,
      logoPublicId: null,
    });
    cloudinary.subirLogo.mockResolvedValue({
      url: 'https://res.cloudinary.com/demo/image/upload/v2/SOHO/marcas/nike/logo.svg',
      publicId: 'SOHO/marcas/nike/logo',
    });
    prisma.marca.update.mockRejectedValue(new Error('Database unavailable'));
    cloudinary.eliminarImagen.mockRejectedValue(
      new Error('Delete queued for retry'),
    );

    await expect(
      service.subirLogo(7, {
        buffer: Buffer.from('logo'),
      } as Express.Multer.File),
    ).rejects.toThrow(
      'No se pudo guardar el logo y tampoco eliminar el archivo subido: Delete queued for retry',
    );
  });
});
