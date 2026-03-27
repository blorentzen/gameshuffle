const CDN_BASE = "https://cdn.empac.co/gameshuffle/images";
const LEGACY_PREFIX = "/files/images/fg";

/**
 * Safety net — transforms any remaining legacy paths to CDN URLs.
 * For paths that are already CDN URLs, returns them unchanged.
 */
export function resolveCdnUrl(imgPath: string): string {
  if (!imgPath) return "";
  if (imgPath.startsWith(CDN_BASE)) return imgPath;
  if (imgPath.startsWith(LEGACY_PREFIX)) return imgPath.replace(LEGACY_PREFIX, CDN_BASE);
  return imgPath;
}

/** Typed CDN helpers for MK8DX assets */
export const MK8DX_CDN = `${CDN_BASE}/mk8dx`;

export const mk8dx = {
  character: (slug: string) => `${MK8DX_CDN}/characters/${slug}.png`,
  vehicle: (slug: string) => `${MK8DX_CDN}/vehicles/${slug}.webp`,
  wheel: (slug: string) => `${MK8DX_CDN}/wheels/${slug}.webp`,
  glider: (slug: string) => `${MK8DX_CDN}/gliders/${slug}.webp`,
  cup: (slug: string) => `${MK8DX_CDN}/cups/${slug}.png`,
  course: (cup: string, slug: string) => `${MK8DX_CDN}/courses/${cup}/${slug}.webp`,
  item: (slug: string) => `${MK8DX_CDN}/items/${slug}.webp`,
};

/** Typed CDN helpers for MKW assets */
export const MKW_CDN = `${CDN_BASE}/mkw`;

export const mkw = {
  character: (slug: string) => `${MKW_CDN}/characters/${slug}.png`,
  vehicle: (slug: string) => `${MKW_CDN}/vehicles/${slug}.webp`,
};
