/**
 * Team cards and player cards (overrides picks 2026-11-09, all as recommended). Whatever the bot works out on its own
 * can be set by hand and sticks: a team's name, every tag it plays under, its color, and its players (in-game name →
 * the name and flag tables show). Whose wins (pick 1): this server's list in this server, then the player's own card
 * (/me, every server), then what's worked out (MKCentral by Discord account, the screenshot). Pure, client-safe.
 */

import { samePlayer, tagKey } from "./tags";
import type { TableModel, TableTeam } from "./table";

export type LogoSource = "auto" | "upload" | "mkcentral";
export interface TeamCard {
  id: string; name: string | null; tags: string[]; color: string | null;
  /** Where its logo comes from (wars-m6): auto = your upload, then the linked MKCentral team's, then MKCentral by tag. */
  logoSource?: LogoSource;
  /** The MKCentral team it's linked to, and what MKCentral last said about it. */
  mkcTeamId?: number | null; mkcName?: string | null; mkcLogo?: string | null;
}
export interface RosterRow { teamId: string; ingame: string; shown: string | null; flag: string | null; source: "captain" | "remember"; mkcPlayerId?: number | null }
/** A player on a linked team's MKCentral list. */
export interface MkcPlayerLite { id: number; name: string; country: string | null; discordId: string | null }
export interface PlayerCard { discordId: string; shown: string | null; flag: string | null; ingame: string[]; teams: string[] }

export interface CardSet {
  teams: TeamCard[];
  roster: RosterRow[];
  /** Players' own cards with any of the table's in-game names (and the linked teams' MKCentral players' cards). */
  cards: PlayerCard[];
  /** Linked teams' MKCentral players, by team card id. */
  mkc?: Record<string, MkcPlayerLite[]>;
}

export const EMPTY_CARDS: CardSet = { teams: [], roster: [], cards: [] };

/**
 * The MKCentral player an in-game name is, on a linked team's list: a part of their MKCentral name ("Aira / Umiko"
 * has two) that's the same player (samePlayer: the same, or one starts the other) or ends with the in-game name (4
 * letters or more: ichor → cloudedichor). Only when exactly one player fits; `shown` is the part that matched.
 */
export function matchMkc(ingame: string, players: MkcPlayerLite[]): { player: MkcPlayerLite; shown: string } | null {
  const k = tagKey(ingame);
  if (!k) return null;
  const hits: { player: MkcPlayerLite; shown: string; exact: boolean }[] = [];
  for (const p of players) {
    const parts = p.name.split("/").map((x) => x.trim()).filter(Boolean);
    const part = parts.find((x) => tagKey(x) === k) ?? parts.find((x) => samePlayer(ingame, x) || (k.length >= 4 && tagKey(x).endsWith(k)));
    if (part) hits.push({ player: p, shown: part, exact: tagKey(part) === k });
  }
  const exact = hits.filter((h) => h.exact);
  const pick = exact.length === 1 ? exact[0] : hits.length === 1 ? hits[0] : null;
  return pick ? { player: pick.player, shown: pick.shown } : null;
}

/** The team card a tag or name belongs to (compared without case or symbols). */
export function teamCardFor(teams: TeamCard[], ...keys: (string | null | undefined)[]): TeamCard | null {
  const want = keys.map((k) => (k ? tagKey(k) : "")).filter(Boolean);
  if (!want.length) return null;
  return teams.find((t) => t.tags.some((g) => want.includes(tagKey(g))) || (!!t.name && want.includes(tagKey(t.name)))) ?? null;
}

/** Everything a card says a team goes by: its name and every tag (for matching a screen's tags to a war's teams). */
export function teamAliases(teams: TeamCard[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const t of teams) {
    const all = [t.name, ...t.tags].filter((v): v is string => !!v);
    for (const g of t.tags) {
      const k = tagKey(g);
      if (k) out[k] = [...new Set([...(out[k] ?? []), ...all])];
    }
  }
  return out;
}

