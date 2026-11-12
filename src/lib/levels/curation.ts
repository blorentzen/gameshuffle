import "server-only";

/**
 * Curating player levels (picks 2026-11-11, all 17 as recommended; supabase/levels-m2.sql). On top of the boards from
 * ./store.ts: players' marks and likes (no tokens), the sorts (Top this week, Streamers' picks, Newest, Hardest, Lists),
 * difficulty from clears, the "May not work" flag, reports (Platform ▸ Moderation; three hide a level), GameShuffle
 * picks and the level of the week (staff), lists, follow notifications, Mario Maker 2 maker IDs and the maker's
 * profile section. Every function answers as if nothing were there until `curationReady()`. Service role throughout.
 */

import { createServiceClient } from "@/lib/supabase/admin";
import { readAllPages } from "@/lib/supabase/pages";
import { isStaffRole } from "@/lib/subscription";
import { isProUser } from "@/lib/subscription-server";
import { gsDay, gsDayStart } from "@/lib/time/gsClock";
import { createNotification } from "@/lib/social/notifications";
import { createReport } from "@/lib/moderation/reports";
import { curationReady } from "./ready";
import { decodeSmm2, formatSmm2, readSmm2 } from "./codes";
import { CURATION_GAMES, isQueueGame, itemWord, LEVEL_GAMES, type LevelGame } from "./games";
import {
  cleanListTitle, cleanPickNote, clearLine, HIDE_AT_REPORTS, isEdition, LEVEL_REPORTS, levelStats, LIST_MAX, LISTS_PER_GAME,
  NEW_DAYS, PICKS_MAX, playedLine, sortCards, TOP_DAYS, weekOf,
  type BoardSort, type LevelReportId, type LevelResult, type LevelStats, type MarkFact, type MarkOutcome, type SeedSpot,
} from "./rules";
import { addFromBoard, listLevels, names, type BoardAddResult } from "./store";
import type { BoardExtras, LevelCardView, LevelListView } from "./types";

const S = "level_shares";
const M = "level_marks";
const W = "level_weeks";
const L = "level_lists";
const LI = "level_list_items";
const E = "level_queue_entries";
const SHARE_COLS = "id, game, code, title, tags, user_id, created_at, pick_note, picked_at, held_at, edition, version, note, spots";
const CHUNK = 150;

interface ShareRow {
  id: string; game: string; code: string; title: string; tags: string[] | null; user_id: string; created_at: string;
  pick_note: string | null; picked_at: string | null; held_at: string | null; edition: string | null; version: string | null; note: string | null; spots: unknown;
}
interface MarkRow { level_id: string; user_id: string; outcome: MarkOutcome | null; outcome_at: string | null; liked_at: string | null }
interface PlayRow { code: string; result: LevelResult | null; owner_user_id: string; played_at: string }

const chunks = <T,>(list: T[], n = CHUNK): T[][] => Array.from({ length: Math.ceil(list.length / n) }, (_, i) => list.slice(i * n, i * n + n));
const dayLabel = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

async function isStaff(userId: string | null | undefined): Promise<boolean> {
  if (!userId) return false;
  const { data } = await createServiceClient().from("users").select("role").eq("id", userId).maybeSingle();
  return isStaffRole((data as { role: string | null } | null)?.role);
}

/** Every mark on these levels (paged past the 1,000-row reply cap, in chunks of ids). */
async function marksFor(ids: string[]): Promise<Map<string, MarkRow[]>> {
  const out = new Map<string, MarkRow[]>();
  const db = createServiceClient();
  for (const part of chunks([...new Set(ids)])) {
    const { data } = await readAllPages<MarkRow>((from, to) => db.from(M).select("level_id, user_id, outcome, outcome_at, liked_at")
      .in("level_id", part).order("level_id").order("user_id").range(from, to));
    for (const r of data) out.set(r.level_id, [...(out.get(r.level_id) ?? []), r]);
  }
  return out;
}

/** Plays on stream for codes in a game, newest first (chunked and paged). */
async function playsByCode(game: LevelGame, codes: string[]): Promise<Map<string, PlayRow[]>> {
  const out = new Map<string, PlayRow[]>();
  if (!isQueueGame(game)) return out;
  const db = createServiceClient();
  for (const part of chunks([...new Set(codes)])) {
    const { data } = await readAllPages<PlayRow>((from, to) => db.from(E).select("code, result, owner_user_id, played_at")
      .eq("game", game).eq("status", "played").in("code", part).order("played_at", { ascending: false }).order("id").range(from, to));
    for (const r of data) out.set(r.code, [...(out.get(r.code) ?? []), r]);
  }
  return out;
}

