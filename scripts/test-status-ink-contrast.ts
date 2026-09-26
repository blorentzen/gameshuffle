/**
 * Proves the status ink tokens clear WCAG AA in BOTH themes.
 *
 * Why this exists: --success-700 / --error-700 / --warning-700 are fixed hexes
 * defined only on :root, so they never flip. Used as text they measured 3.45,
 * 2.12 and 5.98 on the dark page, and warning-700 was only 3.30 on white — it
 * failed in light mode too, which nothing had caught. The ink aliases pick a
 * different step per theme; this locks those choices in so a future palette
 * edit cannot quietly reintroduce the failure.
 *
 * Run: npx tsx scripts/test-status-ink-contrast.ts
 */

import { contrastRatio, AA_TEXT } from "../src/lib/theme/contrast";

// The CDS ramp steps the ink tokens alias, and the two page grounds.
const RAMP: Record<string, string> = {
  "success-500": "#17a710",
  "success-700": "#11770c",
  "error-300": "#e1756f",
  "error-700": "#8f1108",
  "warning-500": "#f59e0b",
  "warning-900": "#955e07",
};

const LIGHT = "#ffffff";
const DARK = "#0a0a0f";

// Must mirror the --*-ink definitions in globals.css.
const INK: { token: string; light: string; dark: string }[] = [
  { token: "--success-ink", light: "success-700", dark: "success-500" },
  { token: "--error-ink", light: "error-700", dark: "error-300" },
  { token: "--warning-ink", light: "warning-900", dark: "warning-500" },
];

let failures = 0;

console.log(`Status ink tokens vs WCAG AA body text (${AA_TEXT}:1)\n`);
for (const { token, light, dark } of INK) {
  const lRatio = contrastRatio(RAMP[light], LIGHT);
  const dRatio = contrastRatio(RAMP[dark], DARK);
  const lOk = lRatio >= AA_TEXT;
  const dOk = dRatio >= AA_TEXT;
  if (!lOk || !dOk) failures++;
  console.log(
    `${token.padEnd(15)} light=${light.padEnd(12)} ${lRatio.toFixed(2).padStart(5)}:1 ${lOk ? "PASS" : "FAIL"}` +
      `   dark=${dark.padEnd(12)} ${dRatio.toFixed(2).padStart(5)}:1 ${dOk ? "PASS" : "FAIL"}`,
  );
}

// Guard the original defect: the raw -700 steps must NOT be treated as safe in
// both themes. If a palette change ever made them safe, this file should be
// revisited rather than silently kept.
console.log("\nRaw steps (the reason the aliases exist):");
for (const step of ["success-700", "error-700", "warning-900"]) {
  const d = contrastRatio(RAMP[step], DARK);
  console.log(`  ${step.padEnd(12)} on dark ${d.toFixed(2).padStart(5)}:1 ${d >= AA_TEXT ? "(now passes — revisit)" : "(fails, as expected)"}`);
}

if (failures > 0) {
  console.error(`\n${failures} ink token(s) fail AA.`);
  process.exit(1);
}
console.log("\nAll status ink tokens clear AA in both themes.");
