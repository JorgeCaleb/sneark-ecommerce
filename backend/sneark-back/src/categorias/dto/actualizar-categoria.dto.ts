import { PartialType } from '@nestjs/mapped-types';
import { CrearCategoriaDto } from './crear-categoria.dto.js';

export class ActualizarCategoriaDto extends PartialType(CrearCategoriaDto) {}
