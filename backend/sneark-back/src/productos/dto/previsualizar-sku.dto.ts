import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import { PATRON_TALLA } from '../sku.util.js';

export class PrevisualizarSkuDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  marcaId: number;

  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  @Matches(/^[A-Z0-9]+$/)
  codigoModelo: string;

  @IsIn(['M', 'W', 'X'])
  genero: 'M' | 'W' | 'X';

  @Type(() => Number)
  @IsInt()
  @Min(1)
  colorId: number;

  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @Matches(PATRON_TALLA)
  talla: string;
}
