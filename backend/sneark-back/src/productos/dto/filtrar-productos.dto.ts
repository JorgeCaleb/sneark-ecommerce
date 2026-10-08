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

// DTO para los query params de búsqueda/filtrado del catálogo
export class FiltrarProductosDto {
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
  pagina?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limite?: number = 12;
}
