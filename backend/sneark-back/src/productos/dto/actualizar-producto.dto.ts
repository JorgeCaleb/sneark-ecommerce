import { PartialType } from '@nestjs/mapped-types';
import { CrearProductoDto } from './crear-producto.dto.js';
import { IsBoolean, ValidateIf } from 'class-validator';

export class ActualizarProductoDto extends PartialType(CrearProductoDto, {
  skipNullProperties: false,
}) {
  @ValidateIf((_, value: unknown) => value !== undefined)
  @IsBoolean()
  activo?: boolean;
}
