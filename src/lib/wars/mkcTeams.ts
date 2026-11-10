import "server-only";

/**
 * MKCentral teams for war team cards (logos + MKCentral picks 2026-11-09, all A). MKCentral's public registry: a
 * search (`/api/registry/teams?name_or_tag=`) and a team's page (`/api/registry/teams/<id>`), whose rosters list every
 * player with a country and Discord account. Read without an account, the same public data /war already uses. A team
 * is kept 10 minutes per server instance; a failed read keeps the last answer.
 */

import type { WarGame } from "./rules";

const MKC = "https://mkcentral.com";
const TTL = 10 * 60_000;

export interface MkcPlayer { id: number; name: string; country: string | null; discordId: string | null }
export interface MkcRoster { game: string; mode: string; tag: string; name: string; active: boolean; players: MkcPlayer[] }
export interface MkcTeam { id: number; name: string; tag: string; logo: string | null; rosters: MkcRoster[] }
export interface MkcHit { id: number; name: string; tag: string; logo: string | null; game: string | null; players: number | null }

const logoUrl = (v: unknown) => (typeof v === "string" && v ? `${MKC}${v.startsWith("/") ? "" : "/"}${v}` : null);
const mkcGame = (g: WarGame) => (g === "mk8dx" ? "mk8dx" : "mkworld");

type RawPlayer = { player_id?: number; name?: string; country_code?: string | null; discord?: { discord_id?: string } | null };
type RawRoster = { game?: string; mode?: string; tag?: string; name?: string; is_active?: boolean; players?: RawPlayer[] };
type RawTeam = { id?: number; name?: string; tag?: string; logo?: string | null; is_historical?: boolean; rosters?: RawRoster[] };

function toTeam(t: RawTeam): MkcTeam | null {
  if (!t?.id || !t.name) return null;
  return {
    id: t.id, name: String(t.name).slice(0, 80), tag: String(t.tag ?? "").slice(0, 12), logo: logoUrl(t.logo),
    rosters: (t.rosters ?? []).map((r) => ({
      game: String(r.game ?? ""), mode: String(r.mode ?? ""), tag: String(r.tag ?? "").slice(0, 12), name: String(r.name ?? "").slice(0, 80), active: !!r.is_active,
      players: (r.players ?? []).filter((p) => p.player_id && p.name).map((p) => ({
        id: p.player_id!, name: String(p.name).slice(0, 40), country: p.country_code ? String(p.country_code).toLowerCase() : null,
        discordId: p.discord?.discord_id && /^\d{5,25}$/.test(p.discord.discord_id) ? p.discord.discord_id : null,
      })),
    })),
  };
}

const teams = new Map<number, { at: number; team: MkcTeam | null }>();

/** A team's page, with its rosters and players. */
export async function mkcTeam(id: number, opts: { fresh?: boolean } = {}): Promise<MkcTeam | null> {
  if (!Number.isInteger(id) || id <= 0) return null;
  const hit = teams.get(id);
  if (hit && !opts.fresh && Date.now() - hit.at < TTL) return hit.team;
  const res = await fetch(`${MKC}/api/registry/teams/${id}`, { signal: AbortSignal.timeout(3000) }).catch(() => null);
  if (!res?.ok) return hit?.team ?? null;
  const team = toTeam((await res.json().catch(() => null)) as RawTeam);
  teams.set(id, { at: Date.now(), team });
  if (teams.size > 300) teams.delete(teams.keys().next().value!);
  return team;
}

/** A team's roster for the game (the active one first), or null when it has none for that game. */
export function rosterFor(team: MkcTeam, game: WarGame): MkcRoster | null {
  const want = mkcGame(game);
  return team.rosters.filter((r) => r.game === want).sort((a, b) => Number(b.active) - Number(a.active) || b.players.length - a.players.length)[0] ?? null;
}

/** Teams matching a tag or name, the game's roster tag and size when there is one. */
export async function searchMkcTeams(q: string, game: WarGame): Promise<MkcHit[]> {
  const text = q.trim().slice(0, 40);
  if (!text) return [];
  const res = await fetch(`${MKC}/api/registry/teams?name_or_tag=${encodeURIComponent(text)}`, { signal: AbortSignal.timeout(3000) }).catch(() => null);
  if (!res?.ok) return [];
  const body = (await res.json().catch(() => null)) as { teams?: RawTeam[] } | null;
  const want = mkcGame(game);
  const out: MkcHit[] = [];
  for (const raw of body?.teams ?? []) {
    const t = toTeam(raw);
    if (!t || raw.is_historical) continue;
    const r = t.rosters.find((x) => x.game === want && x.active) ?? null;
    out.push({ id: t.id, name: r?.name || t.name, tag: r?.tag || t.tag, logo: t.logo, game: r ? want : null, players: r ? r.players.length || null : null });
  }
  const lower = text.toLowerCase();
  return out.sort((a, b) => Number(b.tag.toLowerCase() === lower) - Number(a.tag.toLowerCase() === lower) || Number(!!b.game) - Number(!!a.game)).slice(0, 25);
}

/** Teams whose tag for this game is exactly `tag` (for /war asking which one when there are several). */
export async function mkcTeamsWithTag(tag: string, game: WarGame): Promise<MkcHit[]> {
  const lower = tag.trim().toLowerCase();
  return (await searchMkcTeams(tag, game)).filter((t) => t.game && t.tag.toLowerCase() === lower);
}

/** An MKCentral team from a pasted link (…/registry/teams/profile?id=2929, …/teams/2929) or its number. */
export function mkcIdFrom(text: string): number | null {
  const t = text.trim();
  const m = /^(\d{1,9})$/.exec(t) ?? /mkcentral\.com\/.*?teams\/(?:profile\?(?:.*&)?id=)?(\d{1,9})/i.exec(t) ?? /[?&]id=(\d{1,9})/.exec(t);
  return m ? Number(m[1]) : null;
}
