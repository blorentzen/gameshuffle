/**
 * Profile section layout — the customizable order + visibility of the widget
 * blocks on /u, plus a column preference. Client-safe.
 *
 * SECURITY: `resolveProfileLayout` is the single gate for this data. It accepts
 * arbitrary stored/submitted input and returns a strictly-normalized value —
 * section keys are allowlisted (unknown keys dropped, so a poisoned blob can't
 * inject anything), the column count is clamped, and there is no free-text or
 * markup anywhere in the shape. Call it on every read AND every write so a blob
 * written before a rule change can never bypass validation.
 */

export const PROFILE_SECTIONS = [
  "stats",
  "featured",
  "featuredCard",
  "crews",
  "favGames",
  "topFriends",
  "communities",
] as const;

export type ProfileSectionKey = (typeof PROFILE_SECTIONS)[number];

/** Human labels for the layout editor. */
export const PROFILE_SECTION_LABELS: Record<ProfileSectionKey, string> = {
  stats: "Stats",
  featured: "Featured game",
  featuredCard: "Featured card",
  crews: "Crews (Represents)",
  favGames: "Favorite games",
  topFriends: "Top friends",
  communities: "Communities",
};

export interface ProfileLayout {
  order: ProfileSectionKey[];
  hidden: ProfileSectionKey[];
  columns: 1 | 2;
}

export const DEFAULT_PROFILE_LAYOUT: ProfileLayout = {
  order: [...PROFILE_SECTIONS],
  hidden: [],
  columns: 2,
};

const KNOWN = new Set<string>(PROFILE_SECTIONS);
const isKey = (v: unknown): v is ProfileSectionKey => typeof v === "string" && KNOWN.has(v);

/**
 * Normalize any input into a valid ProfileLayout:
 *  - `order`: keep known keys in the given order (de-duped), then append any
 *    known key that was missing (so newly-added sections always appear).
 *  - `hidden`: known keys only.
 *  - `columns`: 1 or 2 (default 2).
 * Anything unexpected falls back to the default. Never throws.
 */
export function resolveProfileLayout(raw: unknown): ProfileLayout {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_PROFILE_LAYOUT, order: [...DEFAULT_PROFILE_LAYOUT.order] };
  const obj = raw as Record<string, unknown>;

  const seen = new Set<ProfileSectionKey>();
  const order: ProfileSectionKey[] = [];
  if (Array.isArray(obj.order)) {
    for (const v of obj.order) {
      if (isKey(v) && !seen.has(v)) { seen.add(v); order.push(v); }
    }
  }
  for (const k of PROFILE_SECTIONS) if (!seen.has(k)) order.push(k);

  const hidden: ProfileSectionKey[] = [];
  if (Array.isArray(obj.hidden)) {
    for (const v of obj.hidden) if (isKey(v) && !hidden.includes(v)) hidden.push(v);
  }

  const columns: 1 | 2 = obj.columns === 1 ? 1 : 2;
  return { order, hidden, columns };
}

/** The visible sections in display order (order minus hidden). */
export function visibleSections(layout: ProfileLayout): ProfileSectionKey[] {
  const hide = new Set(layout.hidden);
  return layout.order.filter((k) => !hide.has(k));
}
