export interface MetaPaginacion {
  total: number;
  pagina: number;
  limite: number;
  totalPaginas: number;
}

export interface RespuestaPaginada<T> {
  datos: T[];
  meta: MetaPaginacion;
}

export function construirMetaPaginacion(
  total: number,
  pagina: number,
  limite: number,
): MetaPaginacion {
  return {
    total,
    pagina,
    limite,
    totalPaginas: Math.ceil(total / limite),
  };
}
