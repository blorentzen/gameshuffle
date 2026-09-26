/**
 * The header art draws WHITE glyphs on its gradient. When an owner's brand
 * drives that gradient, a pale brand swallows them — the same failure as a
 * brand CTA on a brand-coloured page, one layer down.
 *
 *   npx tsx scripts/test-brand-art-ramp.ts
 */

import { contrastRatio, darkenForWhite, AA_UI } from "../src/lib/theme/contrast";
import { BRAND_THEMES, buildCustomTheme } from "../src/lib/theme/brand";

let failures = 0;

function check(label: string, primary: string, accent: string) {
  const from = darkenForWhite(primary);
  const to = darkenForWhite(accent);
  const rFrom = contrastRatio("#ffffff", from);
  const rTo = contrastRatio("#ffffff", to);
  const ok = rFrom >= AA_UI && rTo >= AA_UI;
  if (!ok) failures++;
  console.log(
    `  ${ok ? "pass" : "FAIL"}  ${label.padEnd(12)} ${primary}->${from} ${rFrom.toFixed(2)}:1   ` +
    `${accent}->${to} ${rTo.toFixed(2)}:1`,
  );
}

console.log("\nShipped presets:");
for (const t of BRAND_THEMES) check(t.id, t.primary, t.accent);

// A custom theme is two arbitrary hex values, which is where the pale ones come
// from — nobody picks "candy" expecting an invisible trophy.
console.log("\nCustom themes, including the ones that break it:");
for (const [label, p, a] of [
  ["white", "#ffffff", "#ffffff"],
  ["pale yellow", "#fff7b2", "#ffe066"],
  ["pale cyan", "#c9f7ff", "#a5f3fc"],
  ["pastel pink", "#ffd6e7", "#ffc2d9"],
  ["mid grey", "#808080", "#9aa0a6"],
  ["already dark", "#10131a", "#1b2a6b"],
] as const) {
  const t = buildCustomTheme(p, a);
  check(label, t.primary, t.accent);
}

console.log(
  failures === 0
    ? "\nWhite glyphs clear 3:1 on every brand ramp.\n"
    : `\n${failures} ramp(s) FAILED.\n`,
);
process.exit(failures === 0 ? 0 : 1);
