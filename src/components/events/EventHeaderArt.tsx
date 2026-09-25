"use client";

/**
 * Generated header art for events — a large category glyph over a scatter of
 * smaller ones, on a brand colour ramp.
 *
 * Replaces a single AI-generated trophy photo that every tournament shared.
 * Six identical heroes in one viewport is worse than no art, and stock imagery
 * does not scale: a new category means commissioning a new picture.
 *
 * Three things make this work instead:
 *
 *  - It is built from the SAME Tabler components the UI uses, not a copy of
 *    their path data. The art and the interface are literally the same shapes,
 *    and an icon-set update carries through for free.
 *  - The scatter is hashed from the event id, so an event looks identical on
 *    every visit and across every surface, but no two events match. The glyph
 *    LIST is offset by the hash as well, so different events favour different
 *    icons rather than every tile leaning on whichever one the modulo liked.
 *  - The ramp is a parameter. Category defaults today; an owner's brand theme
 *    can drive it later without touching this file. Category identity stays
 *    structural (the glyph), colour is the personal layer.
 */

import type { ComponentType, CSSProperties } from "react";
import {
  IconTrophy, IconTournament, IconMedal, IconCrown, IconSwords,
  IconDice5, IconDice3, IconPuzzle, IconChess, IconHourglass,
  IconDeviceGamepad2, IconDeviceGamepad, IconBrandXbox, IconHeadset, IconBolt,
  IconCards, IconStack2, IconDiamond, IconSparkles, IconStar,
  IconBroadcast, IconDeviceTv, IconMicrophone, IconMessageCircle,
  IconRotate, IconClock, IconListNumbers, IconWand,
} from "@tabler/icons-react";

/**
 * Only the props we actually hand an icon. Tabler's own IconProps omits and
 * redefines `stroke`, so the stock SVGProps type does not line up.
 */
type Glyph = ComponentType<{
  x?: number | string;
  y?: number | string;
  width?: number | string;
  height?: number | string;
  stroke?: number | string;
  strokeWidth?: number | string;
  fill?: string;
  className?: string;
}>;

/**
 * Event categories, plus the two the marketing pillars need. They live in one
 * enum because this is an ART category, not an event type — `artCategoryFor`
 * maps events onto the subset that applies to them.
 */
export type ArtCategory =
  | "compete" | "board" | "video" | "tcg" | "mixed"
  | "stream" | "tools";

interface CategoryArt {
  /** The large glyph. Says what kind of event this is at a glance. */
  feature: Glyph;
  /** Five for the scatter — enough that a tile does not read as one repeated shape. */
  glyphs: Glyph[];
  /** Default ramp, overridden by an owner's brand colours when we have them. */
  ramp: [string, string];
}

const CATEGORIES: Record<ArtCategory, CategoryArt> = {
  compete: { feature: IconTrophy, ramp: ["#1b2a6b", "#2766ec"],
    glyphs: [IconTrophy, IconTournament, IconMedal, IconCrown, IconSwords] },
  board: { feature: IconDice5, ramp: ["#1d3a2e", "#2f9e44"],
    glyphs: [IconDice5, IconDice3, IconPuzzle, IconChess, IconHourglass] },
  video: { feature: IconDeviceGamepad2, ramp: ["#3a1657", "#c949e9"],
    glyphs: [IconDeviceGamepad2, IconDeviceGamepad, IconBrandXbox, IconHeadset, IconBolt] },
  tcg: { feature: IconCards, ramp: ["#5c2010", "#f97316"],
    glyphs: [IconCards, IconStack2, IconDiamond, IconSparkles, IconStar] },
  mixed: { feature: IconSparkles, ramp: ["#0d3b46", "#0ea5e9"],
    glyphs: [IconDice5, IconDeviceGamepad2, IconCards, IconPuzzle, IconStar] },
  stream: { feature: IconBroadcast, ramp: ["#3a1657", "#7c3aed"],
    glyphs: [IconBroadcast, IconDeviceTv, IconMicrophone, IconMessageCircle, IconHeadset] },
  tools: { feature: IconWand, ramp: ["#1b2a6b", "#2766ec"],
    glyphs: [IconRotate, IconDice5, IconClock, IconListNumbers, IconWand] },
};

