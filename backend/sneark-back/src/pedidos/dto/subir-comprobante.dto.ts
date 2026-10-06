import { IsOptional, IsString, MaxLength } from 'class-validator';

export class SubirComprobanteDto {
  // Número de operación del comprobante Yape/Plin (opcional pero recomendado)
  @IsOptional()
  @IsString()
  @MaxLength(50)
  numeroOperacion?: string;
}
