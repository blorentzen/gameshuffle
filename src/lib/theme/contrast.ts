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

function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
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

/**
 * A foreground set for text sitting DIRECTLY on a user-chosen background.
 *
 * The other helpers here fix a brand colour used as ink or as a fill on one of
 * OUR surfaces. This is the inverse case, and the one personalization actually
 * broke: the user picks the surface, and our text tokens (`--text-secondary`,
 * `--text-tertiary`) are calibrated for a neutral page. Put them on a mid-green
 * profile background and the tab labels and the Block / Report links drop to
 * around 2:1.
 *
 * `stops` is every colour the text might sit over — one for a flat colour, both
 * ends for a gradient — because a foreground that clears AA against one end of
 * a gradient can fail at the other. Everything returned clears the worst of
 * them, so expression stays unrestricted and the floor holds.
 */
export function onBackground(stops: string[]): {
  on: string;
  muted: string;
  rule: string;
  /**
   * Set when the background CANNOT carry AA text directly — some gradients span
   * mid-tones where neither white nor black clears 4.5:1 at both ends. Then the
   * text needs its own surface, and this is the least-opaque scrim that gets
   * every role over the line. A shadow would look like a fix without being one:
   * WCAG measures against the composited background, which a shadow leaves
   * unchanged.
   */
  plate: string | null;
  /** Worst measured ratio for `on`, so a test or an editor warning can report it. */
  ratio: number;
} {
  const valid = stops.filter((c) => parseHex(c));
  if (valid.length === 0) {
    return { on: "#ffffff", muted: "#ffffff", rule: "rgba(255,255,255,0.28)", plate: null, ratio: 21 };
  }

  const worstAgainst = (fg: string, surfaces: string[]) =>
    Math.min(...surfaces.map((bg) => contrastRatio(fg, bg)));

  // Pick whichever of white / near-black survives the WORST stop, not the average.
  const onWhite = worstAgainst("#ffffff", valid);
  const onDark = worstAgainst("#0b0b0f", valid);
  const on = onWhite >= onDark ? "#ffffff" : "#0b0b0f";

  /**
   * Muted text and rules, stepped toward the surface only as far as their
   * target allows. "Secondary" is not a licence to drop below AA, so muted
   * still owes 4.5:1; a rule is a UI boundary at 3:1 (WCAG 1.4.11).
   */
  const derive = (surfaces: string[]) => {
    let muted = on;
    for (let w = 0.6; w <= 1; w += 0.05) {
      const c = mix(on, surfaces[0], w);
      if (worstAgainst(c, surfaces) >= AA_TEXT) { muted = c; break; }
    }
    let rule = on;
    for (let w = 0.3; w <= 1; w += 0.05) {
      const c = mix(on, surfaces[0], w);
      if (worstAgainst(c, surfaces) >= AA_UI) { rule = c; break; }
    }
    return { muted, rule };
  };

  const ratio = Math.max(onWhite, onDark);
  if (ratio >= AA_TEXT) {
    const { muted, rule } = derive(valid);
    return { on, muted, rule, plate: null, ratio };
  }

  // No text colour can work on this background, so give the text a surface.
  // Composite a scrim over every stop and take the lowest opacity at which ALL
  // THREE roles clear their target — checking only `on` leaves muted failing.
  const scrim = on === "#ffffff" ? [0, 0, 0] : [255, 255, 255];
  for (let a = 0.1; a <= 0.96; a += 0.05) {
    const composited = valid.map((bg) => {
      const [r, g, b] = parseHex(bg)!;
      return rgbToHex(scrim[0] * a + r * (1 - a), scrim[1] * a + g * (1 - a), scrim[2] * a + b * (1 - a));
    });
    if (worstAgainst(on, composited) < AA_TEXT) continue;
    const { muted, rule } = derive(composited);
    if (worstAgainst(muted, composited) < AA_TEXT) continue;
    if (worstAgainst(rule, composited) < AA_UI) continue;
    return { on, muted, rule, plate: `rgba(${scrim.join(",")},${a.toFixed(2)})`, ratio };
  }

  // Opaque scrim: the owner's background is fully hidden behind the text only,
  // which is the last resort and still better than unreadable chrome.
  const solid = on === "#ffffff" ? "#0b0b0f" : "#ffffff";
  const { muted, rule } = derive([solid]);
  return { on, muted, rule, plate: solid, ratio };
}

/**
 * A colour darkened until WHITE reads on it.
 *
 * The generated header art draws white glyphs over a gradient: the feature
 * glyph at full opacity, the scatter behind it. When an owner's brand drives
 * that gradient, a pale brand (candy, a light cyan) swallows the glyph
 * entirely. `accessibleFill` is not the tool — it picks whichever of white or
 * black reads, and the art is committed to white.
 *
 * 3:1, because the glyph is a meaningful graphic rather than text (WCAG
 * 1.4.11). The title sitting over the band is handled by the scrim, not here.
 */
export function darkenForWhite(hex: string, target = AA_UI): string {
  const start = parseHex(hex) ? hex : "#1b2a6b";
  if (contrastRatio("#ffffff", start) >= target) return start;
  for (let w = 0.95; w >= 0; w -= 0.05) {
    const candidate = mix(start, "#000000", w);
    if (contrastRatio("#ffffff", candidate) >= target) return candidate;
  }
  return "#000000";
}
