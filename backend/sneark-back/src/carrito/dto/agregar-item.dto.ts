import { Type } from 'class-transformer';
import { IsInt, IsPositive, Min } from 'class-validator';

export class AgregarItemDto {
  @IsInt()
  @IsPositive({ message: 'Debe seleccionar una talla válida' })
  @Type(() => Number)
  tallaProductoId: number;

  @IsInt()
  @Min(1, { message: 'La cantidad mínima es 1' })
  @Type(() => Number)
  cantidad: number;
}