async function sharesById(ids: string[], staff: boolean): Promise<ShareRow[]> {
  const db = createServiceClient();
  const out: ShareRow[] = [];
  for (const part of chunks([...new Set(ids)])) {
    let q = db.from(S).select(SHARE_COLS).in("id", part).is("removed_at", null);
    if (!staff) q = q.is("held_at", null);
    const { data } = await q;
    out.push(...((data ?? []) as ShareRow[]));
  }
  return out;
}

async function sharesByCode(game: LevelGame, codes: string[]): Promise<ShareRow[]> {
  const db = createServiceClient();
  const out: ShareRow[] = [];
  for (const part of chunks([...new Set(codes)])) {
    const { data } = await db.from(S).select(SHARE_COLS).eq("game", game).in("code", part).is("removed_at", null).is("held_at", null);
    out.push(...((data ?? []) as ShareRow[]));
  }
  return out;
}

interface Hydrated { card: LevelCardView; stats: LevelStats; lastPlay: string | null; createdAt: string; id: string }

/** Rows into cards with everything the curation picks add, for one viewer. */
async function hydrate(rows: ShareRow[], viewerId: string | null, staff: boolean): Promise<Hydrated[]> {
  if (!rows.length) return [];
  const db = createServiceClient();
  const ids = rows.map((r) => r.id);
  const byGame = new Map<LevelGame, string[]>();
  for (const r of rows) byGame.set(r.game as LevelGame, [...(byGame.get(r.game as LevelGame) ?? []), r.code]);
  const [marks, who, weeks, makers, ...plays] = await Promise.all([
    marksFor(ids),
    names(rows.map((r) => r.user_id)),
    (async () => {
      const out = new Map<string, string[]>();
      for (const part of chunks(ids)) {
        const { data } = await db.from(W).select("level_id, week").in("level_id", part).order("week", { ascending: false });
        for (const w of (data ?? []) as { level_id: string; week: string }[]) out.set(w.level_id, [...(out.get(w.level_id) ?? []), w.week]);
      }
      return out;
    })(),
    (async () => {
      const makerIds = rows.filter((r) => r.game === "super-mario-maker-2").map((r) => r.user_id);
      if (!makerIds.length) return new Map<string, string>();
      const { data } = await db.from("level_makers").select("user_id, smm2_maker_id").in("user_id", [...new Set(makerIds)]);
      return new Map(((data ?? []) as { user_id: string; smm2_maker_id: string | null }[]).filter((m) => m.smm2_maker_id).map((m) => [m.user_id, m.smm2_maker_id as string]));
    })(),
    ...[...byGame.entries()].map(([g, codes]) => playsByCode(g, codes).then((m) => [g, m] as const)),
  ]);
  const playMap = new Map<string, Map<string, PlayRow[]>>(plays.map(([g, m]) => [g, m]));
  const streamerNames = await names([...new Set([...playMap.values()].flatMap((m) => [...m.values()].flat().map((p) => p.owner_user_id)))]);
  const newSince = new Date(Date.now() - NEW_DAYS * 86_400_000).toISOString();
  return rows.map((r) => {
    const game = r.game as LevelGame;
    const p = playMap.get(game)?.get(r.code) ?? [];
    const m = marks.get(r.id) ?? [];
    const facts: MarkFact[] = m.map((x) => ({ outcome: x.outcome, outcomeAt: x.outcome_at, likedAt: x.liked_at }));
    const stats = levelStats(facts, p.map((x) => ({ result: x.result, at: x.played_at })));
    const real = p.filter((x) => x.result !== "skipped");
    const mine = viewerId ? m.find((x) => x.user_id === viewerId) : undefined;
    const seed = LEVEL_GAMES[game].kind === "seed"
      ? { edition: isEdition(r.edition) ? r.edition : null, version: r.version, note: r.note, spots: (Array.isArray(r.spots) ? r.spots : []) as SeedSpot[] }
      : undefined;
    const card: LevelCardView = {
      id: r.id, game, code: r.code, title: r.title, tags: r.tags ?? [],
      by: who.get(r.user_id) ?? { name: "A player", username: null },
      createdAt: r.created_at,
      played: playedLine(p.map((x) => ({ result: x.result, streamer: streamerNames.get(x.owner_user_id)?.name ?? null }))),
      plays: real.length,
      isNew: r.created_at >= newSince && real.length === 0 && stats.likes === 0,
      canRemove: !!viewerId && (viewerId === r.user_id || staff),
      curation: {
        likes: stats.likes, likesWeek: stats.likesWeek, clears: clearLine(stats), mayNotWork: stats.mayNotWork,
        mine: { outcome: mine?.outcome ?? null, liked: !!mine?.liked_at },
        pick: r.picked_at ? r.pick_note : null,
        weeks: (weeks.get(r.id) ?? []).map(dayLabel),
        makerId: game === "super-mario-maker-2" ? makers.get(r.user_id) ?? null : null,
        held: !!r.held_at,
      },
      ...(seed ? { seed } : {}),
    };
    return { card, stats, lastPlay: real[0]?.played_at ?? null, createdAt: r.created_at, id: r.id };
  });
}

