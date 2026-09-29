import type { PartyCard } from "@/data/party/cards";

/**
 * Hidden Agendas (a GameShuffle Original): one secret objective per player for
 * the game you're already playing, revealed when that game's results are in.
 * They ride on the mission system (kind "mission", ids prefixed "ag-"), so the
 * claim / confirm flow and night points work unchanged.
 *
 * Write them so the table can confirm them by watching: no hidden stats, no
 * "without anyone noticing". Worth 1 (anyone can manage it) to 3 (takes skill
 * or luck and gives your plan away if you're not careful).
 */

const MK = ["mario-kart-8-deluxe", "mario-kart-world"];

export const AGENDA_PREFIX = "ag-";

export const AGENDA_CARDS: PartyCard[] = [
  // Mario Kart
  { id: "ag-mk-01", kind: "mission", scope: "player", worth: 2, games: MK, title: "Exactly fifth", text: "Finish a race in exactly 5th place." },
  { id: "ag-mk-02", kind: "mission", scope: "player", worth: 2, games: MK, title: "Never in front", text: "Finish a race in the top 4 without leading at any point." },
  { id: "ag-mk-03", kind: "mission", scope: "player", worth: 1, games: MK, title: "Shell shock", text: "Hit another player with a red shell." },
  { id: "ag-mk-04", kind: "mission", scope: "player", worth: 3, games: MK, title: "Blue shell dodge", text: "Dodge a blue shell (a mushroom, a horn, or pure luck)." },
  { id: "ag-mk-05", kind: "mission", scope: "player", worth: 2, games: MK, title: "Last to first", text: "Be in last place at some point in a race and still finish top 3." },
  { id: "ag-mk-06", kind: "mission", scope: "player", worth: 1, games: MK, title: "Photo finish", text: "Finish within one position of the player sitting next to you." },
  { id: "ag-mk-07", kind: "mission", scope: "player", worth: 2, games: MK, title: "Banana artist", text: "Make two different players spin out on your bananas in one race." },
  { id: "ag-mk-08", kind: "mission", scope: "player", worth: 1, games: MK, title: "Hoarder", text: "Finish a race still holding an item." },
  { id: "ag-mk-09", kind: "mission", scope: "player", worth: 2, games: MK, title: "Clean lap", text: "Finish a race without falling off the course once." },
  { id: "ag-mk-10", kind: "mission", scope: "player", worth: 3, games: MK, title: "Wire to wire", text: "Win a race after being first at the end of lap one." },
  { id: "ag-mk-11", kind: "mission", scope: "player", worth: 1, games: MK, title: "Lightning rod", text: "Get hit by lightning and still finish in the top half." },
  { id: "ag-mk-12", kind: "mission", scope: "player", worth: 2, games: MK, title: "Kingmaker", text: "Knock the race leader out of first with an item." },
  { id: "ag-mk-13", kind: "mission", scope: "player", worth: 1, games: MK, title: "Trick shot", text: "Hit someone with an item you threw backwards." },
  { id: "ag-mk-14", kind: "mission", scope: "player", worth: 2, games: MK, title: "Beat your neighbour", text: "Finish ahead of both players sitting either side of you." },
  { id: "ag-mk-15", kind: "mission", scope: "player", worth: 3, games: MK, title: "Double podium", text: "Finish top 3 in two races in a row." },
  { id: "ag-mk-16", kind: "mission", scope: "player", worth: 1, games: MK, title: "Coin collector", text: "Finish a race with the maximum coins." },

  // Any game: Mario Party, Smash, board games, card games…
  { id: "ag-any-01", kind: "mission", scope: "player", worth: 2, title: "Silent assassin", text: "Win a round or turn without saying a word during it." },
  { id: "ag-any-02", kind: "mission", scope: "player", worth: 1, title: "Hype squad", text: "Get someone else to high-five you after they do something good." },
  { id: "ag-any-03", kind: "mission", scope: "player", worth: 2, title: "Runner-up", text: "Finish this game in exactly second place." },
  { id: "ag-any-04", kind: "mission", scope: "player", worth: 1, title: "Trash talker", text: "Call your shot out loud before a round, then pull it off." },
  { id: "ag-any-05", kind: "mission", scope: "player", worth: 3, title: "Comeback", text: "Be in last place at some point and finish this game in the top half." },
  { id: "ag-any-06", kind: "mission", scope: "player", worth: 2, title: "Keep it close", text: "Finish this game within one place of the player sitting to your left." },
  { id: "ag-any-07", kind: "mission", scope: "player", worth: 1, title: "Good sport", text: "Be the first to congratulate the winner, sincerely." },
  { id: "ag-any-08", kind: "mission", scope: "player", worth: 2, title: "Giant slayer", text: "Beat whoever is leading tonight's scoreboard in this game." },
  { id: "ag-any-09", kind: "mission", scope: "player", worth: 1, title: "Not last", text: "Avoid last place in this game." },
  { id: "ag-any-10", kind: "mission", scope: "player", worth: 3, title: "Clean sweep", text: "Win this game." },
  { id: "ag-any-11", kind: "mission", scope: "player", worth: 2, title: "Alliance", text: "Get another player to agree out loud to team up with you for a round." },
  { id: "ag-any-12", kind: "mission", scope: "player", worth: 1, title: "Narrator", text: "Commentate one full round like a sports announcer." },
];

export function isAgenda(cardId: string): boolean {
  return cardId.startsWith(AGENDA_PREFIX);
}

/** The agendas that fit a game: Mario Kart gets its own plus the any-game ones; activities get none. */
export function agendasFor(gameSlug: string, isActivity: boolean): PartyCard[] {
  if (isActivity) return [];
  return AGENDA_CARDS.filter((c) => !c.retired && (!c.games || c.games.includes(gameSlug)));
}
