import { IsEmail, IsNotEmpty, IsString, Matches, MinLength, MaxLength } from 'class-validator';

export class CrearUsuarioDto {
  @IsString()
  @IsNotEmpty({ message: 'El nombre es obligatorio' })
  @MaxLength(100, { message: 'El nombre no puede superar los 100 caracteres' })
  @Matches(/^[\p{L}\p{M} '\-.]+$/u, {
    message: 'El nombre solo puede contener letras, espacios, guiones, apóstrofes y puntos',
  })
  nombre: string;

  @IsEmail({}, { message: 'El email no es válido' })
  @MaxLength(191)
  email: string;

  @IsString()
  @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres' })
  @MaxLength(50)
  password: string;
}
