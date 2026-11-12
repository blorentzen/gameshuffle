import "server-only";

/**
 * Tournament team lists (Pokémon Champions events; game space picks 2026-11-11, pick 10). Built on the deck lists:
 * the same table (`tournament_deck_lists`, one row per entrant), the same route (/api/tournament/[id]/deck-lists,
 * which answers with `kind: "team"` for these events) and the same settings (`settings.deckLists`). A team is stored
 * as six deck lines (name, Pokédex number in `number`), so no migration was needed.
 *
 * A team is checked against the current season's list when it's sent (on the list, one per species, four to six) and
 * again on every read, so a team sent before a regulation change shows what's no longer allowed.
 *
 * Who sees a team: the player, the organizers, and the public as the organizer chose: open team lists from round 1,
 * the top cut's once the cut is set, everyone's after the event, or nobody.
 */

import { createServiceClient } from "@/lib/supabase/admin";
import { createNotification } from "@/lib/social/notifications";
import type { DeckLine } from "@/lib/tcg/deckList";
import {
  TEAM_MIN, TEAM_SIZE, championById, championByName, nameFromId, problemText, teamProblems,
  type ChampMon, type TeamEntry,
} from "@/lib/pokemon/champions";
import { deckListSettingsOf, deckListsLocked, isTeamListGame, listKindOf, type DeckListSettings, type ListKind } from "./deckLists";
import { isSwissState } from "./swiss";

const MISSING = new Set(["42P01", "PGRST205", "42703", "PGRST204"]);
const COLS = "id, participant_id, user_id, deck_id, name, cards, submitted_at, updated_at, checked_at";

export type TeamListError = "missing" | "not_found" | "off" | "locked" | "not_playing" | "bad_team" | "bad_name" | "busy";
export const TEAM_LIST_ERRORS: Record<TeamListError, string> = {
  missing: "Team lists need a database update first.",
  not_found: "We couldn't find that tournament.",
  off: "This tournament doesn't take team lists.",
  locked: "Team lists are locked: the event has started.",
  not_playing: "Join the tournament first, then send your team.",
  bad_team: "That team can't be sent.",
  bad_name: "Give the team a shorter name.",
  busy: "Something went wrong saving your team. Try again.",
};

export interface TeamMember { id: string; name: string; dex: number; types: string[]; onList: boolean }
export interface TeamListView {
  id: string;
  name: string;
  members: TeamMember[];
  /** What stops it being legal now, in plain words (empty = legal). */
  problems: string[];
  legal: boolean;
  updatedAt: string;
  checkedAt: string | null;
}

interface TRow { id: string; title: string; status: string; format: string | null; game_slug: string | null; settings: Record<string, unknown> | null; swiss: unknown }
interface ListRow { id: string; participant_id: string; user_id: string | null; deck_id: string | null; name: string; cards: DeckLine[]; submitted_at: string; updated_at: string; checked_at: string | null }
type Result<T> = { ok: true; value: T } | { ok: false; error: TeamListError; message?: string };
const fail = <T>(error: TeamListError, message?: string): Result<T> => ({ ok: false, error, ...(message ? { message } : {}) });
const missingOr = (code: string | undefined) => (code && MISSING.has(code) ? "missing" : "busy") as TeamListError;

const db = () => createServiceClient();

async function tournament(id: string): Promise<TRow | null> {
  const { data } = await db().from("tournaments").select("id, title, status, format, game_slug, settings, swiss").eq("id", id).maybeSingle();
  return (data as unknown as TRow | null) ?? null;
}

/** Which kind of list a tournament takes (null: none), for the route to answer with the right shape. */
export async function tournamentListKind(id: string): Promise<ListKind | null> {
  const { data } = await db().from("tournaments").select("game_slug").eq("id", id).maybeSingle();
  return listKindOf((data as { game_slug: string | null } | null)?.game_slug);
}

/** A team as stored: one deck line per Pokémon, its Pokédex number in `number`. */
const toLines = (team: ChampMon[]): DeckLine[] => team.map((m) => ({ count: 1, name: m.name, set: null, number: String(m.dex), section: "pokemon", cardId: null }));

function entriesOf(lines: DeckLine[]): TeamEntry[] {
  return (lines ?? []).slice(0, 12).map((l) => championByName(l.name) ?? { id: String(l.name).toLowerCase(), name: String(l.name), offList: true as const });
}

