import { Module } from '@nestjs/common';
import { MarcasService } from './marcas.service.js';
import { MarcasController } from './marcas.controller.js';

@Module({
  controllers: [MarcasController],
  providers: [MarcasService],
  exports: [MarcasService], // ProductosModule lo necesitará
})
export class MarcasModule {}
