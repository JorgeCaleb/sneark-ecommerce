export function publicIdDesdeUrlCloudinary(
  valor: string | null,
  carpeta: string,
): string | null {
  if (!valor) return null;

  let pathname: string;
  try {
    const url = new URL(valor);
    if (url.hostname !== 'res.cloudinary.com') return null;
    pathname = url.pathname;
  } catch {
    return null;
  }

  const segmentos = pathname.split('/').filter(Boolean);
  const uploadIndex = segmentos.indexOf('upload');
  if (uploadIndex < 0) return null;

  const assetSegments = segmentos.slice(uploadIndex + 1);
  if (assetSegments[0]?.match(/^v\d+$/)) assetSegments.shift();

  const publicIdConExtension = assetSegments.join('/');
  const prefijoCarpeta = `${carpeta}/`;
  if (!publicIdConExtension.startsWith(prefijoCarpeta)) return null;

  const extensionIndex = publicIdConExtension.lastIndexOf('.');
  if (extensionIndex <= prefijoCarpeta.length) return null;
  return publicIdConExtension.slice(0, extensionIndex);
}
