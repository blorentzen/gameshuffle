/**
 * Client-safe TCG catalog + collection types. No server-only imports, so
 * UI components and route response typing can share these. Field set mirrors
 * the allowlisted columns in `tcg_cards` / `tcg_expansions` (Phase 1 schema)
 * — deliberately NO prices, pop_reports, or price history.
 */

/** A card image reference as returned by Scrydex — URLs are stored verbatim,
 *  never constructed. Only small/medium are ever used (never `large`). */
export interface TcgCardImages {
  small?: string;
  medium?: string;
  // `large` is intentionally omitted — Companion needs thumbnail-scale ID,
  // not print-resolution reproduction.
}

/** A printing variant: name + images only (prices/pop_reports stripped). */
export interface TcgCardVariant {
  name: string;
  images?: TcgCardImages;
}

export interface TcgExpansion {
  id: string;
  name: string;
  series: string | null;
  total: number | null;
  printed_total: number | null;
  language_code: string;
  release_date: string | null;
  is_online_only: boolean;
}

export interface TcgCard {
  id: string;
  name: string;
  supertype: string | null;
  subtypes: string[] | null;
  types: string[] | null;
  hp: string | null;
  abilities: unknown | null;
  attacks: unknown | null;
  weaknesses: unknown | null;
  resistances: unknown | null;
  retreat_cost: string[] | null;
  converted_retreat_cost: string | null;
  number: string | null;
  printed_number: string | null;
  rarity: string | null;
  regulation_mark: string | null;
  expansion_id: string | null;
  expansion_sort_order: number | null;
  language_code: string;
  images: TcgCardImages | null;
  variants: TcgCardVariant[] | null;
  image_small_path: string | null;
  image_medium_path: string | null;
  /** Human-readable expansion name (e.g. "Destined Rivals"), joined from
   *  tcg_expansions for display. Optional — only some readers populate it. */
  expansion_name?: string | null;
}

/** A row in a user's collection, joined with its card for display. */
export interface UserCard {
  id: string;
  card_id: string;
  variant_name: string | null;
  quantity: number;
  condition: string | null;
  added_at: string;
  /** When set, the card is featured on the owner's public profile; the
   *  timestamp is also the showcase display order. Null = not featured. */
  showcased_at: string | null;
  card: TcgCard | null;
}

/** Max cards a user can feature on their public profile (curated showcase).
 *  Lives here (client-safe) so both the server lib and the client My Cards UI
 *  can reference it. */
export const MAX_SHOWCASE = 8;

/** Machine-readable error codes returned by /api/tcg/* routes. */
export const TCG_ERROR = {
  UNAUTHENTICATED: "tcg_unauthenticated",
  PRO_REQUIRED: "tcg_pro_required",
  RATE_LIMITED: "tcg_rate_limited",
  BAD_REQUEST: "tcg_bad_request",
  NOT_FOUND: "tcg_not_found",
  UPSTREAM_ERROR: "tcg_upstream_error",
} as const;
export type TcgErrorCode = (typeof TCG_ERROR)[keyof typeof TCG_ERROR];
