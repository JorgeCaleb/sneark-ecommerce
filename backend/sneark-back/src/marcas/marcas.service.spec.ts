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

  it('borra el logo de Cloudinary antes de eliminar la marca', async () => {
    prisma.marca.findUnique.mockResolvedValue({
      id: 7,
      nombre: 'Nike',
      logo: 'https://res.cloudinary.com/demo/image/upload/v1/sneark/marcas/7/nike.svg',
      logoPublicId: 'sneark/marcas/7/nike',
    });
    prisma.marca.delete.mockResolvedValue({ id: 7 });

    await service.eliminar(7);

    expect(cloudinary.eliminarImagen).toHaveBeenCalledWith(
      'sneark/marcas/7/nike',
    );
    expect(prisma.marca.delete).toHaveBeenCalledWith({ where: { id: 7 } });
    expect(cloudinary.eliminarImagen.mock.invocationCallOrder[0]).toBeLessThan(
      prisma.marca.delete.mock.invocationCallOrder[0],
    );
  });

  it('recupera y elimina el publicId de logos antiguos de Cloudinary', async () => {
    prisma.marca.findUnique.mockResolvedValue({
      id: 7,
      nombre: 'Nike',
      logo: 'https://res.cloudinary.com/demo/image/upload/v123/sneark/marcas/7/nike.svg',
      logoPublicId: null,
    });
    prisma.marca.delete.mockResolvedValue({ id: 7 });

    await service.eliminar(7);

    expect(cloudinary.eliminarImagen).toHaveBeenCalledWith(
      'sneark/marcas/7/nike',
    );
  });

  it('no elimina el logo cuando la marca todavía tiene productos', async () => {
    prisma.marca.findUnique.mockResolvedValue({
      id: 7,
      nombre: 'Nike',
      logo: 'https://res.cloudinary.com/demo/image/upload/v1/sneark/marcas/7/nike.svg',
      logoPublicId: 'sneark/marcas/7/nike',
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
      logo: 'https://res.cloudinary.com/demo/image/upload/v1/sneark/marcas/7/old.svg',
      logoPublicId: 'sneark/marcas/7/old',
    });
    cloudinary.subirLogo.mockResolvedValue({
      url: 'https://res.cloudinary.com/demo/image/upload/v2/sneark/marcas/7/new.svg',
      publicId: 'sneark/marcas/7/new',
    });
    prisma.marca.update.mockResolvedValue({
      id: 7,
      logoPublicId: 'sneark/marcas/7/new',
    });

    await service.subirLogo(7, {
      buffer: Buffer.from('logo'),
    } as Express.Multer.File);

    expect(prisma.marca.update).toHaveBeenCalledWith({
      where: { id: 7 },
      data: {
        logo: 'https://res.cloudinary.com/demo/image/upload/v2/sneark/marcas/7/new.svg',
        logoPublicId: 'sneark/marcas/7/new',
      },
    });
    expect(cloudinary.eliminarImagen).toHaveBeenCalledWith(
      'sneark/marcas/7/old',
    );
  });
});
