import { Transform } from 'class-transformer';
import { IsOptional, IsString } from 'class-validator';
import { PaginacionDto } from '../../common/dto/paginacion.dto.js';

export class FiltrarClientesDto extends PaginacionDto {
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  busqueda?: string;
}
