/**
 * Profile skin — background + card styling for /u. Client-safe.
 *
 * SECURITY: `resolveProfileSkin` is the single gate. It normalizes any stored/
 * submitted value: kind + enums are allowlisted, colors must be #rrggbb,
 * gradients must be a known preset id, and a background IMAGE URL is accepted
 * ONLY when it points at our own R2 UGC origin (`gs-ugc.empac.co`) — never an
 * arbitrary host (no external loads, no CSS-based exfiltration/tracking). Run it
 * on every read AND write. The upload API additionally verifies the URL with
 * `keyFromPublicUrl` server-side, so the origin check is enforced twice.
 */

import type { CSSProperties } from "react";
import { onBackground, visibleFill, contrastRatio } from "@/lib/theme/contrast";

/** The only host a background image may come from (our public R2 bucket). */
/** Our own R2 UGC origins — prod + dev. Both live on the same Cloudflare zone
 *  and are the only hosts a user-supplied image URL may point at. A static list
 *  (rather than an env read) keeps client + server validation identical. */
const UGC_HOSTS = new Set(["gs-ugc.empac.co", "gs-ugc-dev.empac.co"]);

export type BackgroundKind = "none" | "color" | "gradient" | "image";
/** How a background IMAGE sits on the page. The MySpace-era set. */
export type BackgroundFit = "cover" | "tile" | "contain" | "center";
export type CardBorder = "subtle" | "bold" | "none";
export type CardRadius = "sm" | "md" | "lg";

/** Curated gradient presets — the only gradients a profile may use. */
export const SKIN_GRADIENTS: Record<string, string> = {
  aurora: "linear-gradient(135deg, #5457e5 0%, #8b5cf6 100%)",
  grape: "linear-gradient(135deg, #7c3aed 0%, #d946a6 100%)",
  sunset: "linear-gradient(135deg, #f59e0b 0%, #e11d64 100%)",
  emerald: "linear-gradient(135deg, #10b981 0%, #0ea5e9 100%)",
  midnight: "linear-gradient(160deg, #1e293b 0%, #0b0d14 100%)",
  slate: "linear-gradient(160deg, #334155 0%, #0f172a 100%)",
};

export interface ProfileSkin {
  bg: { kind: BackgroundKind; color: string | null; gradient: string | null; image: string | null; fit: BackgroundFit };
  card: { border: CardBorder; radius: CardRadius };
}

export const DEFAULT_PROFILE_SKIN: ProfileSkin = {
  bg: { kind: "none", color: null, gradient: null, image: null, fit: "cover" },
  card: { border: "subtle", radius: "md" },
};

const HEX = /^#[0-9a-fA-F]{6}$/;
const hex = (v: unknown): string | null => (typeof v === "string" && HEX.test(v) ? v : null);
const oneOf = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
  (typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : fallback);

/** An https URL on our UGC origin, or null. The only image source allowed. */
export function safeUgcImageUrl(v: unknown): string | null {
  if (typeof v !== "string" || !v) return null;
  try {
    const u = new URL(v);
    return u.protocol === "https:" && UGC_HOSTS.has(u.hostname) ? v : null;
  } catch {
    return null;
  }
}

export function resolveProfileSkin(raw: unknown): ProfileSkin {
  if (!raw || typeof raw !== "object") return structuredCloneSkin(DEFAULT_PROFILE_SKIN);
  const obj = raw as Record<string, unknown>;
  const bgIn = (obj.bg && typeof obj.bg === "object" ? obj.bg : {}) as Record<string, unknown>;
  const cardIn = (obj.card && typeof obj.card === "object" ? obj.card : {}) as Record<string, unknown>;

  const kind = oneOf<BackgroundKind>(bgIn.kind, ["none", "color", "gradient", "image"], "none");
  const color = hex(bgIn.color);
  const gradient = typeof bgIn.gradient === "string" && bgIn.gradient in SKIN_GRADIENTS ? bgIn.gradient : null;
  const image = safeUgcImageUrl(bgIn.image);

  // Downgrade to "none" if the chosen kind has no valid value backing it.
  const effectiveKind: BackgroundKind =
    (kind === "color" && !color) || (kind === "gradient" && !gradient) || (kind === "image" && !image)
      ? "none"
      : kind;

  return {
    bg: {
      kind: effectiveKind, color, gradient, image,
      fit: oneOf<BackgroundFit>(bgIn.fit, ["cover", "tile", "contain", "center"], "cover"),
    },
    card: {
      border: oneOf<CardBorder>(cardIn.border, ["subtle", "bold", "none"], "subtle"),
      radius: oneOf<CardRadius>(cardIn.radius, ["sm", "md", "lg"], "md"),
    },
  };
}

function structuredCloneSkin(s: ProfileSkin): ProfileSkin {
  return { bg: { ...s.bg }, card: { ...s.card } };
}

const RADIUS_PX: Record<CardRadius, string> = { sm: "0.5rem", md: "0.9rem", lg: "1.4rem" };

