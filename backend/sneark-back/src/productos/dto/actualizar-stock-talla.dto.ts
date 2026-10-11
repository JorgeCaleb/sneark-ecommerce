import { IsInt, Max, Min } from 'class-validator';

export class ActualizarStockTallaDto {
  @IsInt({ message: 'El stock debe ser un número entero' })
  @Min(0, { message: 'El stock no puede ser negativo' })
  @Max(2_147_483_647, { message: 'El stock supera el máximo permitido' })
  stockEsperado: number;

  @IsInt({ message: 'El stock debe ser un número entero' })
  @Min(0, { message: 'El stock no puede ser negativo' })
  @Max(2_147_483_647, { message: 'El stock supera el máximo permitido' })
  stock: number;
}
