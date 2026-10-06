import { PartialType } from '@nestjs/mapped-types';
import { CrearProductoDto } from './crear-producto.dto.js';
import { IsBoolean, IsOptional } from 'class-validator';

export class ActualizarProductoDto extends PartialType(CrearProductoDto) {
  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}