const BOARD_READ = 300;

/** The rows a sort draws from: the newest 300, or every level liked this week, cleared on streams, or marked. */
async function candidates(game: LevelGame, sort: BoardSort, staff: boolean): Promise<ShareRow[]> {
  const db = createServiceClient();
  if (sort === "top") {
    const since = new Date(Date.now() - TOP_DAYS * 86_400_000).toISOString();
    const { data } = await readAllPages<{ level_id: string }>((from, to) => db.from(M).select("level_id")
      .eq("game", game).gte("liked_at", since).order("level_id").order("user_id").range(from, to));
    return sharesById(data.map((r) => r.level_id), staff);
  }
  if (sort === "streamers") {
    if (!isQueueGame(game)) return [];
    const { data } = await readAllPages<{ code: string }>((from, to) => db.from(E).select("code")
      .eq("game", game).eq("status", "played").eq("result", "cleared").order("id").range(from, to));
    const count = new Map<string, number>();
    for (const r of data) count.set(r.code, (count.get(r.code) ?? 0) + 1);
    return sharesByCode(game, [...count.entries()].filter(([, n]) => n >= 2).map(([c]) => c));
  }
  if (sort === "hardest") {
    const [{ data: marked }, played] = await Promise.all([
      readAllPages<{ level_id: string }>((from, to) => db.from(M).select("level_id").eq("game", game).in("outcome", ["cleared", "gave_up"])
        .order("level_id").order("user_id").range(from, to)),
      isQueueGame(game)
        ? readAllPages<{ code: string }>((from, to) => db.from(E).select("code").eq("game", game).eq("status", "played").in("result", ["cleared", "gave_up"]).order("id").range(from, to))
        : Promise.resolve({ data: [] as { code: string }[] }),
    ]);
    const a = await sharesById(marked.map((r) => r.level_id), staff);
    const b = await sharesByCode(game, played.data.map((r) => r.code));
    return [...new Map([...a, ...b].map((r) => [r.id, r])).values()];
  }
  let q = db.from(S).select(SHARE_COLS).eq("game", game).is("removed_at", null);
  if (!staff) q = q.is("held_at", null);
  const { data } = await q.order("created_at", { ascending: false }).limit(BOARD_READ);
  return (data ?? []) as ShareRow[];
}

/** A board's cards for a sort, paged. Null before the curation tables exist. */
export async function boardLevels(o: { game: LevelGame; sort: BoardSort; viewerId: string | null; offset?: number; limit?: number }): Promise<{ levels: LevelCardView[]; more: boolean } | null> {
  if (!(await curationReady())) return null;
  const staff = await isStaff(o.viewerId);
  const sort: BoardSort = o.sort === "played" ? "streamers" : o.sort === "hard" ? "hardest" : o.sort;
  if (sort === "lists") return { levels: [], more: false };
  const rows = await candidates(o.game, sort, staff);
  const cards = sortCards(await hydrate(rows, o.viewerId, staff), sort);
  const offset = Math.max(0, o.offset ?? 0);
  const limit = Math.min(50, Math.max(1, o.limit ?? 20));
  return { levels: cards.slice(offset, offset + limit).map((c) => c.card), more: cards.length > offset + limit };
}

/** One level's card, fresh, for a viewer (after a mark, a like or a pin). */
export async function levelCard(levelId: string, viewerId: string | null): Promise<LevelCardView | null> {
  const staff = await isStaff(viewerId);
  const rows = await sharesById([levelId], staff);
  return (await hydrate(rows, viewerId, staff))[0]?.card ?? null;
}

/** The board's picks, the level of the week, and what the viewer can do. */
export async function boardExtras(game: LevelGame, viewerId: string | null): Promise<BoardExtras> {
  const none: BoardExtras = { curation: false, picks: [], week: null, viewer: { signedIn: !!viewerId, staff: false, queue: false }, myLists: [] };
  if (!(await curationReady())) return none;
  const db = createServiceClient();
  const week = weekOf(gsDay());
  const [staff, pro, picksRes, weekRes, mine] = await Promise.all([
    isStaff(viewerId),
    viewerId && isQueueGame(game) ? isProUser(viewerId).catch(() => false) : Promise.resolve(false),
    db.from(S).select(SHARE_COLS).eq("game", game).not("picked_at", "is", null).is("removed_at", null).is("held_at", null).order("picked_at", { ascending: false }).limit(PICKS_MAX),
    LEVEL_GAMES[game].kind === "level" ? db.from(W).select("level_id").eq("game", game).eq("week", week).maybeSingle() : Promise.resolve({ data: null }),
    viewerId ? myLists(viewerId, game) : Promise.resolve([]),
  ]);
  const weekId = (weekRes.data as { level_id: string } | null)?.level_id ?? null;
  const [picks, weekRows] = await Promise.all([
    hydrate((picksRes.data ?? []) as ShareRow[], viewerId, staff),
    weekId ? sharesById([weekId], false).then((r) => hydrate(r, viewerId, staff)) : Promise.resolve([]),
  ]);
  return {
    curation: true,
    picks: picks.map((p) => p.card),
    week: weekRows[0]?.card ?? null,
    viewer: { signedIn: !!viewerId, staff, queue: pro },
    myLists: mine.map((l) => ({ id: l.id, title: l.title, count: l.count })),
  };
}

