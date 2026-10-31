/** Los códigos del inventario son códigos SKU, no valores CSS. */
export function colorVisual(color: { nombre: string; codigo: string }): string | null {
  if (/^#[\da-f]{3}([\da-f]{3})?$/i.test(color.codigo)) return color.codigo;
  const nombre = color.nombre
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
  const colores: Record<string, string> = {
    blanco: '#fff',
    marfil: '#f5f3ef',
    grafito: '#242424',
    negro: '#242424',
    gris: '#e9e9e9',
    plata: '#b8b8b8',
    beige: '#d9c8a8',
    arena: '#d9c8a8',
    crema: '#fff5d6',
    azul: '#294a6c',
    rojo: '#b72f36',
    verde: '#526b50',
    rosa: '#eab1bf',
    marron: '#795548',
    amarillo: '#e9bf30',
    naranja: '#de782d',
    morado: '#7b5695',
    dorado: '#c2a459',
    burdeos: '#742b3d',
    crudo: '#eee6d7',
  };
  return colores[nombre] ?? null;
}
