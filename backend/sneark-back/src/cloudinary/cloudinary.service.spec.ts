import { BadGatewayException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';
import { CloudinaryService } from './cloudinary.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

describe('CloudinaryService image deletion', () => {
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

  it('retries a transient deletion failure and succeeds on the next attempt', async () => {
    destroy
      .mockRejectedValueOnce(new Error('temporary network error'))
      .mockResolvedValueOnce({ result: 'ok' } as Awaited<
        ReturnType<typeof cloudinary.uploader.destroy>
      >);

    await service.eliminarImagen('sneark/productos/item/image');

    expect(destroy).toHaveBeenCalledTimes(2);
    expect(destroy).toHaveBeenCalledWith('sneark/productos/item/image');
  });

  it('treats an already missing remote image as successfully deleted', async () => {
    destroy.mockResolvedValue({
      result: 'not found',
    } as Awaited<ReturnType<typeof cloudinary.uploader.destroy>>);

    await expect(
      service.eliminarImagen('sneark/productos/item/image'),
    ).resolves.toBeUndefined();
    expect(destroy).toHaveBeenCalledOnce();
  });

  it('reports a persistent failure after bounded retries', async () => {
    destroy.mockRejectedValue(new Error('Cloudinary unavailable'));

    await expect(
      service.eliminarImagen('sneark/productos/item/image'),
    ).rejects.toThrow(BadGatewayException);
    expect(destroy).toHaveBeenCalledTimes(3);
  });

  it('persists a failed deletion and exposes the queued retry to the caller', async () => {
    destroy.mockRejectedValue(new Error('Cloudinary unavailable'));

    await expect(
      service.eliminarImagen('sneark/productos/item/queued'),
    ).rejects.toThrow('quedó en cola para reintento');

    expect(prisma.cloudinaryDeleteJob.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { publicId: 'sneark/productos/item/queued' },
        create: expect.objectContaining({
          publicId: 'sneark/productos/item/queued',
        }),
      }),
    );
  });

  it('deletes queued jobs after Cloudinary confirms a retry', async () => {
    prisma.cloudinaryDeleteJob.findMany.mockResolvedValue([
      { id: 4, publicId: 'sneark/productos/item/retry', attempts: 1 },
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

  it('schedules a later retry and records its error when the queue worker fails', async () => {
    prisma.cloudinaryDeleteJob.findMany.mockResolvedValue([
      { id: 5, publicId: 'sneark/productos/item/retry', attempts: 2 },
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
