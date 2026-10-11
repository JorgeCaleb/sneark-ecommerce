import { Type } from 'class-transformer';
import {
  IsInt,
  IsIn,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { PaginacionDto } from '../../common/dto/paginacion.dto.js';

// DTO para los query params de búsqueda/filtrado del catálogo
export class FiltrarProductosDto extends PaginacionDto {
  @IsOptional()
  @IsString()
  busqueda?: string; // Búsqueda por nombre

  @IsOptional()
  @IsIn(['M', 'W', 'X'])
  genero?: 'M' | 'W' | 'X';

  @IsOptional()
  @IsInt()
  @IsPositive()
  @Type(() => Number)
  colorId?: number;

  @IsOptional()
  @IsInt()
  @IsPositive()
  @Type(() => Number)
  marcaId?: number;

  @IsOptional()
  @IsInt()
  @IsPositive()
  @Type(() => Number)
  categoriaId?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  precioMin?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  precioMax?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  override limite = 12;
}