/** The CSS background value for the page, or null when there's no custom bg. */
export function skinBackground(skin: ProfileSkin): string | null {
  switch (skin.bg.kind) {
    case "color": return skin.bg.color;
    case "gradient": return skin.bg.gradient ? SKIN_GRADIENTS[skin.bg.gradient] : null;
    case "image": return skin.bg.image ? `url("${skin.bg.image}")` : null;
    default: return null;
  }
}

/**
 * Every colour the page background can present to text sitting on it.
 *
 * A flat colour has one; a gradient has both ends, and text can land over
 * either, so a foreground has to clear the worse of the two. An image is
 * unknowable, so it gets no stops and the caller falls back to a scrim.
 */
function backgroundStops(skin: ProfileSkin): string[] {
  if (skin.bg.kind === "color") return skin.bg.color ? [skin.bg.color] : [];
  if (skin.bg.kind === "gradient" && skin.bg.gradient) {
    const css = SKIN_GRADIENTS[skin.bg.gradient];
    return css ? (css.match(/#[0-9a-fA-F]{6}/g) ?? []) : [];
  }
  return [];
}

/**
 * CSS custom props to spread on the profile root: card styling, and the
 * foreground set for chrome that sits directly on the owner's background.
 *
 * Personalization is the point of the product, so the answer to "this green
 * makes the tab labels unreadable" is not a smaller palette — it is to derive
 * the text colour from whatever they picked. `--skin-on*` are only consumed by
 * elements ON the background; anything inside a card keeps the normal tokens,
 * because a card supplies its own surface.
 */
export function skinCssVars(skin: ProfileSkin, brandPrimary?: string | null): CSSProperties {
  const vars: Record<string, string> = {
    "--pcard-radius": RADIUS_PX[skin.card.radius],
    "--pcard-border-width": skin.card.border === "none" ? "0px" : skin.card.border === "bold" ? "2px" : "1px",
  };

  const stops = backgroundStops(skin);
  if (stops.length > 0) {
    const fg = onBackground(stops);
    vars["--skin-on"] = fg.on;
    vars["--skin-on-muted"] = fg.muted;
    vars["--skin-rule"] = fg.rule;
    // Only set when the background cannot carry AA text on its own. Measured
    // at 10% for every preset that needs it, so the owner's gradient still
    // reads through.
    if (fg.plate) vars["--skin-plate"] = fg.plate;

    // A primary CTA on an owner surface is filled with THEIR brand colour, on
    // a page painted with THEIR background — so the two are frequently the
    // same hue, and the button disappears into the page. (An orange community
    // rendered an orange "Join the group" on orange.) WCAG 1.4.11 puts a
    // control's boundary at 3:1, so the fill is nudged until it clears that
    // against the worst stop, and the label re-derived for the moved fill.
    if (brandPrimary && contrastRatio(brandPrimary, stops[0]) < 3) {
      const cta = visibleFill(brandPrimary, stops[0]);
      vars["--skin-cta"] = cta.fill;
      vars["--skin-cta-on"] = cta.on;
    }
  } else if (skin.bg.kind === "image") {
    // A photo has no measurable luminance at build time and it changes across
    // the frame, so contrast cannot be derived. White plus a shadow is the only
    // honest answer; the shadow is what carries AA, not the colour.
    vars["--skin-on"] = "#ffffff";
    vars["--skin-on-muted"] = "rgba(255,255,255,0.88)";
    vars["--skin-rule"] = "rgba(255,255,255,0.45)";
    vars["--skin-shadow"] = "0 1px 6px rgba(0,0,0,0.55)";
  }
  return vars as CSSProperties;
}

/**
 * How the background image should be laid out. Split out from `skinBackground`
 * so every surface that paints a profile background agrees, instead of each one
 * hardcoding cover/center/fixed.
 */
export function skinBackgroundLayout(skin: ProfileSkin): CSSProperties {
  if (skin.bg.kind !== "image") return {};
  switch (skin.bg.fit) {
    case "tile":
      // Repeat at natural size, and scroll with the page — a tile pinned to the
      // viewport reads as a glitch rather than a pattern.
      return { backgroundSize: "auto", backgroundRepeat: "repeat", backgroundAttachment: "scroll" };
    case "contain":
      return { backgroundSize: "contain", backgroundPosition: "center", backgroundRepeat: "no-repeat", backgroundAttachment: "fixed" };
    case "center":
      return { backgroundSize: "auto", backgroundPosition: "center", backgroundRepeat: "no-repeat", backgroundAttachment: "fixed" };
    case "cover":
    default:
      return { backgroundSize: "cover", backgroundPosition: "center", backgroundRepeat: "no-repeat", backgroundAttachment: "fixed" };
  }
}

export function hasCustomBackground(skin: ProfileSkin): boolean {
  return skin.bg.kind !== "none" && skinBackground(skin) != null;
}