export function viewOf(row: Pick<ListRow, "id" | "name" | "cards" | "updated_at" | "checked_at">): TeamListView {
  const entries = entriesOf(row.cards);
  const problems = teamProblems(entries, TEAM_MIN).map(problemText);
  const dexOf = (e: TeamEntry, i: number) => ("offList" in e ? Number(row.cards[i]?.number) || 0 : e.dex);
  return {
    id: row.id, name: row.name,
    members: entries.map((e, i) => ({ id: e.id, name: e.name, dex: dexOf(e, i), types: "offList" in e ? [] : e.types, onList: !("offList" in e) })),
    problems, legal: problems.length === 0, updatedAt: row.updated_at, checkedAt: row.checked_at,
  };
}

/** The signed-in player's entry and team. */
export async function myTeamList(id: string, userId: string): Promise<Result<{ participantId: string | null; team: TeamListView | null; locked: boolean; settings: DeckListSettings }>> {
  const t = await tournament(id);
  if (!t) return fail("not_found");
  const settings = deckListSettingsOf(t.settings);
  if (!isTeamListGame(t.game_slug) || settings.when === "off") return fail("off");
  const { data: p } = await db().from("tournament_participants").select("id").eq("tournament_id", id).eq("user_id", userId).maybeSingle();
  const participantId = (p as { id: string } | null)?.id ?? null;
  if (!participantId) return { ok: true, value: { participantId: null, team: null, locked: deckListsLocked(t.status), settings } };
  const { data, error } = await db().from("tournament_deck_lists").select(COLS).eq("participant_id", participantId).maybeSingle();
  if (error) return fail(missingOr(error.code));
  const row = data as ListRow | null;
  return { ok: true, value: { participantId, team: row ? viewOf(row) : null, locked: deckListsLocked(t.status), settings } };
}

/** Checks a team someone wants to send: the ids it names, legal now, four to six. The error says what's wrong. */
export function checkTeam(ids: unknown): Result<ChampMon[]> {
  const list = Array.isArray(ids) ? ids.map((x) => String(x ?? "").trim().toLowerCase()).filter(Boolean).slice(0, 12) : [];
  const unknown = list.filter((x) => !championById(x));
  if (unknown.length) return fail("bad_team", `${unknown.map(nameFromId).join(", ")} ${unknown.length === 1 ? "isn't" : "aren't"} on this season's list.`);
  const team = list.map((x) => championById(x)!).filter((m, i, all) => all.findIndex((y) => y.id === m.id) === i);
  const problems = teamProblems(team, TEAM_MIN);
  if (problems.length) return fail("bad_team", problemText(problems[0]));
  return { ok: true, value: team.slice(0, TEAM_SIZE) };
}

/** Send (or swap) a player's team. */
export async function submitTeamList(id: string, userId: string, input: { team?: unknown; name?: unknown }): Promise<Result<TeamListView>> {
  const t = await tournament(id);
  if (!t) return fail("not_found");
  const settings = deckListSettingsOf(t.settings);
  if (!isTeamListGame(t.game_slug) || settings.when === "off") return fail("off");
  if (deckListsLocked(t.status)) return fail("locked");
  const { data: p } = await db().from("tournament_participants").select("id, status").eq("tournament_id", id).eq("user_id", userId).maybeSingle();
  const seat = p as { id: string; status: string } | null;
  if (!seat || seat.status === "dropped") return fail("not_playing");
  const checked = checkTeam(input.team);
  if (!checked.ok) return checked;
  const name = String(input.name ?? "").replace(/\s+/g, " ").trim();
  if (name.length > 60) return fail("bad_name");
  const now = new Date().toISOString();
  const { data, error } = await db().from("tournament_deck_lists").upsert(
    { tournament_id: id, participant_id: seat.id, user_id: userId, deck_id: null, name: name || "My team", cards: toLines(checked.value), updated_at: now, checked_at: null, checked_by: null },
    { onConflict: "participant_id" },
  ).select(COLS).single();
  if (error) return fail(missingOr(error.code));
  return { ok: true, value: viewOf(data as ListRow) };
}

export interface OrganizerTeamRow {
  participantId: string;
  player: string;
  status: string;
  hasAccount: boolean;
  /** `deck` like the deck list rows, so the Swiss console's "who has no list" count reads both. */
  deck: TeamListView | null;
}

