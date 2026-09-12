/**
 * Arcade catalog — cosmetic items a user buys with Arcade Tokens. This is the
 * token SINK that counterweights signup/onboarding/earn minting: purchases burn
 * tokens (`shop_purchase`, removed from supply), and items are purely cosmetic
 * status — never redeemable for real value, keeping the loop closed.
 *
 * Hardcoded (like the other catalogs) — no DB table + admin needed for v1.
 * v1 items are profile badges (an emoji + label shown on /u). Prices are token
 * amounts; tune alongside mint velocity on the economy snapshot dashboard.
 */

export interface ArcadeItem {
  id: string;
  name: string;
  description: string;
  price: number;
  /** Rendered form: 'badge' (emoji on the profile) or 'name_color' (colored,
   *  equippable display name across the social layer). */
  kind: "badge" | "name_color";
  /** For 'badge'. */
  emoji?: string;
  /** For 'name_color' — a CSS color applied to the display name. */
  color?: string;
}

export const ARCADE_ITEMS: ArcadeItem[] = [
  { id: "badge_supporter", name: "Supporter", description: "Show some love for the platform.", price: 500, kind: "badge", emoji: "💜" },
  { id: "badge_regular", name: "Regular", description: "You're always around.", price: 1500, kind: "badge", emoji: "⭐" },
  { id: "badge_high_roller", name: "High Roller", description: "For the bold at the markets.", price: 5000, kind: "badge", emoji: "🎲" },
  { id: "badge_champion", name: "Champion", description: "Wear your competitive edge.", price: 8000, kind: "badge", emoji: "🏆" },
  { id: "badge_streamer_fan", name: "Superfan", description: "A community's biggest fan.", price: 3000, kind: "badge", emoji: "🔥" },
  { id: "badge_legend", name: "Legend", description: "The rarest flex on GameShuffle.", price: 25000, kind: "badge", emoji: "👑" },

  // Name colors — equip one to color your display name everywhere.
  { id: "name_indigo", name: "Indigo name", description: "A cool indigo display name.", price: 2000, kind: "name_color", color: "#5c8cf5" },
  { id: "name_violet", name: "Violet name", description: "A vivid violet display name.", price: 2000, kind: "name_color", color: "#c949e9" },
  { id: "name_gold", name: "Gold name", description: "A premium gold display name.", price: 10000, kind: "name_color", color: "#e0a106" },
  { id: "name_crimson", name: "Crimson name", description: "A bold crimson display name.", price: 4000, kind: "name_color", color: "#e0245e" },
  { id: "name_emerald", name: "Emerald name", description: "A fresh emerald display name.", price: 4000, kind: "name_color", color: "#16a34a" },
];

export const ARCADE_ITEM_BY_ID: Record<string, ArcadeItem> = Object.fromEntries(
  ARCADE_ITEMS.map((i) => [i.id, i]),
);

/** Resolve an equipped-name-color item id to its CSS color, or null. Client-safe. */
export function resolveNameColor(itemId: string | null | undefined): string | null {
  if (!itemId) return null;
  const item = ARCADE_ITEM_BY_ID[itemId];
  return item && item.kind === "name_color" && item.color ? item.color : null;
}