/** A tag (case and symbols aside) no other card in the server uses. */
export function tagTaken(teams: TeamCard[], tag: string, except: string | null): TeamCard | null {
  const k = tagKey(tag);
  return teams.find((t) => t.id !== except && t.tags.some((g) => tagKey(g) === k)) ?? null;
}

export interface Who { shown: string; flag: string | null; from: "server" | "player" | "mkcentral"; mkcPlayerId?: number }

/**
 * Who an in-game name is on a table team: this server's list for that team (or the only team in the server listing
 * the name), else a player's own card that names this team, or the only card anywhere with that in-game name.
 */
export function whoIs(ingame: string, team: { tag: string; name: string | null }, set: CardSet): Who | null {
  const k = tagKey(ingame);
  if (!k) return null;
  const card = teamCardFor(set.teams, team.tag, team.name);
  const listed = set.roster.filter((r) => tagKey(r.ingame) === k);
  const mine = card ? listed.find((r) => r.teamId === card.id) : undefined;
  const only = !mine && new Set(listed.map((r) => r.teamId)).size === 1 ? listed[0] : undefined;
  const row = mine ?? only;
  if (row && (row.shown || row.flag)) return { shown: row.shown ?? ingame, flag: row.flag, from: "server" };

  const claims = set.cards.filter((c) => c.ingame.some((n) => tagKey(n) === k));
  const teamKeys = [team.tag, team.name, card?.name, ...(card?.tags ?? [])].map((v) => (v ? tagKey(v) : "")).filter(Boolean);
  const onTeam = claims.filter((c) => c.teams.some((t) => teamKeys.includes(tagKey(t))));
  const pick = onTeam.length === 1 ? onTeam[0] : claims.length === 1 ? claims[0] : null;
  if (pick && (pick.shown || pick.flag)) return { shown: pick.shown ?? ingame, flag: pick.flag, from: "player" };

  // The linked team's MKCentral list; that player's own card (by Discord account) still wins over MKCentral.
  const players = card ? set.mkc?.[card.id] : undefined;
  const hit = players?.length ? matchMkc(ingame, players) : null;
  if (hit) {
    const own = hit.player.discordId ? set.cards.find((c) => c.discordId === hit.player.discordId) : undefined;
    return { shown: own?.shown ?? hit.shown, flag: own?.flag ?? hit.player.country, from: own?.shown || own?.flag ? "player" : "mkcentral", mkcPlayerId: hit.player.id };
  }
  return null;
}

/**
 * Who couldn't be worked out on teams linked to MKCentral ("Who are these?", pick 7): each in-game name with the
 * team's MKCentral players nobody on the table is yet, for a menu. At most `max` names. Players who are already
 * someone (a match, a name a server line or a player's card shows, a typed or tapped flag) aren't asked about.
 */
export function unknownOnLinked(model: TableModel, set: CardSet, teams: number[], max = 5): { team: number; ingame: string; options: MkcPlayerLite[] }[] {
  const out: { team: number; ingame: string; options: MkcPlayerLite[] }[] = [];
  for (const i of teams) {
    const t = model.teams[i];
    const card = t ? teamCardFor(set.teams, t.tag, t.name) : null;
    const players = card ? set.mkc?.[card.id] : undefined;
    if (!t || !card || !players?.length) continue;
    const taken = new Set<number>();
    const open: string[] = [];
    // Already someone: matched, a name your list or a player's card shows, or a player with a flag (typed or tapped).
    const shownAlready = (name: string) => set.roster.some((r) => r.teamId === card.id && !!r.shown && tagKey(r.shown) === tagKey(name)) || set.cards.some((c) => !!c.shown && tagKey(c.shown) === tagKey(name));
    for (const p of t.players) {
      const who = whoIs(p.name, t, set);
      // Whoever they are on MKCentral's list is taken: a match, or the name your list or their card shows.
      const listed = who?.mkcPlayerId ?? matchMkc(who?.shown ?? p.name, players)?.player.id ?? null;
      if (listed) taken.add(listed);
      if (!who && !p.flag && !shownAlready(p.name) && !listed) open.push(p.name);
    }
    for (const n of open) if (out.length < max) out.push({ team: i, ingame: n, options: players.filter((x) => !taken.has(x.id)).slice(0, 24) });
  }
  return out;
}

