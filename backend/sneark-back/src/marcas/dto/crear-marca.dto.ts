import { Transform } from 'class-transformer';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
} from 'class-validator';

export class CrearMarcaDto {
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty({ message: 'El nombre es obligatorio' })
  @MaxLength(100, { message: 'El nombre no puede superar los 100 caracteres' })
  nombre: string;

  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @IsNotEmpty({ message: 'El código de marca es obligatorio' })
  @MaxLength(10)
  @Matches(/^[A-Z0-9]+$/, {
    message: 'El código solo admite letras y números',
  })
  codigo: string;

  @IsOptional()
  @IsUrl({}, { message: 'El logo debe ser una URL válida' })
  @MaxLength(500)
  logo?: string;
}
