import "server-only";

/**
 * Symbol fonts for every next/og picture (2026-11-10, found on Umiko's war table: "★Larryツ" drew a box). next/og's own
 * fallback asks Google for Noto Sans Symbols first, gets an error for a glyph only Symbols 2 has (★ ♡ ✦ …) and gives
 * up, so both ship with us: Noto Sans Symbols and Symbols 2 (SIL Open Font License), cut to U+2100 and up with fonttools
 * so letters still come from each picture's own fonts. Put last in a picture's `fonts`; read once per process.
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";

export type OgFont = { name: string; data: Buffer; weight: 400; style: "normal" };

let cache: Promise<OgFont[]> | null = null;

export function symbolFonts(): Promise<OgFont[]> {
  const dir = join(process.cwd(), "src/app/fonts");
  return (cache ??= Promise.all([readFile(join(dir, "noto-sans-symbols.ttf")), readFile(join(dir, "noto-sans-symbols-2.ttf"))]).then(([a, b]) => [
    { name: "Symbols", data: a, weight: 400 as const, style: "normal" as const },
    { name: "Symbols 2", data: b, weight: 400 as const, style: "normal" as const },
  ]));
}
