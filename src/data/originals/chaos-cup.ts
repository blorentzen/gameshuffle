import type { PartyCard } from "@/data/party/cards";

/**
 * Chaos Cup modifiers (a GameShuffle Original, Mario Kart). Before each race
 * the host rolls three, one from each group, and chat votes (or the host
 * picks). The winner is a house-rule card for that race: kind "rule", ids
 * "cc-", cleared when the next race starts.
 *   cc-i: an item rule   cc-r: a race setting   cc-l: a handicap for tonight's leader
 */

export const CHAOS_PREFIX = "cc-";

export const CHAOS_ITEMS: PartyCard[] = [
  { id: "cc-i-01", kind: "rule", scope: "table", title: "Shells only", text: "Items set to shells only (or as close as your game allows) for this race." },
  { id: "cc-i-02", kind: "rule", scope: "table", title: "Bananas only", text: "Bananas only for this race." },
  { id: "cc-i-03", kind: "rule", scope: "table", title: "Frantic items", text: "Frantic items for this race." },
  { id: "cc-i-04", kind: "rule", scope: "table", title: "No items", text: "No items at all. Pure racing." },
  { id: "cc-i-05", kind: "rule", scope: "table", title: "Mushrooms only", text: "Mushrooms only for this race." },
  { id: "cc-i-06", kind: "rule", scope: "table", title: "Use it now", text: "Everyone has to use every item the moment they get it." },
];

export const CHAOS_RACE: PartyCard[] = [
  { id: "cc-r-01", kind: "rule", scope: "table", title: "Mirror mode", text: "Race this one in Mirror mode (or the track reversed if your game has it)." },
  { id: "cc-r-02", kind: "rule", scope: "table", title: "200cc", text: "This race is at 200cc (or the fastest class you have)." },
  { id: "cc-r-03", kind: "rule", scope: "table", title: "50cc crawl", text: "This race is at 50cc. Drafting only, no excuses." },
  { id: "cc-r-04", kind: "rule", scope: "table", title: "Random picks", text: "Everyone plays a random character and kart for this race." },
  { id: "cc-r-05", kind: "rule", scope: "table", title: "Chat's track", text: "Chat picks the track for this race." },
  { id: "cc-r-06", kind: "rule", scope: "table", title: "Last is first", text: "Last race's last place picks the track and goes first in character select." },
];

export const CHAOS_LEADER: PartyCard[] = [
  { id: "cc-l-01", kind: "rule", scope: "player", title: "Leader: heavy", text: "{player}, leading the cup, has to use the heaviest setup they can find." },
  { id: "cc-l-02", kind: "rule", scope: "player", title: "Leader: no drift", text: "{player}, leading the cup, can't drift this race." },
  { id: "cc-l-03", kind: "rule", scope: "player", title: "Leader: late start", text: "{player}, leading the cup, waits a full second after GO." },
  { id: "cc-l-04", kind: "rule", scope: "player", title: "Leader: one hand", text: "{player}, leading the cup, races one-handed." },
  { id: "cc-l-05", kind: "rule", scope: "player", title: "Leader: chat's pick", text: "Chat picks {player}'s character for this race." },
];

export const CHAOS_MODIFIERS: PartyCard[] = [...CHAOS_ITEMS, ...CHAOS_RACE, ...CHAOS_LEADER];

export function isChaos(cardId: string): boolean {
  return cardId.startsWith(CHAOS_PREFIX);
}

/** Three options for a race: an item rule, a race setting and a leader handicap. */
export function rollChaos(rand: () => number = Math.random): string[] {
  const one = (list: PartyCard[]) => list[Math.floor(rand() * list.length)].id;
  return [one(CHAOS_ITEMS), one(CHAOS_RACE), one(CHAOS_LEADER)];
}
