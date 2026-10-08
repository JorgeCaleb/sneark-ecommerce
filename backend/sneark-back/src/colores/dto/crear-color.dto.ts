import { Transform } from 'class-transformer';
import {
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

export class CrearColorDto {
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty({ message: 'El nombre del color es obligatorio' })
  @MaxLength(50)
  nombre: string;

  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @IsNotEmpty({ message: 'El código del color es obligatorio' })
  @MaxLength(10)
  @Matches(/^[A-Z0-9]+$/, {
    message: 'El código solo admite letras y números',
  })
  codigo: string;
}
