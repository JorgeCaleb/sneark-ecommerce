import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class TallaDto {
  @IsOptional()
  @IsInt()
  @IsPositive()
  @Type(() => Number)
  id?: number;

  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsIn(['M', 'W', 'X'], { message: 'El género debe ser M, W o X' })
  genero: 'M' | 'W' | 'X';

  @IsInt()
  @IsPositive({ message: 'Debe seleccionar un color válido' })
  @Type(() => Number)
  colorId: number;

  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty({ message: 'La talla es obligatoria' })
  @MaxLength(20)
  @Matches(/^\d+(?:\.0|\.5)?$/, {
    message: 'La talla debe ser un entero o terminar en .0 o .5',
  })
  talla: string;

  @IsInt()
  @Min(0, { message: 'El stock no puede ser negativo' })
  @Type(() => Number)
  stock: number;
}

export class CrearProductoDto {
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty({ message: 'El nombre es obligatorio' })
  @MaxLength(150)
  nombre: string;

  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @IsNotEmpty({ message: 'El código de modelo es obligatorio' })
  @MaxLength(20)
  @Matches(/^[A-Z0-9]+$/, {
    message: 'El código de modelo solo admite letras y números',
  })
  codigoModelo: string;

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