// ── Marks, likes, reports ────────────────────────────────────────────────────

type Act<T = LevelCardView> = { ok: true; card: T } | { ok: false; error: string; line?: string };

async function liveShare(levelId: string): Promise<ShareRow | null> {
  const { data } = await createServiceClient().from(S).select(SHARE_COLS).eq("id", levelId).is("removed_at", null).maybeSingle();
  return (data as ShareRow | null) ?? null;
}

/** A player's mark: cleared, gave up, the code didn't load, or none. One at a time, changeable. Levels only. */
export async function markLevel(userId: string, levelId: string, outcome: MarkOutcome | null): Promise<Act> {
  if (!(await curationReady())) return { ok: false, error: "not_ready" };
  const row = await liveShare(levelId);
  if (!row || row.held_at) return { ok: false, error: "not_found" };
  if (LEVEL_GAMES[row.game as LevelGame]?.kind !== "level") return { ok: false, error: "bad_request" };
  const now = new Date().toISOString();
  const { error } = await createServiceClient().from(M).upsert(
    { level_id: levelId, user_id: userId, game: row.game, outcome, outcome_at: outcome ? now : null },
    { onConflict: "level_id,user_id" },
  );
  if (error) throw new Error(`level mark failed: ${error.message}`);
  const card = await levelCard(levelId, userId);
  return card ? { ok: true, card } : { ok: false, error: "not_found" };
}

/** A like (or taking it back). */
export async function likeLevel(userId: string, levelId: string, liked: boolean): Promise<Act> {
  if (!(await curationReady())) return { ok: false, error: "not_ready" };
  const row = await liveShare(levelId);
  if (!row || row.held_at) return { ok: false, error: "not_found" };
  const db = createServiceClient();
  const { data: had } = await db.from(M).select("level_id").eq("level_id", levelId).eq("user_id", userId).maybeSingle();
  const liked_at = liked ? new Date().toISOString() : null;
  const { error } = had
    ? await db.from(M).update({ liked_at }).eq("level_id", levelId).eq("user_id", userId)
    : await db.from(M).insert({ level_id: levelId, user_id: userId, game: row.game, liked_at });
  if (error) throw new Error(`level like failed: ${error.message}`);
  const card = await levelCard(levelId, userId);
  return card ? { ok: true, card } : { ok: false, error: "not_found" };
}

/**
 * Report a level (wrong game, offensive, spam): a report on Platform ▸ Moderation through the site's reports; three
 * open reports hide it from the board until staff look (dismissing puts it back, taking it down removes it).
 */
export async function reportLevel(userId: string, levelId: string, reasonId: LevelReportId): Promise<{ ok: true; hidden: boolean } | { ok: false; error: string }> {
  if (!(await curationReady())) return { ok: false, error: "not_ready" };
  const row = await liveShare(levelId);
  if (!row) return { ok: false, error: "not_found" };
  if (row.user_id === userId) return { ok: false, error: "own_level" };
  const reason = LEVEL_REPORTS.find((r) => r.id === reasonId)!;
  const g = LEVEL_GAMES[row.game as LevelGame];
  const filed = await createReport({
    reporterUserId: userId, reporterToken: null, targetType: "level", targetId: levelId, reason: reason.reason,
    details: `${reason.label}. ${g.name} ${itemWord(row.game as LevelGame)} ${row.code}: ${row.title}`,
  });
  if (!filed.ok) return { ok: false, error: filed.reason };
  const db = createServiceClient();
  const { count } = await db.from("reports").select("id", { count: "exact", head: true }).eq("target_type", "level").eq("target_id", levelId).in("status", ["open", "reviewing"]);
  let hidden = !!row.held_at;
  if (!hidden && (count ?? 0) >= HIDE_AT_REPORTS) {
    await db.from(S).update({ held_at: new Date().toISOString() }).eq("id", levelId).is("held_at", null);
    hidden = true;
  }
  return { ok: true, hidden };
}

