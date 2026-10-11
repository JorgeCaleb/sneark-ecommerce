import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { PaginacionDto } from '../../common/dto/paginacion.dto.js';

export class FiltrarInventarioDto extends PaginacionDto {
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  busqueda?: string;

  @IsOptional()
  @IsIn(['bajo', 'agotado', 'disponible'])
  estado?: 'bajo' | 'agotado' | 'disponible';
}
