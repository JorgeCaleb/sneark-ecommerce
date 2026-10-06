import { Injectable, BadGatewayException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  v2 as cloudinary,
  UploadApiOptions,
  UploadApiResponse,
} from 'cloudinary';
import { Readable } from 'stream';

@Injectable()
export class CloudinaryService {
  constructor(private readonly config: ConfigService) {
    // Configurar Cloudinary con las variables de entorno
    cloudinary.config({
      cloud_name: this.config.getOrThrow('CLOUDINARY_CLOUD_NAME'),
      api_key: this.config.getOrThrow('CLOUDINARY_API_KEY'),
      api_secret: this.config.getOrThrow('CLOUDINARY_API_SECRET'),
    });
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
      await cloudinary.uploader.destroy(publicId);
    } catch (error) {
      const detalle =
        error instanceof Error ? error.message : 'Error desconocido';
      throw new BadGatewayException(
        `Cloudinary no pudo eliminar el archivo: ${detalle}`,
      );
    }
  }
}
