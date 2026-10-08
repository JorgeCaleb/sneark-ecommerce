import { Module } from '@nestjs/common';
import { ColoresController } from './colores.controller.js';
import { ColoresService } from './colores.service.js';

@Module({
  controllers: [ColoresController],
  providers: [ColoresService],
  exports: [ColoresService],
})
export class ColoresModule {}