/** Map a game night's `kind` / a tournament onto an art category. */
export function artCategoryFor(type: "tournament" | "game-night", kind?: string | null): ArtCategory {
  if (type === "tournament") return "compete";
  if (kind === "video" || kind === "tcg" || kind === "mixed") return kind;
  return "board";
}

/** FNV-1a. Small, stable, and we only need spread — not cryptographic quality. */
function hash(seed: string): number[] {
  let h = 0x811c9dc5;
  const out: number[] = [];
  for (let i = 0; i < Math.max(seed.length, 24); i++) {
    h ^= seed.charCodeAt(i % seed.length);
    h = Math.imul(h, 0x01000193) >>> 0;
    out.push(h & 0xff);
  }
  return out;
}

const TILE = 176;
const CELLS = 4;

/**
 * Rotate a hex colour's hue by `deg`, keeping saturation and lightness.
 *
 * Why this exists: the featured glyph is constant per category and, at browse
 * card size, the scatter reads as texture rather than as distinct icons. So two
 * tournaments rendered identically — exactly the "six identical trophies"
 * problem this work set out to fix, just in a new costume. Shifting the ramp
 * per event fixes it at a glance while keeping the category's colour family
 * (compete stays blue-ish, board stays green-ish), because the shift is capped
 * well short of a full rotation.
 */
