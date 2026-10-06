import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';
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
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: carpeta,
          // Transformaciones automáticas: optimizar formato y calidad
          transformation: [
            { quality: 'auto', fetch_format: 'auto' },
            { width: 800, crop: 'limit' }, // máximo 800px de ancho
          ],
        },
        (error, result: UploadApiResponse | undefined) => {
          if (error || !result) {
            reject(new BadRequestException('Error al subir la imagen'));
            return;
          }
          resolve({
            url: result.secure_url,
            publicId: result.public_id,
          });
        },
      );

      // Convertir el buffer de Multer a un stream para Cloudinary
      const readable = new Readable();
      readable.push(archivo.buffer);
      readable.push(null);
      readable.pipe(uploadStream);
    });
  }

  // Elimina una imagen de Cloudinary por su publicId
  async eliminarImagen(publicId: string): Promise<void> {
    await cloudinary.uploader.destroy(publicId);
  }
}
