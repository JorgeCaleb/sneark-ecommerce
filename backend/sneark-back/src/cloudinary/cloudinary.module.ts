import { Global, Module } from '@nestjs/common';
import { CloudinaryService } from './cloudinary.service.js';

// @Global para que CloudinaryService esté disponible en todos los módulos
@Global()
@Module({
  providers: [CloudinaryService],
  exports: [CloudinaryService],
})
export class CloudinaryModule {}