/** Every entrant and their team, for the manage page. */
export async function organizerTeamLists(id: string): Promise<Result<{ rows: OrganizerTeamRow[]; settings: DeckListSettings; locked: boolean }>> {
  const t = await tournament(id);
  if (!t) return fail("not_found");
  if (!isTeamListGame(t.game_slug)) return fail("off");
  const settings = deckListSettingsOf(t.settings);
  const [{ data: ppl }, lists] = await Promise.all([
    db().from("tournament_participants").select("id, user_id, display_name, status").eq("tournament_id", id).order("joined_at", { ascending: true }),
    db().from("tournament_deck_lists").select(COLS).eq("tournament_id", id),
  ]);
  if (lists.error) return fail(missingOr(lists.error.code));
  const byParticipant = new Map(((lists.data ?? []) as ListRow[]).map((r) => [r.participant_id, r]));
  const rows: OrganizerTeamRow[] = [];
  for (const p of (ppl ?? []) as { id: string; user_id: string | null; display_name: string | null; status: string }[]) {
    if (p.status === "waitlisted" || p.status === "offered" || p.status === "withdrawn") continue;
    const row = byParticipant.get(p.id);
    rows.push({ participantId: p.id, player: p.display_name || "Player", status: p.status, hasAccount: !!p.user_id, deck: row ? viewOf(row) : null });
  }
  return { ok: true, value: { rows, settings, locked: deckListsLocked(t.status) } };
}

/** A nudge to an entrant who hasn't sent a team (in-app, accounts only). */
export async function remindTeamList(id: string, participantId: string): Promise<Result<boolean>> {
  const t = await tournament(id);
  if (!t) return fail("not_found");
  const { data } = await db().from("tournament_participants").select("user_id").eq("id", participantId).eq("tournament_id", id).maybeSingle();
  const userId = (data as { user_id: string | null } | null)?.user_id;
  if (!userId) return { ok: true, value: false };
  await createNotification({
    userId, type: "tournament_update", title: "Send your team list",
    message: `${t.title} needs your team before round 1: four to six Pokémon from this season's list. Build it on the tournament page.`,
    link: `/tournament/${id}#deck-list`, data: { eventType: "tournament", eventId: id },
  });
  return { ok: true, value: true };
}

export type TeamScope = "open" | "top_cut" | "all";
export interface PublicTeamList { placement: number | null; player: string; team: TeamListView }

/**
 * Which teams the public can see right now, as the organizer chose: none while private; every team from round 1 for
 * open team lists; the top cut's once the cut is set (Swiss) or the event's over (brackets: the top 4); everyone's
 * once it's over.
 */
export function publicScope(t: Pick<TRow, "status" | "settings" | "swiss">): { scope: TeamScope; only: Set<string> | null; cut: number } | null {
  const s = deckListSettingsOf(t.settings);
  if (s.when === "off" || s.after === "private") return null;
  const started = t.status === "in_progress" || t.status === "complete";
  const swiss = isSwissState(t.swiss) ? t.swiss : null;
  const cut = swiss?.topCut ? swiss.topCut : 4;
  if (s.after === "open") return started ? { scope: "open", only: null, cut } : null;
  if (s.after === "all") return t.status === "complete" ? { scope: "all", only: null, cut } : null;
  // The top cut: its seeds once the cut is set, else (brackets, or a Swiss without a cut) the placements at the end.
  if (swiss?.cut?.seeds?.length) return { scope: "top_cut", only: new Set(swiss.cut.seeds), cut };
  return t.status === "complete" ? { scope: "top_cut", only: null, cut } : null;
}

export async function publicTeamLists(id: string): Promise<Result<{ lists: PublicTeamList[]; scope: TeamScope } | null>> {
  const t = await tournament(id);
  if (!t) return fail("not_found");
  if (!isTeamListGame(t.game_slug)) return { ok: true, value: null };
  const shown = publicScope(t);
  if (!shown) return { ok: true, value: null };
  const [{ data: res }, lists, { data: ppl }] = await Promise.all([
    db().from("tournament_results").select("participant_id, placement").eq("tournament_id", id),
    db().from("tournament_deck_lists").select(COLS).eq("tournament_id", id),
    db().from("tournament_participants").select("id, display_name, status").eq("tournament_id", id),
  ]);
  if (lists.error) return fail(missingOr(lists.error.code));
  const place = new Map(((res ?? []) as { participant_id: string; placement: number | null }[]).filter((r) => r.placement != null).map((r) => [r.participant_id, r.placement as number]));
  const people = new Map(((ppl ?? []) as { id: string; display_name: string | null; status: string }[]).map((p) => [p.id, p]));
  const out: PublicTeamList[] = [];
  for (const row of (lists.data ?? []) as ListRow[]) {
    const who = people.get(row.participant_id);
    if (!who || who.status === "withdrawn") continue;
    const placement = place.get(row.participant_id) ?? null;
    if (shown.only && !shown.only.has(row.participant_id)) continue;
    if (shown.scope === "top_cut" && !shown.only && (placement == null || placement > shown.cut)) continue;
    out.push({ placement, player: who.display_name || "Player", team: viewOf(row) });
  }
  out.sort((a, b) => (a.placement ?? 9999) - (b.placement ?? 9999) || a.player.localeCompare(b.player));
  return { ok: true, value: { lists: out, scope: shown.scope } };
}
