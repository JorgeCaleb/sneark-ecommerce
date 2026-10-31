import { Module } from '@nestjs/common';
import { GruposModelosController } from './grupos-modelos.controller.js';
import { GruposModelosService } from './grupos-modelos.service.js';

@Module({
  controllers: [GruposModelosController],
  providers: [GruposModelosService],
})
export class GruposModelosModule {}
