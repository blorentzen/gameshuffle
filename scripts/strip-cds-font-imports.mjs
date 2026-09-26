/**
 * Neutralise the Google Fonts @imports inside CDS's stylesheet.
 *
 * WHY THIS EXISTS, and why it is not a CascadeDS change:
 *
 * CDS's `dist/styles.css` opens with three `@import url(fonts.googleapis.com…)`
 * lines for DM Sans, Inter and Roboto Mono. GameShuffle overrides
 * `--font-display` and `--font-body` to self-hosted Gabarito and Outfit (see
 * layout.tsx), so two of those three families are downloaded and never used.
 * A CSS `@import` is render-blocking and serial — the browser has to fetch and
 * parse styles.css before it even starts the font request — and hot-linking
 * Google Fonts sends every visitor's IP to a third party, which matters given
 * the DSAR and consent work elsewhere in this product.
 *
 * Overriding the TOKENS is the sanctioned CDS extension point and is what we
 * do. This script only removes the now-dead download; it changes no styling.
 *
 * Why not the obvious alternatives:
 *   - A PostCSS plugin would work, but Next.js "completely disables" its
 *     default CSS pipeline the moment a postcss config exists, so we would be
 *     re-implementing Next's defaults to delete two lines. Bad trade.
 *   - `dist/cascadeds.css` ships without the @imports, but it carries only 70
 *     of the 303 design tokens — it is the component layer without the token
 *     layer, so swapping to it breaks theming entirely.
 *
 * ROBOTO MONO IS DELIBERATELY KEPT: `--font-mono` is still used (economy and
 * staff tables, account editors, live). Only the two dead families go.
 *
 * Safe to run repeatedly, and a no-op if CDS ever drops the imports itself.
 * Runs from `postinstall`, so a fresh `npm install` on Vercel re-applies it.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";

const TARGET = "node_modules/@empac/cascadeds/dist/styles.css";
/** Families we now self-host and therefore no longer need from Google. */
const DEAD = ["DM+Sans", "Inter"];

if (!existsSync(TARGET)) {
  console.log("[cds-fonts] stylesheet not found, skipping");
  process.exit(0);
}

const before = readFileSync(TARGET, "utf8");
let after = before;
let removed = 0;

for (const family of DEAD) {
  // Comment the line out rather than deleting it, so the reason survives in
  // the file for anyone who goes looking.
  const re = new RegExp(
    `^@import url\\('https://fonts\\.googleapis\\.com/css2\\?family=${family.replace("+", "\\+")}[^']*'\\);$`,
    "gm",
  );
  after = after.replace(re, (line) => {
    removed += 1;
    return `/* stripped by scripts/strip-cds-font-imports.mjs — self-hosted via next/font */\n/* ${line} */`;
  });
}

if (removed === 0) {
  console.log("[cds-fonts] nothing to strip (already applied, or CDS changed)");
} else {
  writeFileSync(TARGET, after);
  console.log(`[cds-fonts] stripped ${removed} dead Google Fonts import(s); Roboto Mono kept (--font-mono is still used)`);
}
