import { BadGatewayException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';
import { CloudinaryService } from './cloudinary.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

describe('CloudinaryService eliminación de imágenes', () => {
  let service: CloudinaryService;
  let destroy: ReturnType<typeof vi.spyOn>;
  let prisma: {
    cloudinaryDeleteJob: {
      upsert: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
      updateMany: ReturnType<typeof vi.fn>;
      deleteMany: ReturnType<typeof vi.fn>;
    };
  };

  beforeEach(() => {
    prisma = {
      cloudinaryDeleteJob: {
        upsert: vi.fn().mockResolvedValue({}),
        findMany: vi.fn().mockResolvedValue([]),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    service = new CloudinaryService(
      { getOrThrow: vi.fn((key: string) => key) } as unknown as ConfigService,
      prisma as unknown as PrismaService,
    );
    destroy = vi.spyOn(cloudinary.uploader, 'destroy');
  });

  afterEach(() => {
    destroy.mockRestore();
    vi.restoreAllMocks();
  });

  it('reintenta un fallo transitorio y tiene éxito en el siguiente intento', async () => {
    destroy
      .mockRejectedValueOnce(new Error('error de red temporal'))
      .mockResolvedValueOnce({ result: 'ok' } as Awaited<
        ReturnType<typeof cloudinary.uploader.destroy>
      >);

    await service.eliminarImagen('SOHO/productos/item/image');

    expect(destroy).toHaveBeenCalledTimes(2);
    expect(destroy).toHaveBeenCalledWith('SOHO/productos/item/image');
  });

  it('trata una imagen ya inexistente en remoto como eliminada exitosamente', async () => {
    destroy.mockResolvedValue({
      result: 'not found',
    } as Awaited<ReturnType<typeof cloudinary.uploader.destroy>>);

    await expect(
      service.eliminarImagen('SOHO/productos/item/image'),
    ).resolves.toBeUndefined();
    expect(destroy).toHaveBeenCalledOnce();
  });

  it('reporta un fallo persistente tras los reintentos acotados', async () => {
    destroy.mockRejectedValue(new Error('Cloudinary unavailable'));

    await expect(
      service.eliminarImagen('SOHO/productos/item/image'),
    ).rejects.toThrow(BadGatewayException);
    expect(destroy).toHaveBeenCalledTimes(3);
  });

  it('persiste un fallo de eliminación y expone la cola de reintentos al llamante', async () => {
    destroy.mockRejectedValue(new Error('Cloudinary unavailable'));

    await expect(
      service.eliminarImagen('SOHO/productos/item/queued'),
    ).rejects.toThrow('quedó en cola para reintento');

    expect(prisma.cloudinaryDeleteJob.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { publicId: 'SOHO/productos/item/queued' },
        create: expect.objectContaining({
          publicId: 'SOHO/productos/item/queued',
        }),
      }),
    );
  });

  it('elimina los trabajos encolados después de que Cloudinary confirma un reintento', async () => {
    prisma.cloudinaryDeleteJob.findMany.mockResolvedValue([
      { id: 4, publicId: 'SOHO/productos/item/retry', attempts: 1 },
    ]);
    destroy.mockResolvedValue({
      result: 'ok',
    } as Awaited<ReturnType<typeof cloudinary.uploader.destroy>>);

    await service.procesarPendientes();

    expect(prisma.cloudinaryDeleteJob.updateMany).toHaveBeenCalledOnce();
    expect(prisma.cloudinaryDeleteJob.deleteMany).toHaveBeenCalledWith({
      where: { id: 4 },
    });
  });

  it('programa un reintento posterior y registra su error cuando el worker falla', async () => {
    prisma.cloudinaryDeleteJob.findMany.mockResolvedValue([
      { id: 5, publicId: 'SOHO/productos/item/retry', attempts: 2 },
    ]);
    destroy.mockRejectedValue(new Error('Cloudinary unavailable'));

    await service.procesarPendientes();

    expect(prisma.cloudinaryDeleteJob.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { id: 5 },
        data: expect.objectContaining({
          lastError: expect.stringContaining('3 intentos'),
          nextAttemptAt: expect.any(Date),
        }),
      }),
    );
  });
});
