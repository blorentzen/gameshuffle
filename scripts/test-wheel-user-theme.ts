/**
 * The brand-derived wheel theme has to hold for ANY two colours, because a
 * custom brand theme is two arbitrary hex values the streamer picked.
 *
 * Two things are checked:
 *   1. Label text clears 3.5:1 on every slice. Wheel labels are large and bold,
 *      which is WCAG's 3:1 case; 3.5 leaves margin for the sheen drawn over
 *      them. The first cut used a fixed lightness band and neon measured
 *      1.69:1, so each slice is now darkened until it passes.
 *   2. An achromatic brand stays achromatic. hexToHsl reports hue 0 for grey,
 *      which is red, so the saturation floor used to turn a greyscale brand
 *      into a red wheel.
 *
 * Run: npx tsx scripts/test-wheel-user-theme.ts
 */

import { themeFromBrand } from "../src/lib/wheel/themes";
import { contrastRatio } from "../src/lib/theme/contrast";

const LABEL_MIN = 3.5;

const CASES: { name: string; primary: string; accent: string; grey?: boolean }[] = [
  // Shipped presets.
  { name: "default", primary: "#2766ec", accent: "#c949e9" },
  { name: "midnight", primary: "#2b3a67", accent: "#c6a24e" },
  { name: "neon", primary: "#ff2d95", accent: "#00e5ff" },
  { name: "sunset", primary: "#ff6b6b", accent: "#ff9f43" },
  { name: "forest", primary: "#2f9e44", accent: "#157a52" },
  { name: "candy", primary: "#ff8fab", accent: "#a0e7e5" },
  // Custom themes: arbitrary input, including the degenerate cases.
  { name: "identical", primary: "#ff0000", accent: "#ff0000" },
  { name: "opposite-hue", primary: "#00ff00", accent: "#ff00ff" },
  { name: "very-dark", primary: "#050505", accent: "#0a0a0a", grey: true },
  { name: "near-white", primary: "#fefefe", accent: "#fdfdfd", grey: true },
  { name: "greyscale", primary: "#808080", accent: "#c0c0c0", grey: true },
  { name: "black-white", primary: "#000000", accent: "#ffffff", grey: true },
];

const HEX = /^#[0-9a-f]{6}$/;
/** Max channel spread — 0 for a pure grey. */
const chroma = (hex: string): number => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return Math.max(r, g, b) - Math.min(r, g, b);
};

let failures = 0;
console.log(`Brand-derived wheel themes (labels must clear ${LABEL_MIN}:1)\n`);

for (const c of CASES) {
  const t = themeFromBrand(c.primary, c.accent);
  const problems: string[] = [];

  const badHex = t.palette.filter((p) => !HEX.test(p));
  if (badHex.length) problems.push(`invalid hex: ${badHex.join(",")}`);
  if (t.palette.length !== 8) problems.push(`expected 8 slices, got ${t.palette.length}`);

  const worst = Math.min(...t.palette.map((p) => contrastRatio(t.label, p)));
  if (worst < LABEL_MIN) problems.push(`label contrast ${worst.toFixed(2)}:1`);

  if (c.grey) {
    const tinted = t.palette.filter((p) => chroma(p) > 12);
    if (tinted.length) problems.push(`grey brand produced tinted slices: ${tinted.join(",")}`);
  }

  if (problems.length) failures++;
  console.log(
    `${c.name.padEnd(13)} worst ${worst.toFixed(2).padStart(5)}:1  ` +
      (problems.length ? `FAIL — ${problems.join("; ")}` : "PASS"),
  );
}

if (failures > 0) {
  console.error(`\n${failures} case(s) failed.`);
  process.exit(1);
}
console.log("\nAll brand pairs produce a legible wheel.");
