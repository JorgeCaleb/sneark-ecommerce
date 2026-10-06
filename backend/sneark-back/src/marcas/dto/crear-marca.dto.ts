import { IsNotEmpty, IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';

export class CrearMarcaDto {
  @IsString()
  @IsNotEmpty({ message: 'El nombre es obligatorio' })
  @MaxLength(100, { message: 'El nombre no puede superar los 100 caracteres' })
  nombre: string;

  @IsOptional()
  @IsUrl({}, { message: 'El logo debe ser una URL válida' })
  @MaxLength(500)
  logo?: string;
}
