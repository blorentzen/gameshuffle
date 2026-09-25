/**
 * Personalization must not be able to break WCAG AA.
 *
 * A profile background is whatever its owner picked, and our text tokens are
 * calibrated for a neutral page — put `--text-secondary` on a mid-green skin
 * and it lands near 2:1. `skinCssVars` derives the foreground from the actual
 * background instead; this asserts the floor holds for every background the
 * product can produce, including the awkward mid-tones where neither white nor
 * black is comfortable.
 *
 *   npx tsx scripts/test-skin-contrast.ts
 */

import { contrastRatio, onBackground, AA_TEXT, AA_UI } from "../src/lib/theme/contrast";
import { SKIN_GRADIENTS } from "../src/lib/profile/skin";

const stopsOf = (css: string) => css.match(/#[0-9a-fA-F]{6}/g) ?? [];

/** Flat colours: the six brand presets, plus the mid-tones that are hardest —
 *  a colour near 0.5 luminance fails white AND black at 4.5:1. */
const FLATS: [string, string][] = [
  ["brand indigo", "#2766ec"], ["violet", "#c949e9"], ["forest", "#2f9e44"],
  ["neon pink", "#ff2d95"], ["cyan", "#00e5ff"], ["sunset", "#ff6b6b"],
  ["amber", "#f59e0b"], ["candy", "#ff8fab"], ["midnight", "#2b3a67"],
  ["mid grey", "#808080"], ["mid green", "#4caf78"], ["mid teal", "#3aa6a6"],
  ["white", "#ffffff"], ["black", "#000000"],
];

let failures = 0;
let worstText = Infinity;

/** rgba(r,g,b,a) over an opaque hex — what the eye (and WCAG) actually sees. */
function composite(plate: string | null, bg: string): string {
  if (!plate) return bg;
  const m = plate.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)\)/);
  if (!m) return bg;
  const [pr, pg, pb, a] = m.slice(1).map(Number);
  const n = parseInt(bg.slice(1), 16);
  const [br, bgc, bb] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const c = (p: number, b: number) => Math.round(p * a + b * (1 - a)).toString(16).padStart(2, "0");
  return `#${c(pr, br)}${c(pg, bgc)}${c(pb, bb)}`;
}

function check(label: string, stops: string[]) {
  const fg = onBackground(stops);
  // Measure against what the text actually sits on: the plate when there is
  // one, the raw background when there is not.
  const min = (c: string) => Math.min(...stops.map((bg) => contrastRatio(c, composite(fg.plate, bg))));
  const onR = min(fg.on), mutedR = min(fg.muted), ruleR = min(fg.rule);
  worstText = Math.min(worstText, onR, mutedR);

  const bad: string[] = [];
  if (onR < AA_TEXT) bad.push(`on ${onR.toFixed(2)}`);
  if (mutedR < AA_TEXT) bad.push(`muted ${mutedR.toFixed(2)}`);
  if (ruleR < AA_UI) bad.push(`rule ${ruleR.toFixed(2)}`);

  const status = bad.length ? `FAIL (${bad.join(", ")})` : fg.plate ? `pass (plate ${fg.plate})` : "pass";
  if (bad.length) failures++;
  console.log(
    `  ${label.padEnd(16)} ${stops.join(" → ").padEnd(20)} on=${onR.toFixed(2)} muted=${mutedR.toFixed(2)} rule=${ruleR.toFixed(2)}  ${status}`,
  );
}

console.log("\nGradient presets (text must clear the WORSE end):");
for (const [id, css] of Object.entries(SKIN_GRADIENTS)) check(id, stopsOf(css));

console.log("\nFlat backgrounds:");
for (const [label, hex] of FLATS) check(label, [hex]);

// The regression this exists to prevent: the raw tokens on a themed page.
console.log("\nWhat the raw tokens measured on the reported background (#2f9e44-ish):");
for (const [tok, val] of [["--text-secondary", "#5b6478"], ["--text-tertiary", "#8b93a5"]] as const) {
  console.log(`  ${tok.padEnd(18)} ${contrastRatio(val, "#22b573").toFixed(2)}:1  (needs ${AA_TEXT})`);
}

console.log(
  failures === 0
    ? `\nAll backgrounds clear AA. Worst text ratio: ${worstText.toFixed(2)}:1.\n`
    : `\n${failures} background(s) FAILED.\n`,
);
process.exit(failures === 0 ? 0 : 1);
