/**
 * A division's emblem in the tile frame as a standalone SVG string (pure): the share card
 * (src/lib/share/render.tsx) draws it with next/og, where React SVG with ids and CSS can't
 * go. Since the medals (2026-10-30) the card shows MKCentral's medal and this draws only
 * what has none: Placement, or a division added before we have its medal. Same art as MmrEmblem's tile: chevrons for Iron to Silver, a star for Gold, gems from
 * Platinum to Diamond, a crown for Master, a crown in a laurel for Grandmaster, a question
 * mark in placement, and bars for MK8DX's numbered levels. No text (the renderer has no
 * fonts for SVG text), so the question mark and the levels are drawn as shapes.
 */

import { GLYPHS } from "@/components/mmr/glyphs";
import { shade, type DivisionLook } from "./look";

const paths = (list: string[]) => list.map((d) => `<path d="${d}"/>`).join("");

function mark(d: DivisionLook, col: string): string {
  if (d.kind === "placement") {
    return `<g transform="translate(26 26) scale(2)" fill="none" stroke="${col}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M8 8a3.5 3 0 0 1 3.5 -3h1a3.5 3 0 0 1 3.5 3a3 3 0 0 1 -2 3a3 4 0 0 0 -2 4"/><path d="M12 19l0 .01"/></g>`;
  }
  if (d.kind === "metal") {
    if (d.mark >= 4) return `<g transform="translate(30 30) scale(1.67)" fill="${col}">${paths(GLYPHS.StarFilled)}</g>`;
    const rows = Array.from({ length: d.mark }, (_, i) => {
      const y = 62 - i * 11 + (d.mark - 1) * 5.5;
      return `<path d="M34 ${y} L50 ${y - 10} L66 ${y}"/>`;
    }).join("");
    return `<g fill="none" stroke="${col}" stroke-width="6.5" stroke-linecap="round" stroke-linejoin="round">${rows}</g>`;
  }
  if (d.kind === "gem") {
    const ring = d.mark >= 3 ? `<circle cx="50" cy="50" r="28" fill="none" stroke="${col}" stroke-width="3.2" opacity="0.9"/>` : "";
    const gem = d.mark >= 2
      ? `<g transform="translate(28 28) scale(1.83)" fill="${col}">${paths(GLYPHS.DiamondFilled)}</g>`
      : `<g transform="translate(26 26) scale(2)" fill="none" stroke="${col}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${paths(GLYPHS.Diamond)}</g>`;
    const sparkles = d.mark >= 4
      ? `<g fill="${col}"><path d="M76 18 l2.2 5.8 5.8 2.2 -5.8 2.2 -2.2 5.8 -2.2 -5.8 -5.8 -2.2 5.8 -2.2z"/><path d="M23 70 l1.6 4.2 4.2 1.6 -4.2 1.6 -1.6 4.2 -1.6 -4.2 -4.2 -1.6 4.2 -1.6z"/></g>`
      : "";
    return ring + gem + sparkles;
  }
  return d.laurel
    ? `<g transform="translate(17 21) scale(2.75)" fill="none" stroke="${col}" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round">${paths(GLYPHS.Laurel)}</g><g transform="translate(36 31) scale(1.17)" fill="${col}">${paths(GLYPHS.CrownFilled)}</g>`
    : `<g transform="translate(28 27) scale(1.83)" fill="${col}">${paths(GLYPHS.CrownFilled)}</g>`;
}

/** MK8DX's I and II as Roman numerals drawn with strokes (bars between a top and bottom serif) in a small badge. */
function level(n: number | null): string {
  if (!n) return "";
  const bars = Math.min(3, n);
  const gap = 5;
  const total = (bars - 1) * gap;
  const x0 = 80 - total / 2;
  const stems = Array.from({ length: bars }, (_, i) => `M${x0 + i * gap} 74.5 V85.5`).join(" ");
  const serif = `M${x0 - 3.2} 74.5 H${x0 + total + 3.2} M${x0 - 3.2} 85.5 H${x0 + total + 3.2}`;
  return `<circle cx="80" cy="80" r="15" fill="#11162e" stroke="#fff" stroke-width="3"/><path d="${stems} ${serif}" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/>`;
}

/** The tile emblem for a division, `px` square. */
export function emblemSvg(d: DivisionLook, px = 200): string {
  const k = 0.84;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 100 100">`
    + `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${d.c}"/><stop offset=".55" stop-color="${d.c2}"/><stop offset="1" stop-color="${shade(d.c2, -0.3)}"/></linearGradient>`
    + `<linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0.5"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>`
    + `<rect x="3" y="3" width="94" height="94" rx="24" fill="url(#g)"/>`
    + `<rect x="3" y="3" width="94" height="50" rx="24" fill="url(#s)" opacity="0.55"/>`
    + `<rect x="4.5" y="4.5" width="91" height="91" rx="22.5" fill="none" stroke="#fff" stroke-opacity="0.4" stroke-width="3"/>`
    + `<g transform="translate(50 52.5) scale(${k}) translate(-50 -50)" opacity="0.3">${mark(d, "#0b0f2b")}</g>`
    + `<g transform="translate(50 50) scale(${k}) translate(-50 -50)">${mark(d, "#fff")}</g>`
    + level(d.level)
    + `</svg>`;
}
