import { Transform } from 'class-transformer';
import {
  ValidateIf,
  IsString,
  IsNotEmpty,
  Matches,
  MaxLength,
} from 'class-validator';

// DTO explícito: NO incluye `logo` para que el logo solo pueda
// modificarse a través de POST /:id/logo (subiendo un archivo a Cloudinary).
// Esto evita que una URL arbitraria desincronice `logo` y `logoPublicId`.
export class ActualizarMarcaDto {
  @ValidateIf((_, value: unknown) => value !== undefined)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty({ message: 'El nombre no puede estar vacío' })
  @MaxLength(100, { message: 'El nombre no puede superar los 100 caracteres' })
  nombre?: string;

  @ValidateIf((_, value: unknown) => value !== undefined)
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @IsNotEmpty({ message: 'El código no puede estar vacío' })
  @MaxLength(10)
  @Matches(/^[A-Z0-9]+$/, {
    message: 'El código solo admite letras y números',
  })
  codigo?: string;
}
