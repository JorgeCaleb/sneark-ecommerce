import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { CloudinaryService } from './cloudinary.service.js';

// @Global para que CloudinaryService esté disponible en todos los módulos
@Global()
@Module({
  imports: [PrismaModule],
  providers: [CloudinaryService],
  exports: [CloudinaryService],
})
export class CloudinaryModule {}
