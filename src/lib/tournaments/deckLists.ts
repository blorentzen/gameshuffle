/**
 * Deck lists for a tournament (client-safe settings). Only Pokémon TCG events
 * have them. The organizer picks when lists are due (to join, or before the
 * event starts), the format they're checked against, and whether they show
 * after the event (nobody, the top cut, everyone). Lists lock when the event
 * starts; until then players can swap theirs.
 */

import { asDeckFormat, type DeckFormat } from "@/lib/tcg/deckList";

export const DECK_LIST_GAME = "pokemon-tcg";
export type DeckListWhen = "off" | "join" | "start";
export type DeckListAfter = "private" | "top_cut" | "all";

export interface DeckListSettings { when: DeckListWhen; format: DeckFormat; after: DeckListAfter }

export const DEFAULT_DECK_LISTS: DeckListSettings = { when: "off", format: "standard", after: "top_cut" };

export const isDeckListGame = (slug: string | null | undefined) => slug === DECK_LIST_GAME;

export function deckListSettingsOf(settings: unknown): DeckListSettings {
  const raw = ((settings as { deckLists?: Partial<DeckListSettings> } | null)?.deckLists ?? {}) as Partial<DeckListSettings>;
  return {
    when: raw.when === "join" || raw.when === "start" ? raw.when : "off",
    format: asDeckFormat(raw.format),
    after: raw.after === "private" || raw.after === "all" ? raw.after : "top_cut",
  };
}

/** Deck lists are on for this tournament. */
export function deckListsOn(t: { game_slug: string | null | undefined; settings: unknown }): boolean {
  return isDeckListGame(t.game_slug) && deckListSettingsOf(t.settings).when !== "off";
}

/** Joining needs a list first. */
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
