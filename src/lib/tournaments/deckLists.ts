/**
 * Deck lists for a tournament (client-safe settings). Pokémon TCG events take
 * deck lists; Pokémon Champions events take team lists (game space picks
 * 2026-11-11, pick 10), stored the same way. The organizer picks when lists are
 * due (to join, or before the event starts), the format they're checked
 * against (decks only: a team is checked against the season's list), and who
 * sees them (nobody, the top cut, everyone; a team list can also be open from
 * round 1, as Play! Pokémon's open team lists are). Lists lock when the event
 * starts; until then players can swap theirs.
 */

import { asDeckFormat, type DeckFormat } from "@/lib/tcg/deckList";

export const DECK_LIST_GAME = "pokemon-tcg";
/** Team lists: six Pokémon from the season's list, in the same table as deck lists (no migration). */
export const TEAM_LIST_GAME = "pokemon-champions";
export type DeckListWhen = "off" | "join" | "start";
/** "open" (team lists only): everyone's list shows from round 1, the way open team lists work at Play! Pokémon events. */
export type DeckListAfter = "private" | "open" | "top_cut" | "all";

export interface DeckListSettings { when: DeckListWhen; format: DeckFormat; after: DeckListAfter }

export const DEFAULT_DECK_LISTS: DeckListSettings = { when: "off", format: "standard", after: "top_cut" };

export const isDeckListGame = (slug: string | null | undefined) => slug === DECK_LIST_GAME;
export const isTeamListGame = (slug: string | null | undefined) => slug === TEAM_LIST_GAME;
/** The game takes lists of either kind. */
export const takesLists = (slug: string | null | undefined) => isDeckListGame(slug) || isTeamListGame(slug);
export type ListKind = "deck" | "team";
export const listKindOf = (slug: string | null | undefined): ListKind | null => (isDeckListGame(slug) ? "deck" : isTeamListGame(slug) ? "team" : null);
/** What the lists are called, for headings and the badge beside them. */
export const LIST_WORDS: Record<ListKind, { title: string; one: string; game: string }> = {
  deck: { title: "Deck lists", one: "deck list", game: "Pokémon TCG" },
  team: { title: "Team lists", one: "team list", game: "Pokémon Champions" },
};

export function deckListSettingsOf(settings: unknown): DeckListSettings {
  const raw = ((settings as { deckLists?: Partial<DeckListSettings> } | null)?.deckLists ?? {}) as Partial<DeckListSettings>;
  return {
    when: raw.when === "join" || raw.when === "start" ? raw.when : "off",
    format: asDeckFormat(raw.format),
    after: raw.after === "private" || raw.after === "all" || raw.after === "open" ? raw.after : "top_cut",
  };
}

/** Deck (or team) lists are on for this tournament. */
export function deckListsOn(t: { game_slug: string | null | undefined; settings: unknown }): boolean {
  return takesLists(t.game_slug) && deckListSettingsOf(t.settings).when !== "off";
}

/** Joining needs a list first (deck lists only: a team list is sent before round 1). */
export const deckNeededToJoin = (t: { game_slug: string | null | undefined; settings: unknown }) =>
  isDeckListGame(t.game_slug) && deckListSettingsOf(t.settings).when === "join";

/** Lists lock once the event is under way. */
export const deckListsLocked = (status: string | null | undefined) => status === "in_progress" || status === "complete";

export const WHEN_CHOICES: { value: DeckListWhen; label: string }[] = [
  { value: "off", label: "Not needed" },
  { value: "join", label: "To join" },
  { value: "start", label: "Before round 1" },
];

export const AFTER_CHOICES = (swiss: boolean): { value: DeckListAfter; label: string }[] => [
  { value: "private", label: "Keep lists private" },
  { value: "top_cut", label: swiss ? "Show the top cut's lists" : "Show the top 4's lists" },
  { value: "all", label: "Show everyone's" },
];

/** Team lists are sent before round 1, never with the join (the join takes a saved deck, which teams don't have). */
export const TEAM_WHEN_CHOICES: { value: DeckListWhen; label: string }[] = [
  { value: "off", label: "Not needed" },
  { value: "start", label: "Before round 1" },
];

export const TEAM_AFTER_CHOICES = (swiss: boolean): { value: DeckListAfter; label: string }[] => [
  { value: "private", label: "Keep teams private" },
  { value: "open", label: "Open team lists from round 1" },
  { value: "top_cut", label: swiss ? "Show the top cut's teams" : "Show the top 4's teams" },
  { value: "all", label: "Show everyone's after the event" },
];

/** What each team list choice means, said once under the choices. */
export function teamAfterHelp(after: DeckListAfter): string {
  switch (after) {
    case "private": return "Only you, your co-organizers and each player see a team.";
    case "open": return "Everyone's team shows on the tournament page once round 1 is paired, so opponents can read each other's six before they play.";
    case "top_cut": return "The top cut's teams show once the cut is set; everyone else's stays private.";
    default: return "Everyone's team shows once the event is over. Until then only you, your co-organizers and each player see one.";
  }
}