/** Staff on Platform ▸ Moderation: put a reported level back (dismiss) or take it down; every open report on it closes. */
export async function settleLevelReports(staffId: string, levelId: string, takeDown: boolean, note: string | null): Promise<void> {
  const db = createServiceClient();
  const now = new Date().toISOString();
  if (takeDown) await db.from(S).update({ removed_at: now, removed_by: staffId }).eq("id", levelId).is("removed_at", null);
  else await db.from(S).update({ held_at: null }).eq("id", levelId);
  await db.from("reports").update({
    status: takeDown ? "actioned" : "dismissed", staff_user_id: staffId, action_taken: takeDown ? "took the level down" : "dismissed", staff_notes: note, resolved_at: now,
  }).eq("target_type", "level").eq("target_id", levelId).in("status", ["open", "reviewing"]);
}

// ── Staff: GameShuffle picks and the level of the week ───────────────────────

/** Pin a level as a GameShuffle pick with a one-line note (staff; up to 6 per game), or take the pin off. */
export async function pinLevel(staffId: string, levelId: string, note: string | null): Promise<Act> {
  if (!(await curationReady())) return { ok: false, error: "not_ready" };
  if (!(await isStaff(staffId))) return { ok: false, error: "staff_only" };
  const row = await liveShare(levelId);
  if (!row) return { ok: false, error: "not_found" };
  const db = createServiceClient();
  if (note == null) {
    await db.from(S).update({ pick_note: null, picked_at: null, picked_by: null }).eq("id", levelId);
  } else {
    const clean = cleanPickNote(note);
    if (!clean.ok) return { ok: false, error: "bad_note", line: clean.line };
    if (!row.picked_at) {
      const { count } = await db.from(S).select("id", { count: "exact", head: true }).eq("game", row.game).not("picked_at", "is", null).is("removed_at", null);
      if ((count ?? 0) >= PICKS_MAX) return { ok: false, error: "picks_full", line: `There are already ${PICKS_MAX} picks for ${LEVEL_GAMES[row.game as LevelGame].name}. Take one off first.` };
    }
    await db.from(S).update({ pick_note: clean.note, picked_at: row.picked_at ?? new Date().toISOString(), picked_by: staffId }).eq("id", levelId);
  }
  const card = await levelCard(levelId, staffId);
  return card ? { ok: true, card } : { ok: false, error: "not_found" };
}

/**
 * The level of the week (staff, from the week's most liked; Pacific weeks). Its maker gets one notification, and the
 * level wears the week on its card.
 */
export async function pickWeek(staffId: string, levelId: string): Promise<Act> {
  if (!(await curationReady())) return { ok: false, error: "not_ready" };
  if (!(await isStaff(staffId))) return { ok: false, error: "staff_only" };
  const row = await liveShare(levelId);
  if (!row || row.held_at) return { ok: false, error: "not_found" };
  if (LEVEL_GAMES[row.game as LevelGame].kind !== "level") return { ok: false, error: "bad_request" };
  const db = createServiceClient();
  const week = weekOf(gsDay());
  const { data: had } = await db.from(W).select("level_id").eq("game", row.game).eq("week", week).maybeSingle();
  if ((had as { level_id: string } | null)?.level_id !== levelId) {
    await db.from(W).upsert({ game: row.game, week, level_id: levelId, picked_by: staffId, picked_at: new Date().toISOString(), notified_at: null }, { onConflict: "game,week" });
  }
  // Tell the maker once.
  const { data: claimed } = await db.from(W).update({ notified_at: new Date().toISOString() }).eq("game", row.game).eq("week", week).eq("level_id", levelId).is("notified_at", null).select("week");
  if (claimed?.length) {
    const g = LEVEL_GAMES[row.game as LevelGame];
    await createNotification({
      userId: row.user_id, type: "level_of_week",
      title: `${row.title} is the ${g.name} level of the week`,
      message: "GameShuffle picked it from the week's most liked. It's on the space's Now tab all week.",
      link: `/games/${g.space}`,
      data: { game: row.game, levelId },
    }).catch((err) => console.error("[levels] week notice failed:", err));
  }
  const card = await levelCard(levelId, staffId);
  return card ? { ok: true, card } : { ok: false, error: "not_found" };
}

// ── Lists ────────────────────────────────────────────────────────────────────

interface ListRow { id: string; user_id: string; game: string; title: string; public: boolean; featured_at: string | null; updated_at: string }

