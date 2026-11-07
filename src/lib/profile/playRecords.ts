/**
 * The player card's records (game spaces picks 2026-11-05, 6A, step 4): a profile's overview is one record per game
 * instead of a tile per feature. Each record is that game's facts about this person (their lounge division, their
 * times, their crew; for Pokémon their Trainer Road; and one record for the dailies), each fact linking to the page
 * with the details, and, once that game's space is open, a link to it. Games they've added with nothing to show yet sit
 * under the records as covers. Pure and client-safe; the profile page gathers the inputs (already filtered by the
 * owner's section switches) and draws the result with PlayRecords.
 */

import { gameEntry, gameKey } from "@/lib/games/key";
import { spaceFor, spacePath } from "@/lib/games/spaces";

export interface PlayFact { text: string; href: string | null; medal?: string | null }

export interface PlayRecord {
  key: string;
  name: string;
  /** What heads the record: the game's cover (by name), our own picture, or the dailies' icon tile. */
  cover: { kind: "game"; name: string } | { kind: "image"; src: string } | { kind: "dailies" };
  facts: PlayFact[];
  /** "Kai in Mario Kart 8 Deluxe", once that game's space is open (or for staff). */
  space: { href: string; label: string } | null;
}

export interface PlayInput {
  username: string;
  displayName: string;
  /** What they're playing now and the games they've added, in their order. */
  nowPlaying: string | null;
  favorites: string[];
  lounge: { name: string; game: string; mmr: number | null; division: string; medal: string | null } | null;
  /** Their time trial bests (one per track): the game code and their place on the board. */
  times: { game: string; place: number }[];
  crews: { name: string; slug: string; game: string }[];
  road: { badges: number; regionsCleared: number; champion: boolean } | null;
  dailies: { name: string; href: string; streak: number; played: number }[];
  weekly: { played: number; topTen: number } | null;
  /** Whether a space can be linked (open to everyone, or the viewer is staff). */
  spaceOpen: (key: string) => boolean;
}

const POKEMON = "pokemon";
const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

/** Group a game under its record: every Pokémon game is one Pokémon record, everything else its own game. */
function recordKey(game: string | null | undefined): string | null {
  const k = gameKey(game);
  if (!k) return null;
  return spaceFor(k)?.id === POKEMON ? POKEMON : k;
}

export function playRecords(input: PlayInput): { records: PlayRecord[]; also: string[] } {
  const facts = new Map<string, PlayFact[]>();
  const add = (key: string | null, fact: PlayFact) => { if (key) facts.set(key, [...(facts.get(key) ?? []), fact]); };
  if (input.lounge) {
    add(recordKey(input.lounge.game), {
      text: [input.lounge.division, input.lounge.mmr != null ? input.lounge.mmr.toLocaleString("en-US") : null].filter(Boolean).join(" · "),
      href: `/lounge/${encodeURIComponent(input.lounge.name)}?game=${input.lounge.game}`,
      medal: input.lounge.medal,
    });
  }

  const byGame = new Map<string, { tracks: number; records: number }>();
  for (const t of input.times) {
    const k = recordKey(t.game);
    if (!k) continue;
    const g = byGame.get(k) ?? { tracks: 0, records: 0 };
    g.tracks++;
    if (t.place === 1) g.records++;
    byGame.set(k, g);
  }
  for (const [k, g] of byGame) {
    add(k, { text: g.records ? plural(g.records, "track record") : `${plural(g.tracks, "track")} timed`, href: `/time-trials/players/${input.username}` });
  }

  const crewSeen = new Set<string>();
  for (const c of input.crews) {
    const k = recordKey(c.game);
    if (!k || crewSeen.has(k)) continue;
    crewSeen.add(k);
    add(k, { text: `${c.name} crew`, href: `/c/${c.slug}` });
  }

  if (input.road) {
    const r = input.road;
    const text = r.champion ? "Trainer Road champion" : r.regionsCleared ? `Trainer Road: ${plural(r.regionsCleared, "region")} cleared` : `Trainer Road: ${plural(r.badges, "badge")}`;
    add(POKEMON, { text, href: "/pokemon-trainers" });
  }

  // The games they play, in their order: what they're playing now first.
  const order: string[] = [];
  for (const name of [input.nowPlaying, ...input.favorites]) {
    const k = recordKey(name);
    if (k && !order.includes(k)) order.push(k);
  }
  const keys = [...facts.keys()].sort((a, b) => {
    const ia = order.indexOf(a), ib = order.indexOf(b);
    if (ia !== ib) return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    return (facts.get(b)?.length ?? 0) - (facts.get(a)?.length ?? 0);
  });

  const records: PlayRecord[] = keys.map((k) => {
    const space = spaceFor(k);
    const name = k === POKEMON ? "Pokémon" : gameEntry(k)?.name ?? space?.name ?? k;
    return {
      key: k,
      name,
      cover: k === POKEMON ? (space?.box ? { kind: "image", src: space.box } : { kind: "game", name }) : { kind: "game", name },
      facts: facts.get(k) ?? [],
      space: space && input.spaceOpen(k === POKEMON ? space.primary : k) ? { href: spacePath(space), label: `${input.displayName} in ${space.name}` } : null,
    };
  });

  // The dailies, as one record after the games.
  const daily: PlayFact[] = input.dailies
    .filter((d) => d.played > 0)
    .sort((a, b) => b.streak - a.streak || b.played - a.played)
    .slice(0, 3)
    .map((d) => ({ text: d.streak >= 2 ? `${d.streak}-day ${d.name} streak` : `${d.name}: ${plural(d.played, "day")} played`, href: d.href }));
  if (input.weekly?.played && daily.length < 3) {
    daily.push({ text: input.weekly.topTen ? `Weekly top 10 ${input.weekly.topTen === 1 ? "once" : `${input.weekly.topTen} times`}` : `Weekly: ${plural(input.weekly.played, "week")}`, href: "/weekly" });
  }
  if (daily.length) records.push({ key: "dailies", name: "The dailies", cover: { kind: "dailies" }, facts: daily, space: null });

  // Games they've added with nothing to show yet: covers under the records.
  const inRecords = new Set(records.map((r) => r.key));
  const also = [input.nowPlaying, ...input.favorites].filter((n): n is string => !!n)
    .filter((n, i, a) => a.indexOf(n) === i)
    .filter((n) => { const k = recordKey(n); return !k || !inRecords.has(k); });
  return { records, also };
}
