import {
  Injectable,
  BadGatewayException,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  v2 as cloudinary,
  UploadApiOptions,
  UploadApiResponse,
} from 'cloudinary';
import { Readable } from 'stream';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class CloudinaryService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CloudinaryService.name);
  private worker?: ReturnType<typeof setInterval>;
  private procesandoCola = false;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    // Configurar Cloudinary con las variables de entorno
    cloudinary.config({
      cloud_name: this.config.getOrThrow('CLOUDINARY_CLOUD_NAME'),
      api_key: this.config.getOrThrow('CLOUDINARY_API_KEY'),
      api_secret: this.config.getOrThrow('CLOUDINARY_API_SECRET'),
    });
  }

  onModuleInit() {
    this.worker = setInterval(() => {
      void this.procesarPendientes();
    }, 60_000);
    void this.procesarPendientes();
  }

  onModuleDestroy() {
    if (this.worker) clearInterval(this.worker);
  }

  // Sube un archivo (buffer de Multer) a Cloudinary
  async subirImagen(
    archivo: Express.Multer.File,
    carpeta: string,
  ): Promise<{ url: string; publicId: string }> {
    return this.subirArchivo(archivo, carpeta, [
      { quality: 'auto', fetch_format: 'auto' },
      { width: 800, crop: 'limit' },
    ]);
  }

  async subirLogo(
    archivo: Express.Multer.File,
    carpeta: string,
  ): Promise<{ url: string; publicId: string }> {
    return this.subirArchivo(archivo, carpeta);
  }

  private async subirArchivo(
    archivo: Express.Multer.File,
    carpeta: string,
    transformation?: UploadApiOptions['transformation'],
  ): Promise<{ url: string; publicId: string }> {
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: carpeta,
          ...(transformation ? { transformation } : {}),
        },
        (error, result: UploadApiResponse | undefined) => {
          if (error) {
            reject(
              new BadGatewayException(
                `Cloudinary no pudo guardar la imagen: ${error.message}`,
              ),
            );
            return;
          }

          if (!result) {
            reject(
              new BadGatewayException(
                'Cloudinary no devolvió los datos de la imagen subida.',
              ),
            );
            return;
          }
          resolve({
            url: result.secure_url,
            publicId: result.public_id,
          });
        },
      );
      uploadStream.on('error', (error: Error) => {
        reject(
          new BadGatewayException(
            `Falló la conexión con Cloudinary: ${error.message}`,
          ),
        );
      });

      // Convertir el buffer de Multer a un stream para Cloudinary
      const readable = new Readable();
      readable.push(archivo.buffer);
      readable.push(null);
      readable.on('error', (error: Error) => {
        reject(
          new BadGatewayException(
            `No se pudo procesar la imagen para Cloudinary: ${error.message}`,
          ),
        );
      });
      readable.pipe(uploadStream);
    });
  }

  // Elimina una imagen de Cloudinary por su publicId
  async eliminarImagen(publicId: string): Promise<void> {
    try {
      await this.destruirEnCloudinary(publicId);
    } catch (error) {
      const detalle = this.detalleError(error);
      try {
        await this.prisma.cloudinaryDeleteJob.upsert({
          where: { publicId },
          create: { publicId, lastError: detalle },
          update: { nextAttemptAt: new Date(), lastError: detalle },
        });
      } catch (queueError) {
        throw new BadGatewayException(
          `Cloudinary no pudo eliminar el archivo y tampoco se pudo guardar el reintento: ${this.detalleError(queueError)}`,
        );
      }
      throw new BadGatewayException(
        `Cloudinary no pudo eliminar el archivo; quedó en cola para reintento: ${detalle}`,
      );
    }
  }

  async procesarPendientes(): Promise<void> {
    if (this.procesandoCola) return;
    this.procesandoCola = true;
    try {
      const ahora = new Date();
      const trabajos = await this.prisma.cloudinaryDeleteJob.findMany({
        where: { nextAttemptAt: { lte: ahora } },
        orderBy: { nextAttemptAt: 'asc' },
        take: 25,
      });

      for (const trabajo of trabajos) {
        const reclamado = await this.prisma.cloudinaryDeleteJob.updateMany({
          where: {
            id: trabajo.id,
            nextAttemptAt: { lte: new Date() },
          },
          data: {
            attempts: { increment: 1 },
            nextAttemptAt: new Date(Date.now() + 2 * 60_000),
          },
        });
        if (reclamado.count !== 1) continue;

        try {
          await this.destruirEnCloudinary(trabajo.publicId);
          await this.prisma.cloudinaryDeleteJob.deleteMany({
            where: { id: trabajo.id },
          });
        } catch (error) {
          const intentos = trabajo.attempts + 1;
          const esperaMs = Math.min(60_000 * 2 ** Math.min(intentos, 10), 24 * 60 * 60_000);
          const detalle = this.detalleError(error);
          await this.prisma.cloudinaryDeleteJob.updateMany({
            where: { id: trabajo.id },
            data: {
              lastError: detalle,
              nextAttemptAt: new Date(Date.now() + esperaMs),
            },
          });
          this.logger.warn(
            `Falló el reintento ${intentos} al eliminar ${trabajo.publicId}: ${detalle}`,
          );
        }
      }
    } catch (error) {
      this.logger.error(
        `No se pudo procesar la cola de eliminaciones de Cloudinary: ${this.detalleError(error)}`,
      );
    } finally {
      this.procesandoCola = false;
    }
  }

  private async destruirEnCloudinary(publicId: string): Promise<void> {
    let ultimoError: unknown;
    for (let intento = 1; intento <= 3; intento += 1) {
      try {
        const resultado = await cloudinary.uploader.destroy(publicId);
        if (resultado.result === 'ok' || resultado.result === 'not found') {
          return;
        }
        throw new Error(`Cloudinary respondió: ${resultado.result}`);
      } catch (error) {
        ultimoError = error;
        if (intento < 3) {
          await new Promise((resolve) => setTimeout(resolve, intento * 100));
        }
      }
    }

    throw new Error(
      `Cloudinary no pudo eliminar el archivo después de 3 intentos: ${this.detalleError(ultimoError)}`,
    );
  }

  private detalleError(error: unknown): string {
    return error instanceof Error ? error.message : 'Error desconocido';
  }
}