async function listViews(rows: ListRow[], viewerId: string | null): Promise<LevelListView[]> {
  if (!rows.length) return [];
  const db = createServiceClient();
  const [who, counts] = await Promise.all([
    names(rows.map((r) => r.user_id)),
    (async () => {
      const out = new Map<string, number>();
      for (const part of chunks(rows.map((r) => r.id))) {
        const { data } = await readAllPages<{ list_id: string }>((from, to) => db.from(LI).select("list_id").in("list_id", part).order("list_id").order("level_id").range(from, to));
        for (const r of data) out.set(r.list_id, (out.get(r.list_id) ?? 0) + 1);
      }
      return out;
    })(),
  ]);
  return rows.map((r) => ({
    id: r.id, game: r.game as LevelGame, title: r.title, public: r.public, featured: !!r.featured_at,
    by: who.get(r.user_id) ?? { name: "A player", username: null }, mine: r.user_id === viewerId,
    count: counts.get(r.id) ?? 0, updatedAt: r.updated_at,
  }));
}

/** The viewer's lists in a game, newest first. */
export async function myLists(userId: string, game: LevelGame): Promise<LevelListView[]> {
  const { data } = await createServiceClient().from(L).select("id, user_id, game, title, public, featured_at, updated_at")
    .eq("user_id", userId).eq("game", game).order("updated_at", { ascending: false }).limit(LISTS_PER_GAME);
  return listViews((data ?? []) as ListRow[], userId);
}

/** A game's lists: featured first, then public lists with something in them, plus the viewer's own. */
export async function boardLists(game: LevelGame, viewerId: string | null): Promise<LevelListView[]> {
  if (!(await curationReady())) return [];
  const db = createServiceClient();
  const [{ data: pub }, mine] = await Promise.all([
    db.from(L).select("id, user_id, game, title, public, featured_at, updated_at").eq("game", game).eq("public", true)
      .order("featured_at", { ascending: false, nullsFirst: false }).order("updated_at", { ascending: false }).limit(50),
    viewerId ? myLists(viewerId, game) : Promise.resolve([] as LevelListView[]),
  ]);
  const shown = (await listViews((pub ?? []) as ListRow[], viewerId)).filter((l) => l.count > 0 || l.mine);
  const merged = new Map<string, LevelListView>();
  for (const l of [...shown.filter((x) => x.featured), ...mine, ...shown]) if (!merged.has(l.id)) merged.set(l.id, l);
  return [...merged.values()];
}

async function listRow(listId: string): Promise<ListRow | null> {
  const { data } = await createServiceClient().from(L).select("id, user_id, game, title, public, featured_at, updated_at").eq("id", listId).maybeSingle();
  return (data as ListRow | null) ?? null;
}

/** A list and its levels in order (public, or the viewer's own). */
export async function listDetail(listId: string, viewerId: string | null): Promise<{ list: LevelListView; levels: LevelCardView[] } | null> {
  if (!(await curationReady())) return null;
  const row = await listRow(listId);
  if (!row || (!row.public && row.user_id !== viewerId)) return null;
  const db = createServiceClient();
  const { data: items } = await db.from(LI).select("level_id, position").eq("list_id", listId).order("position").order("added_at");
  const order = ((items ?? []) as { level_id: string }[]).map((i) => i.level_id);
  const staff = await isStaff(viewerId);
  const cards = await hydrate(await sharesById(order, false), viewerId, staff);
  const byId = new Map(cards.map((c) => [c.id, c.card]));
  const [view] = await listViews([row], viewerId);
  return { list: view, levels: order.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : [])) };
}

export type ListChange =
  | { action: "rename"; title: string } | { action: "public"; public: boolean }
  | { action: "add"; levelId: string } | { action: "remove"; levelId: string } | { action: "feature"; on: boolean };

/** Make a list (signed in; up to 20 per game). */
export async function createList(userId: string, game: LevelGame, title: unknown, isPublic: boolean): Promise<{ ok: true; list: LevelListView } | { ok: false; error: string; line?: string }> {
  if (!(await curationReady())) return { ok: false, error: "not_ready" };
  const t = cleanListTitle(title);
  if (!t.ok) return { ok: false, error: "bad_title", line: t.line };
  const db = createServiceClient();
  const { count } = await db.from(L).select("id", { count: "exact", head: true }).eq("user_id", userId).eq("game", game);
  if ((count ?? 0) >= LISTS_PER_GAME) return { ok: false, error: "too_many", line: `Up to ${LISTS_PER_GAME} lists for each game.` };
  const { data, error } = await db.from(L).insert({ user_id: userId, game, title: t.title, public: isPublic })
    .select("id, user_id, game, title, public, featured_at, updated_at").single();
  if (error) throw new Error(`list create failed: ${error.message}`);
  return { ok: true, list: (await listViews([data as ListRow], userId))[0] };
}

