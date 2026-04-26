/**
 * DiceBear Adventurer avatar generation.
 *
 * Per gs-avatars-spec.md §2 + §12. Adventurer style ships in Phase 1
 * (other styles deferred). Each user gets a deterministic avatar from
 * their user_id, optionally overridden by a re-rolled `avatar_seed` and
 * (Phase 2.1) per-feature option overrides stored on `users.avatar_options`.
 *
 * Server-safe: DiceBear works in both Node and the browser. We import
 * the bundled style directly for tree-shaking.
 */

import { createAvatar } from "@dicebear/core";
import { adventurer } from "@dicebear/collection";

/**
 * Default soft pastel palette — DiceBear picks one deterministically
 * per seed, so each user gets a consistent (but different) background
 * tile. Used when the user hasn't picked a specific background color.
 */
const DEFAULT_BACKGROUND_COLORS = [
  "b6e3f4", // soft blue
  "c0aede", // soft purple
  "d1d4f9", // soft lavender
  "ffd5dc", // soft pink
  "ffdfbf", // soft peach
];

/**
 * Curated palette the user can pick from in the editor. Wider than the
 * default-random pool — includes deeper brand-adjacent tones and a
 * neutral for "no background flair." Ordered light-to-dark for visual
 * scan.
 */
export const BACKGROUND_COLOR_PALETTE = [
  // soft pastels (same as default pool)
  "ffffff", // white
  "f1f4f7", // pale gray
  "ffd5dc", // soft pink
  "ffdfbf", // soft peach
  "fff5b1", // soft yellow
  "d3f3c0", // soft mint
  "b6e3f4", // soft blue
  "d1d4f9", // soft lavender
  "c0aede", // soft purple
  // mid tones
  "0e75c1", // GameShuffle brand blue
  "3397d7", // primary 400
  "1a7c45", // success green
  "856404", // amber
  "9a2f2c", // muted red
  // darks
  "272727", // gray-800
  "0a0a0a", // near-black
] as const;

/**
 * User-overridable Adventurer features. Aligned with the spec — we
 * surface hair, hair color, skin tone, eyes, mouth, and glasses in the
 * editor. Other Adventurer features (eyebrows, earrings, base, "features"
 * decals) stay deterministic from the seed unless we widen the editor.
 */
export interface AvatarOptions {
  hair?: string;
  hairColor?: string;
  skinColor?: string;
  eyes?: string;
  mouth?: string;
  /** Special value "none" disables glasses; any other value selects a variant. */
  glasses?: string;
  /** Hex without `#` (e.g. "0e75c1"). Overrides the deterministic-from-seed default. */
  backgroundColor?: string;
}

/**
 * Catalog of options the editor surfaces. Sourced from the live
 * @dicebear/collection adventurer schema at module load — no hand-typing
 * variant lists that would drift if the library updates.
 */
/**
 * Read the list of selectable values for a DiceBear schema property.
 *
 * Adventurer mixes two shapes:
 *   - Variant categories (hair, eyes, mouth, glasses): `items.enum` holds
 *     the canonical list — closed set, the only valid values.
 *   - Color categories (hairColor, skinColor): `items.pattern` (regex
 *     accepts any 6-char hex), `default` holds DiceBear's suggested palette.
 *     There is no enum because *any* hex is valid; the defaults are what
 *     the project itself ships with.
 *
 * For our picker UI we want a finite list either way — surface enum when
 * present, otherwise fall back to the schema's default palette.
 */
function readSchemaEnum(key: string): string[] {
  const schema = (
    adventurer as unknown as {
      schema?: {
        properties?: Record<
          string,
          {
            items?: { enum?: string[]; default?: string[] };
            enum?: string[];
            default?: string[];
          }
        >;
      };
    }
  ).schema;
  const entry = schema?.properties?.[key];
  if (!entry) return [];
  if (Array.isArray(entry.items?.enum)) return entry.items!.enum as string[];
  if (Array.isArray(entry.enum)) return entry.enum as string[];
  if (Array.isArray(entry.default)) return entry.default as string[];
  if (Array.isArray(entry.items?.default)) return entry.items!.default as string[];
  return [];
}

export const ADVENTURER_OPTIONS = {
  hair: readSchemaEnum("hair"),
  hairColor: readSchemaEnum("hairColor"),
  skinColor: readSchemaEnum("skinColor"),
  eyes: readSchemaEnum("eyes"),
  mouth: readSchemaEnum("mouth"),
  glasses: readSchemaEnum("glasses"),
  backgroundColor: BACKGROUND_COLOR_PALETTE,
} as const;

export type AvatarOptionKey = keyof typeof ADVENTURER_OPTIONS;

interface BuildOptions {
  seed: string;
  options?: AvatarOptions | null;
}

/**
 * Builds the DiceBear avatar object with our shared baseline + the
 * caller's option overrides applied on top.
 *
 * Two notable wrinkles:
 *   - Picking ANY hair value (style or color) forces hairProbability=100
 *     so the user actually sees what they picked. Otherwise a seed that
 *     produced a bald avatar would silently swallow the override.
 *   - "glasses = none" translates to glassesProbability=0 (disables);
 *     any other glasses value forces glassesProbability=100.
 *   - User-picked backgroundColor wins over the deterministic palette.
 */
function buildAvatar({ seed, options }: BuildOptions) {
  const o = options ?? {};
  const overrides: Record<string, unknown> = { seed };

  // Background — user pick wins, otherwise deterministic from palette.
  overrides.backgroundColor = o.backgroundColor
    ? [o.backgroundColor]
    : DEFAULT_BACKGROUND_COLORS;

  if (o.hair) {
    overrides.hair = [o.hair];
    overrides.hairProbability = 100;
  }
  if (o.hairColor) {
    overrides.hairColor = [o.hairColor];
    // Force hair to actually appear so the color override is visible.
    overrides.hairProbability = 100;
  }
  if (o.skinColor) overrides.skinColor = [o.skinColor];
  if (o.eyes) overrides.eyes = [o.eyes];
  if (o.mouth) overrides.mouth = [o.mouth];
  if (o.glasses) {
    if (o.glasses === "none") {
      overrides.glassesProbability = 0;
    } else {
      overrides.glasses = [o.glasses];
      overrides.glassesProbability = 100;
    }
  }
  return createAvatar(adventurer, overrides);
}

/**
 * Generate the raw SVG markup for a user's DiceBear avatar.
 *
 * @param seed Stable seed string (typically the user id, or a re-rolled value)
 * @param options Optional per-feature overrides — partial; missing keys
 *   stay deterministic from the seed.
 */
export function generateDicebearAvatar(seed: string, options?: AvatarOptions | null): string {
  return buildAvatar({ seed, options }).toString();
}

/** Same avatar as a `data:image/svg+xml;base64,...` URI. */
export function generateDicebearAvatarDataUri(seed: string, options?: AvatarOptions | null): string {
  const svg = generateDicebearAvatar(seed, options);
  const base64 =
    typeof Buffer !== "undefined"
      ? Buffer.from(svg).toString("base64")
      : btoa(unescape(encodeURIComponent(svg)));
  return `data:image/svg+xml;base64,${base64}`;
}