function rotateHue(hex: string, deg: number): string {
  const n = parseInt(hex.slice(1), 16);
  let [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  const l = (max + min) / 2;
  const sat = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let hue = 0;
  if (d !== 0) {
    hue = max === r ? ((g - b) / d + (g < b ? 6 : 0)) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    hue *= 60;
  }
  hue = (((hue + deg) % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * sat;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = l - c / 2;
  const seg = Math.floor(hue / 60) % 6;
  [r, g, b] = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][seg];
  return "#" + [r, g, b].map((v) => Math.round((v + m) * 255).toString(16).padStart(2, "0")).join("");
}

/**
 * Just the drifting glyph field, with no ramp, feature glyph or scrim.
 *
 * The pillar hero bands were pure gradient, so an event card and the page it
 * sat on shared no visual language at all. Laying the same field over the
 * aurora ties them together, and because it is the same component it stays
 * tied when the icon set changes.
 */
export function IconField({
  category,
  seed,
  motion = "ambient",
  opacity = 0.12,
  className,
}: {
  category: ArtCategory;
  seed: string;
  motion?: "ambient" | "hover" | "none";
  /** Heroes want this far quieter than a card — there is type over it. */
  opacity?: number;
  className?: string;
}) {
  const { cells, patternId, drift } = buildField(category, seed);
  return (
    <span
      className={`evart evart--field${motion !== "none" ? ` evart--${motion}` : ""}${className ? ` ${className}` : ""}`}
      style={motion === "none" ? undefined : drift}
      aria-hidden
    >
      <TileLayer cells={cells} patternId={patternId} opacity={opacity} />
    </span>
  );
}

function TileLayer({
  cells, patternId, opacity,
}: {
  cells: ReturnType<typeof buildField>["cells"];
  patternId: string;
  opacity: number;
}) {
  return (
    <svg className="evart__tile" width="100%" height="100%" preserveAspectRatio="none">
      <defs>
        <pattern id={patternId} width={TILE} height={TILE} patternUnits="userSpaceOnUse" color="#fff">
          {cells.flatMap(({ key, G, size, x, y, rot, copies }) =>
            copies.map(([dx, dy]) => (
              <g
                key={`${key}-${dx}-${dy}`}
                transform={`translate(${(x + dx).toFixed(1)} ${(y + dy).toFixed(1)}) rotate(${rot})`}
              >
                <G x={-size / 2} y={-size / 2} width={size} height={size} strokeWidth={1.5} />
              </g>
            )),
          )}
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${patternId})`} opacity={opacity} />
    </svg>
  );
}

/** The hashed half of the art: which glyphs land where, and which way it drifts. */
function buildField(category: ArtCategory, seed: string) {
  const cat = CATEGORIES[category] ?? CATEGORIES.board;
  const h = hash(seed);
  const step = TILE / CELLS;
  // Offsetting the glyph list by the hash is what stops every event in a
  // category looking like the same handful of icons.
  const offset = h[0] % cat.glyphs.length;
  // Pattern ids are global in a document, so several cards on one page would
  // collide without this.
  const patternId = `gs-art-${category}-${seed.replace(/[^a-zA-Z0-9]/g, "").slice(0, 12)}`;
  // Drift is per-event too, for the same reason the hue is: a page of tiles all
  // sliding the same way at the same speed reads as one moving backdrop rather
  // than as a dozen separate things. One tile period keeps the loop seamless.
  const drift = {
    "--evart-dx": `${h[2] & 1 ? TILE : -TILE}px`,
    "--evart-dy": `${h[3] & 1 ? TILE : -TILE}px`,
    "--evart-dur": `${56 + (h[4] % 40)}s`,
  } as CSSProperties;

  const cells = Array.from({ length: CELLS * CELLS }, (_, i) => {
    const row = Math.floor(i / CELLS);
    const col = i % CELLS;
    const a = h[i % h.length];
    const b = h[(i * 7 + 3) % h.length];
    const G = cat.glyphs[(offset + a + (i % cat.glyphs.length)) % cat.glyphs.length];
    const size = step * 0.78 * (0.85 + (b % 7) * 0.06);
    // Jitter inside the cell, or the grid reads as a grid.
    const x = col * step + step / 2 + ((h[(i * 3 + 1) % h.length] / 255) - 0.5) * step * 0.62;
    const y = row * step + step / 2 + ((h[(i * 3 + 2) % h.length] / 255) - 0.5) * step * 0.62;

    // An SVG <pattern> CLIPS at the tile boundary, so a jittered glyph that
    // straddles an edge renders as a sliced-off fragment, repeated across the
    // whole band. Emitting the wrap-around copies is what makes the tile
    // genuinely seamless: the half that falls off one edge is drawn again at
    // the opposite edge, and the two halves meet when the tile repeats.
    // Rotation grows the footprint, hence the sqrt(2) on the half-extent.
    const r = (size / 2) * Math.SQRT2;
    const xs = [0];
    if (x - r < 0) xs.push(TILE);
    if (x + r > TILE) xs.push(-TILE);
    const ys = [0];
    if (y - r < 0) ys.push(TILE);
    if (y + r > TILE) ys.push(-TILE);
    const copies: [number, number][] = [];
    for (const dx of xs) for (const dy of ys) copies.push([dx, dy]);

    return { key: i, G, size, x, y, rot: (b % 12) * 30, copies };
  });

  return { cat, h, cells, patternId, drift };
}

export function EventHeaderArt({
  category,
  seed,
  ramp,
  motion = "none",
  className,
}: {
  category: ArtCategory;
  /** The event id. Same id, same art, forever. */
  seed: string;
  /** Overrides the category ramp — this is where an owner's brand plugs in. */
  ramp?: [string, string];
  /**
   * `"ambient"` drifts continuously; `"hover"` only while the card is hovered.
   *
   * Browse renders a dozen of these at once, and a dozen always-running
   * compositor layers is real battery for decoration nobody is looking at.
   * Hero bands are one-per-page, so those get the ambient treatment and cards
   * come alive on approach. Both are off under `prefers-reduced-motion`.
   */
  motion?: "ambient" | "hover" | "none";
  className?: string;
}) {
  const { cat, h, cells, patternId, drift } = buildField(category, seed);
  const Feature = cat.feature;
  // +/- 26 degrees: enough that adjacent cards are obviously different, small
  // enough that the category still reads as its own colour. An explicit `ramp`
  // (an owner's brand) is used verbatim — their colour is not ours to shift.
  const shift = ramp ? 0 : ((h[1] / 255) - 0.5) * 52;
  const base = ramp ?? cat.ramp;
  const [from, to] = shift ? [rotateHue(base[0], shift), rotateHue(base[1], shift)] : base;

  return (
    <span
      className={`evart${motion !== "none" ? ` evart--${motion}` : ""}${className ? ` ${className}` : ""}`}
      style={motion === "none" ? undefined : drift}
      aria-hidden
    >
      <span className="evart__ramp" style={{ background: `linear-gradient(135deg, ${from}, ${to})` }} />
      <TileLayer cells={cells} patternId={patternId} opacity={0.2} />
      <Feature className="evart__feature" stroke={1.05} />
      {/* A scrim rather than a text-shadow: once owner brand ramps drive the
          colour we cannot predict the value behind the title. */}
      <span className="evart__scrim" />
    </span>
  );
}
