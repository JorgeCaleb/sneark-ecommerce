import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

// DTO para cada talla dentro del producto
export class TallaDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty({ message: 'La talla es obligatoria' })
  @MaxLength(20)
  talla: string;

  @IsInt()
  @Min(0, { message: 'El stock no puede ser negativo' })
  stock: number;
}

export class CrearProductoDto {
  @IsString()
  @IsNotEmpty({ message: 'El nombre es obligatorio' })
  @MaxLength(150)
  nombre: string;

  @IsOptional()
  @IsString()
  descripcion?: string;

  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'El precio debe ser un número válido' },
  )
  @IsPositive({ message: 'El precio debe ser mayor a 0' })
  @Type(() => Number)
  precio: number;

  @IsInt()
  @IsPositive({ message: 'Debe seleccionar una marca válida' })
  @Type(() => Number)
  marcaId: number;

  @IsInt()
  @IsPositive({ message: 'Debe seleccionar una categoría válida' })
  @Type(() => Number)
  categoriaId: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TallaDto)
  tallas?: TallaDto[];
}