/**
 * A table with the cards applied: each team shown under its card (the first tag, its name and color), and the players
 * of `teams` (by index; the ones filled from a screenshot) shown by who they are. Typed flags are kept.
 */
export function applyCards(model: TableModel, set: CardSet, teams: number[]): TableModel {
  const out: TableTeam[] = model.teams.map((t, i) => {
    const card = teamCardFor(set.teams, t.tag, t.name);
    const dressed: TableTeam = card
      ? { ...t, tag: (card.tags[0] ?? t.tag).slice(0, 12), name: card.name ?? t.name ?? (tagKey(t.tag) !== tagKey(card.tags[0] ?? "") ? t.tag : null), color: card.color ?? t.color }
      : t;
    if (!teams.includes(i)) return dressed;
    return {
      ...dressed,
      players: dressed.players.map((p) => {
        const who = whoIs(p.name, t, set) ?? (dressed !== t ? whoIs(p.name, dressed, set) : null);
        return who ? { ...p, name: who.shown.slice(0, 32), flag: p.flag ?? who.flag } : p;
      }),
    };
  });
  return { ...model, teams: out };
}

/** One name changed by a fix, to offer to Remember: on which table team, from what the screen said to what was typed. */
export interface NameFix { team: number; ingame: string; shown: string; flag: string | null }

/**
 * What a fix changed, player by player: the table as the screenshot filled it against the table as posted. Players
 * are paired by team and score (each score once), and a pair whose name or flag differs is a fix.
 */
export function fixesBetween(read: TableModel, posted: TableModel): NameFix[] {
  const out: NameFix[] = [];
  posted.teams.forEach((t, ti) => {
    const before = read.teams.find((r) => tagKey(r.tag) === tagKey(t.tag) || (!!r.name && !!t.name && tagKey(r.name) === tagKey(t.name))) ?? read.teams[ti];
    if (!before) return;
    const pool = [...before.players];
    for (const p of t.players) {
      const at = pool.findIndex((q) => q.score === p.score);
      if (at < 0) continue;
      const [was] = pool.splice(at, 1);
      if (tagKey(was.name) !== tagKey(p.name) || (p.flag && p.flag !== was.flag)) out.push({ team: ti, ingame: was.name, shown: p.name, flag: p.flag });
    }
  });
  return out;
}

/** Pasted roster lines: "Jalen = peep/Sxyd [us]", "Jalen peep/Sxyd", "nsn [us]" (in-game name, then name for tables, then flag). */
export function readRosterLines(text: string): { ingame: string; shown: string | null; flag: string | null }[] {
  const out: { ingame: string; shown: string | null; flag: string | null }[] = [];
  for (const raw of text.split(/\r?\n/)) {
    let line = raw.trim();
    if (!line) continue;
    let flag: string | null = null;
    const f = /\s*\[([a-z]{2,10}(?:_[a-z]{2,3})?)\]\s*$/i.exec(line);
    if (f) { flag = f[1].toLowerCase(); line = line.slice(0, f.index).trim(); }
    const eq = /^(.+?)\s*(?:=|→|->|:)\s*(.+)$/.exec(line);
    const [ingame, shown] = eq ? [eq[1].trim(), eq[2].trim()] : [line, null];
    if (!ingame || ingame.length > 32) continue;
    out.push({ ingame, shown: shown && shown !== ingame ? shown.slice(0, 32) : null, flag });
  }
  return out.slice(0, 40);
}