/** Change a list: its name, public or private, add or take out a level (the owner), or feature it (staff). */
export async function changeList(userId: string, listId: string, c: ListChange): Promise<{ ok: true } | { ok: false; error: string; line?: string }> {
  if (!(await curationReady())) return { ok: false, error: "not_ready" };
  const row = await listRow(listId);
  if (!row) return { ok: false, error: "not_found" };
  const db = createServiceClient();
  const now = new Date().toISOString();
  if (c.action === "feature") {
    if (!(await isStaff(userId))) return { ok: false, error: "staff_only" };
    if (c.on && !row.public) return { ok: false, error: "private", line: "Only a public list can be featured." };
    await db.from(L).update({ featured_at: c.on ? now : null, featured_by: c.on ? userId : null }).eq("id", listId);
    return { ok: true };
  }
  if (row.user_id !== userId) return { ok: false, error: "not_yours" };
  if (c.action === "rename") {
    const t = cleanListTitle(c.title);
    if (!t.ok) return { ok: false, error: "bad_title", line: t.line };
    await db.from(L).update({ title: t.title, updated_at: now }).eq("id", listId);
  } else if (c.action === "public") {
    await db.from(L).update({ public: c.public, updated_at: now, ...(c.public ? {} : { featured_at: null, featured_by: null }) }).eq("id", listId);
  } else if (c.action === "add") {
    const lvl = await liveShare(c.levelId);
    if (!lvl || lvl.held_at) return { ok: false, error: "not_found" };
    if (lvl.game !== row.game) return { ok: false, error: "wrong_game", line: "A list keeps to one game." };
    const { data: items } = await db.from(LI).select("level_id, position").eq("list_id", listId);
    const list = (items ?? []) as { level_id: string; position: number }[];
    if (list.some((i) => i.level_id === c.levelId)) return { ok: true };
    if (list.length >= LIST_MAX) return { ok: false, error: "full", line: `A list holds up to ${LIST_MAX} levels.` };
    await db.from(LI).insert({ list_id: listId, level_id: c.levelId, position: Math.max(0, ...list.map((i) => i.position)) + 1 });
    await db.from(L).update({ updated_at: now }).eq("id", listId);
  } else if (c.action === "remove") {
    await db.from(LI).delete().eq("list_id", listId).eq("level_id", c.levelId);
    await db.from(L).update({ updated_at: now }).eq("id", listId);
  }
  return { ok: true };
}

/** Delete a list (its owner, or staff). */
export async function deleteList(userId: string, listId: string): Promise<boolean> {
  const row = await listRow(listId);
  if (!row || (row.user_id !== userId && !(await isStaff(userId)))) return false;
  await createServiceClient().from(L).delete().eq("id", listId);
  return true;
}

// ── Into the streamer's queue ────────────────────────────────────────────────

/** "Add to my queue" on a board level (GS Pro streamers). */
export async function queueLevel(owner: string, levelId: string): Promise<BoardAddResult | { error: string }> {
  if (!(await curationReady())) return { error: "not_ready" };
  const row = await liveShare(levelId);
  if (!row || row.held_at || !isQueueGame(row.game)) return { error: "not_found" };
  const who = await names([row.user_id]);
  return addFromBoard(owner, [{ game: row.game, code: row.code, sharer: { id: row.user_id, name: who.get(row.user_id)?.name ?? "A player" } }]);
}

/** A whole list for a level night: its levels in order, each through the queue's rules. */
export async function queueList(owner: string, listId: string): Promise<BoardAddResult | { error: string }> {
  const detail = await listDetail(listId, owner);
  if (!detail) return { error: "not_found" };
  const rows = await sharesById(detail.levels.map((l) => l.id), false);
  const byId = new Map(rows.map((r) => [r.id, r]));
  const who = await names(rows.map((r) => r.user_id));
  const items = detail.levels.flatMap((l) => {
    const r = byId.get(l.id);
    return r && isQueueGame(r.game) ? [{ game: r.game, code: r.code, sharer: { id: r.user_id, name: who.get(r.user_id)?.name ?? "A player" } }] : [];
  });
  if (!items.length) return { error: "empty" };
  return addFromBoard(owner, items);
}

// ── Following makers ─────────────────────────────────────────────────────────

/** Share notices a day per player, so a burst of shares doesn't flood their followers. */
const FOLLOW_NOTICES_PER_DAY = 3;

/** Tells a player's followers they shared a level (curation picks 8A), up to three shares a Pacific day. */
export async function notifyFollowers(userId: string, level: { id: string; game: LevelGame; title: string }): Promise<number> {
  if (!(await curationReady())) return 0;
  const db = createServiceClient();
  const { count } = await db.from(S).select("id", { count: "exact", head: true }).eq("user_id", userId).gte("created_at", gsDayStart(gsDay()).toISOString());
  if ((count ?? 0) > FOLLOW_NOTICES_PER_DAY) return 0;
  const { data } = await readAllPages<{ follower_user_id: string }>((from, to) => db.from("follows").select("follower_user_id")
    .eq("followee_user_id", userId).order("follower_user_id").range(from, to), 5_000);
  const g = LEVEL_GAMES[level.game];
  let sent = 0;
  for (const f of data) {
    await createNotification({
      userId: f.follower_user_id, type: "level_shared_followed", actorUserId: userId,
      title: `shared a ${g.name} ${itemWord(level.game)}`,
      message: level.title,
      link: `/games/${g.space}?tab=${g.kind === "seed" ? "seeds" : "levels"}`,
      data: { game: level.game, levelId: level.id },
    }).then(() => { sent++; }, (err) => console.error("[levels] follower notice failed:", err));
  }
  return sent;
}

