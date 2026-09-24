/**
 * WCAG contrast maths for user-chosen brand colors. Client-safe and pure.
 *
 * GameShuffle lets people pick any two hex colors for a custom theme, and those
 * colors end up behind real text: nav, footer, buttons, links on their profile.
 * A fixed `color-mix(brand 74%, black)` happens to work for some hues and fails
 * for others — measured against the shipped presets, `candy` landed at 3.80:1 on
 * white, and button text on `sunset` at 2.78:1. Expression is the point of the
 * product, so the answer is not to restrict the palette: it is to derive a
 * readable foreground for whatever color someone picks.
 *
 * Everything here targets WCAG 2.1 AA: 4.5:1 for body text, 3:1 for large text
 * and for UI boundaries.
 */

export const AA_TEXT = 4.5;
export const AA_LARGE = 3;

type RGB = [number, number, number];

function parseHex(hex: string | null | undefined): RGB | null {
  if (typeof hex !== "string") return null;
  const h = hex.trim().replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as RGB;
}

function toHex([r, g, b]: RGB): string {
  return `#${[r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("")}`;
}

function channelLuminance(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

export function relativeLuminance(hex: string | null | undefined): number {
  const rgb = parseHex(hex);
  if (!rgb) return 0;
  const [r, g, b] = rgb.map(channelLuminance);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio, 1 (identical) to 21 (black on white). */
export function contrastRatio(a: string | null | undefined, b: string | null | undefined): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

function mix(a: string, b: string, weightOfA: number): string {
  const ca = parseHex(a);
  const cb = parseHex(b);
  if (!ca || !cb) return a;
  return toHex(ca.map((v, i) => v * weightOfA + cb[i] * (1 - weightOfA)) as RGB);
}

/**
 * The brand color, darkened or lightened just enough to be readable ON `surface`.
 *
 * Walks toward black (on a light surface) or white (on a dark one) and stops at
 * the first step that clears the target, so the result keeps as much of the
 * chosen hue as the requirement allows rather than collapsing every brand to
 * near-black. Falls back to plain black or white if even the extreme fails,
 * which only happens for a surface that is mid-grey.
 */
export function readableInk(brand: string, surface: string, target = AA_TEXT): string {
  if (!parseHex(brand) || !parseHex(surface)) return brand;
  if (contrastRatio(brand, surface) >= target) return brand;

  const towards = relativeLuminance(surface) > 0.5 ? "#000000" : "#ffffff";
  // 5% steps: fine enough that the hue shift is imperceptible, coarse enough to
  // stay cheap when this runs per render.
  for (let w = 0.95; w >= 0; w -= 0.05) {
    const candidate = mix(brand, towards, w);
    if (contrastRatio(candidate, surface) >= target) return candidate;
  }
  return towards;
}

/**
 * Text to put ON a brand-colored fill (a primary button, a filled badge).
 * Prefers whichever of white / near-black reads better, and only reports the
 * ratio so callers can decide whether the fill itself needs adjusting.
 */
export function onColorFor(background: string): { color: string; ratio: number; passes: boolean } {
  const white = contrastRatio("#ffffff", background);
  const black = contrastRatio("#0b0b0f", background);
  const color = white >= black ? "#ffffff" : "#0b0b0f";
  const ratio = Math.max(white, black);
  return { color, ratio, passes: ratio >= AA_TEXT };
}

/**
 * A brand fill adjusted until its best text color is readable on it.
 *
 * Mid-tone brands (a mid pink, a mid orange) are the problem case: neither white
 * nor black clears 4.5:1 against them, so the FILL has to move. Darkens or
 * lightens whichever direction it is already leaning, which keeps a bright brand
 * bright and a deep brand deep.
 */
export function accessibleFill(brand: string, target = AA_TEXT): { fill: string; on: string } {
  const first = onColorFor(brand);
  if (first.passes) return { fill: brand, on: first.color };

  // Push away from mid-grey: a light-ish brand goes lighter (black text), a
  // dark-ish one goes darker (white text).
  const towards = relativeLuminance(brand) > 0.35 ? "#ffffff" : "#000000";
  for (let w = 0.95; w >= 0; w -= 0.05) {
    const fill = mix(brand, towards, w);
    const on = onColorFor(fill);
    if (on.ratio >= target) return { fill, on: on.color };
  }
  return { fill: towards === "#ffffff" ? "#ffffff" : "#000000", on: towards === "#ffffff" ? "#0b0b0f" : "#ffffff" };
}

export const AA_UI = 3;

/**
 * The brand colour adjusted until it is VISIBLE as a fill on `surface`.
 *
 * Different requirement from `readableInk`: this is a filled element (a button,
 * an active tab) that has to separate from the page behind it, which WCAG 1.4.11
 * puts at 3:1. A dark navy brand on a dark page measures 1.79:1 — the button is
 * there, you just cannot see it. Lightens on a dark surface and darkens on a
 * light one, then returns the text colour for the ADJUSTED fill, because moving
 * the fill can flip which of white/black reads on it.
 */
export function visibleFill(brand: string, surface: string, target = AA_UI): { fill: string; on: string } {
  const start = parseHex(brand) ? brand : "#2766ec";
  const towards = relativeLuminance(surface) > 0.5 ? "#000000" : "#ffffff";

  let fill = start;
  if (contrastRatio(start, surface) < target) {
    for (let w = 0.95; w >= 0; w -= 0.05) {
      const candidate = mix(start, towards, w);
      if (contrastRatio(candidate, surface) >= target) { fill = candidate; break; }
      fill = towards;
    }
  }
  // Text has to clear the full 4.5:1 against whatever the fill ended up being.
  const readable = accessibleFill(fill);
  return { fill: readable.fill, on: readable.on };
}

/** Reports every AA problem in a theme, for the editor's warning and for tests. */
export function auditBrandColors(opts: {
  primary: string;
  accent: string;
  on: string;
  lightSurface?: string;
  darkSurface?: string;
}): { ok: boolean; problems: string[] } {
  const light = opts.lightSurface ?? "#ffffff";
  const dark = opts.darkSurface ?? "#0a0a0f";
  const problems: string[] = [];

  const onRatio = contrastRatio(opts.on, opts.primary);
  if (onRatio < AA_TEXT) problems.push(`text on the primary fill is ${onRatio.toFixed(2)}:1`);

  for (const [label, color] of [["primary", opts.primary], ["accent", opts.accent]] as const) {
    if (contrastRatio(readableInk(color, light), light) < AA_TEXT) problems.push(`${label} is unreadable on a light surface`);
    if (contrastRatio(readableInk(color, dark), dark) < AA_TEXT) problems.push(`${label} is unreadable on a dark surface`);
  }
  return { ok: problems.length === 0, problems };
}
