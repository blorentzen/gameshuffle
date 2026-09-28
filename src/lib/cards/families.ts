import { PARTY_FAMILY, PARTY_GAMES } from "@/data/party";
import { SMASH_FAMILY } from "@/data/smash/cards";
import { ULTIMATE } from "@/data/smash/ultimate";
import { SMASH_PUBLIC } from "@/lib/games-visibility";

/**
 * Card deck families (meta_decks.family): every game with a card meta layer.
 * Client-safe. The deck APIs refuse any family not listed here, so a stray
 * request can't create decks for games that don't exist.
 */
export interface DeckFamily {
  id: string;
  label: string;
  games: { value: string; label: string }[];
  /** Rulesets a card can be left out under (PartyCard.notUnder). */
  rulesets: { value: string; label: string }[];
  /** What the card timer counts. */
  unit: "turn" | "game";
}

function partyRulesets() {
  const seen = new Map<string, string>();
  for (const g of Object.values(PARTY_GAMES)) for (const r of g.rulesets) seen.set(r.id, r.label);
  return [...seen].map(([value, label]) => ({ value, label }));
}

export const DECK_FAMILIES: DeckFamily[] = [
  { id: PARTY_FAMILY, label: "Mario Party", games: Object.values(PARTY_GAMES).map((g) => ({ value: g.slug, label: g.label })), rulesets: partyRulesets(), unit: "turn" },
  ...(SMASH_PUBLIC ? [{ id: SMASH_FAMILY, label: "Smash", games: [{ value: ULTIMATE.slug, label: ULTIMATE.label }], rulesets: [{ value: "party", label: "Party" }, { value: "competitive", label: "Competitive" }], unit: "game" as const }] : []),
];

export function deckFamily(id: string | null | undefined): DeckFamily | null {
  return DECK_FAMILIES.find((f) => f.id === id) ?? null;
}