// ── Mario Maker 2 maker IDs ──────────────────────────────────────────────────

/** A player's maker ID (or null), and whether the curation tables are there. */
export async function makerIdOf(userId: string): Promise<{ ready: boolean; makerId: string | null }> {
  if (!(await curationReady())) return { ready: false, makerId: null };
  const { data } = await createServiceClient().from("level_makers").select("smm2_maker_id").eq("user_id", userId).maybeSingle();
  return { ready: true, makerId: (data as { smm2_maker_id: string | null } | null)?.smm2_maker_id ?? null };
}

/** Save (or clear) a Mario Maker 2 maker ID, checked with the code's own check bits: it has to be a maker ID. */
export async function setMakerId(userId: string, input: string | null): Promise<{ ok: true; makerId: string | null } | { ok: false; line: string }> {
  if (!(await curationReady())) return { ok: false, line: "Maker IDs aren't open yet." };
  let makerId: string | null = null;
  if (input && input.trim()) {
    const nine = readSmm2(input);
    const d = nine ? decodeSmm2(nine) : null;
    if (!nine || !d) return { ok: false, line: "That doesn't look like a maker ID. It's 9 letters and numbers: XXX-XXX-XXX." };
    if (!d.valid) return { ok: false, line: "That maker ID has a typo somewhere. Check it on your profile in the game." };
    if (d.kind !== "maker") return { ok: false, line: "That's a course ID. Your maker ID is on your profile in the game." };
    makerId = formatSmm2(nine);
  }
  const { error } = await createServiceClient().from("level_makers").upsert({ user_id: userId, smm2_maker_id: makerId, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  if (error) throw new Error(`maker id save failed: ${error.message}`);
  return { ok: true, makerId };
}

// ── The maker's profile section ──────────────────────────────────────────────

export interface MakerSummary { levels: LevelCardView[]; total: number; likes: number; clears: number; makerId: string | null }

/** A player's levels for their profile (curation picks 8A): the newest six, and their likes and clears in all. */
export async function makerSummary(userId: string, viewerId: string | null): Promise<MakerSummary | null> {
  if (!(await curationReady())) return null;
  const db = createServiceClient();
  const { data } = await db.from(S).select(SHARE_COLS).eq("user_id", userId).is("removed_at", null).is("held_at", null).order("created_at", { ascending: false }).limit(200);
  const rows = (data ?? []) as ShareRow[];
  if (!rows.length) return null;
  const [cards, maker] = await Promise.all([hydrate(rows, viewerId, false), makerIdOf(userId)]);
  return {
    levels: cards.slice(0, 6).map((c) => c.card),
    total: rows.length,
    likes: cards.reduce((n, c) => n + c.stats.likes, 0),
    clears: cards.reduce((n, c) => n + c.stats.cleared, 0),
    makerId: maker.makerId,
  };
}

// ── A space's board, for its page ────────────────────────────────────────────

export interface SpaceBoard {
  levels: LevelCardView[];
  more: boolean;
  sort: BoardSort;
  extras: BoardExtras | null;
  /** The newest few, for the Now tab. */
  newest: LevelCardView[];
}

/**
 * What a space's page needs for its board: with the curation tables, Top this week first (Newest when nobody liked
 * anything this week), the picks, the level of the week and the viewer; before them, the first board's newest. Null
 * when the board can't show yet (Geometry Dash and Minecraft need the curation tables).
 */
export async function spaceBoard(game: LevelGame, viewerId: string | null): Promise<SpaceBoard | null> {
  if (await curationReady()) {
    const [top, newest, extras] = await Promise.all([
      boardLevels({ game, sort: "top", viewerId }),
      boardLevels({ game, sort: "newest", viewerId }),
      boardExtras(game, viewerId),
    ]);
    const lead = top && top.levels.length ? { ...top, sort: "top" as const } : { ...(newest ?? { levels: [], more: false }), sort: "newest" as const };
    return { levels: lead.levels, more: lead.more, sort: lead.sort, extras, newest: (newest?.levels ?? []).slice(0, 5) };
  }
  if (CURATION_GAMES.includes(game)) return null;
  const legacy = await listLevels({ game, sort: "newest", viewerId });
  return legacy ? { levels: legacy.levels, more: legacy.more, sort: "newest", extras: null, newest: legacy.levels.slice(0, 3) } : null;
}
