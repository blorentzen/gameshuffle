import "server-only";

/**
 * The time trial piece on the overlay, on the server: which time trial tournament the streamer is in now
 * (`ttPieceFor`, read by the overlay's 2-second poll and cached 30 seconds), and the small view the piece polls
 * (`ttOverlayData`). A tournament the streamer plays in wins over one they only run, since their own spot is what
 * their viewers follow. Covers time trial events, and Swiss and brackets decided by time trial.
 */

import { createServiceClient } from "@/lib/supabase/admin";
import { formatTime, ordinal } from "@/lib/timeTrials/rules";
import { ttTrack } from "@/lib/timeTrials/tracks";
import { buildView as swissView, loadSwiss } from "../swissStore";
import { isTtBracket } from "./bracketTt";
import { bracketTtView, loadBracketTt } from "./bracketStore";
import { isTtState, type TtViewGroup } from "./event";
import { isTtSwiss } from "./swissTt";
import { buildView, loadTt } from "./store";
import type { TtOverlayData, TtOverlayRow } from "./overlay";

const svc = () => createServiceClient();
const SEATED = ["confirmed", "checked_in"];
const FORMATS = ["time_trial", "single_elim", "double_elim", "swiss"];
/** A finished time trial event stays up this long, so the stream sees the winner. */
const FINISHED_MS = 20 * 60_000;
const ROWS = 5;

export interface TtPiece { id: string; participantId: string | null }

interface Row { id: string; format: string; status: string; settings: Record<string, unknown> | null; tt: unknown; date_time: string | null }

const isTtTournament = (t: Pick<Row, "format" | "settings">) =>
  t.format === "time_trial" || isTtBracket(t) || (t.format === "swiss" && isTtSwiss(t.settings));

/** Running, or a time trial event that finished in the last 20 minutes. */
function live(t: Row): boolean {
  if (t.status === "in_progress") return true;
  if (t.status !== "complete" || t.format !== "time_trial" || !isTtState(t.tt) || !t.tt.finishedAt) return false;
  return Date.now() - Date.parse(t.tt.finishedAt) < FINISHED_MS;
}

const cache = new Map<string, { at: number; value: TtPiece | null }>();

export async function ttPieceFor(userId: string): Promise<TtPiece | null> {
  const hit = cache.get(userId);
  if (hit && Date.now() - hit.at < 30_000) return hit.value;
  let value: TtPiece | null = null;
  try {
    const db = svc();
    const cols = "id, format, status, settings, tt, date_time";
    const [mine, runs, coRuns] = await Promise.all([
      db.from("tournament_participants").select("id, tournament_id").eq("user_id", userId).in("status", SEATED).limit(200),
      db.from("tournaments").select(cols).eq("organizer_id", userId).in("format", FORMATS).in("status", ["in_progress", "complete"]).order("date_time", { ascending: false }).limit(20),
      db.from("tournament_organizers").select("tournament_id").eq("user_id", userId).limit(100),
    ]);
    const seats = (mine.data ?? []) as { id: string; tournament_id: string }[];
    const ids = [...new Set([...seats.map((s) => s.tournament_id), ...((coRuns.data ?? []) as { tournament_id: string }[]).map((r) => r.tournament_id)])];
    const { data: more } = ids.length
      ? await db.from("tournaments").select(cols).in("id", ids).in("format", FORMATS).in("status", ["in_progress", "complete"])
      : { data: [] };
    const all = new Map<string, Row>();
    for (const t of [...((runs.data ?? []) as Row[]), ...((more ?? []) as Row[])]) if (isTtTournament(t) && live(t)) all.set(t.id, t);
    const newest = (list: Row[]) => list.sort((a, b) => (b.date_time ?? "").localeCompare(a.date_time ?? ""))[0] ?? null;
    const playing = newest([...all.values()].filter((t) => seats.some((s) => s.tournament_id === t.id)));
    const pick = playing ?? newest([...all.values()]);
    if (pick) value = { id: pick.id, participantId: seats.find((s) => s.tournament_id === pick.id)?.id ?? null };
  } catch (e) {
    console.error("[tt] overlay piece read:", e);
  }
  cache.set(userId, { at: Date.now(), value });
  if (cache.size > 2000) cache.delete(cache.keys().next().value as string);
  return value;
}

const trackText = (game: Parameters<typeof ttTrack>[0], ids: string[]) => ids.map((t) => ttTrack(game, t)?.name ?? t).join(", ");

/** The top rows, with the streamer's own row in place of the last one when they're further down. */
function topWithYou<T extends { you: boolean }>(rows: T[], n = ROWS): T[] {
  const top = rows.slice(0, n);
  if (top.some((r) => r.you)) return top;
  const me = rows.find((r) => r.you);
  return me ? [...rows.slice(0, n - 1), me] : top;
}

/** The view the piece polls. Null when the tournament isn't a running time trial (or is a draft). */
export async function ttOverlayData(id: string, participantId: string | null): Promise<TtOverlayData | null> {
  const { data } = await svc().from("tournaments").select("id, title, format, status, settings, tt, date_time").eq("id", id).maybeSingle();
  const t = data as (Row & { title: string }) | null;
  if (!t || !isTtTournament(t) || !live(t)) return null;
  const base = { title: t.title, path: `/tournament/${id}`, now: Date.now() };

  // ── A time trial event ──
  if (t.format === "time_trial") {
    const ctx = await loadTt(id);
    if (!ctx || ctx === "missing") return null;
    const me = participantId ? ctx.people.find((p) => p.id === participantId) ?? null : null;
    const view = await buildView(ctx, { userId: me?.user_id ?? null, canManage: false, canCheck: false });
    if (view.phase === "setup") return null;
    if (view.final) {
      const rows: TtOverlayRow[] = view.final.map((f) => ({ key: f.participantId, place: String(f.place), name: f.name, value: f.place === 1 ? "Winner" : "", you: f.participantId === participantId }));
      return { ...base, head: "Final results", closesAt: null, rows: topWithYou(rows), line: null };
    }
    const cur = view.rounds.at(-1);
    if (!cur) return null;
    const game = view.settings.game;
    const one = cur.tracks.length === 1 ? cur.tracks[0] : null;
    const group: TtViewGroup | null = cur.n === 0 ? cur.groups[0] ?? null
      : view.you?.group != null ? cur.groups[view.you.group] ?? null
      : cur.groups.length === 1 ? cur.groups[0] : null;
    const head = cur.n === 0
      ? (one ? ttTrack(game, one)?.name ?? one : `${cur.tracks.length} tracks`)
      : cur.final ? `Final${one ? ` · ${ttTrack(game, one)?.name ?? one}` : ""}` : `${cur.label}${group ? ` · Group ${group.label}` : ""}`;
    const closesAt = view.phase === "open" && !view.venue ? (group?.closesAt ?? cur.closesAt) : null;
    if (!group) {
      // Running many groups, and the streamer isn't in one: the latest times.
      const rows = view.latest.slice(0, ROWS).map((x, i) => ({ key: `${x.at}-${i}`, place: x.place ? ordinal(x.place) : "", name: x.name, value: formatTime(x.ms), you: false }));
      return { ...base, head: `${cur.label} · latest times`, closesAt, rows, line: `${cur.groups.length} groups racing` };
    }
    const scoring = view.settings.scoring;
    const all: TtOverlayRow[] = group.rows.map((r, i) => ({
      key: r.participantId,
      place: r.done ? `${r.tied ? "=" : ""}${r.place}` : "–",
      name: r.name,
      value: one ? (r.times[one] != null ? formatTime(r.times[one] as number) : "No time")
        : scoring === "points" ? `${r.points} pts` : r.total != null ? formatTime(r.total) : `${r.done} of ${cur.tracks.length}`,
      you: r.participantId === participantId,
      cut: group.cutAfter != null && i === group.cutAfter - 1 && i < group.rows.length - 1,
    }));
    const rows = topWithYou(all);
    const line = view.phase === "closed" ? "Closed. The results are being checked."
      : group.cutAfter ? (group.cutAfter === 1 ? "The fastest moves on" : `Top ${group.cutAfter} move on`)
      : view.venue ? "Racing at the venue"
      : one ? "Add a time with /tt add in Discord" : `${trackText(game, cur.tracks)}${scoring === "total" ? ", total time" : ", points by place"}`;
    return { ...base, head, closesAt, rows, line };
  }

  // ── A bracket decided by time trial ──
  if (isTtBracket(t)) {
    const ctx = await loadBracketTt(id);
    if (!ctx || ctx === "missing" || !ctx.bracket) return null;
    const me = participantId ? ctx.people.find((p) => p.id === participantId) ?? null : null;
    const view = bracketTtView(ctx, { userId: me?.user_id ?? null, canManage: false });
    if (view.champion) return { ...base, head: "Champion", closesAt: null, rows: [{ key: "champ", place: "1", name: view.champion, value: "Winner", you: false }], line: null };
    const m = view.you?.match ?? null;
    if (m) {
      const one = m.tracks.length === 1;
      const side = (x: { id: string; name: string; won: number }, mine: boolean): TtOverlayRow => {
        const ms = one ? (x.id === m.a.id ? m.tracks[0].a : m.tracks[0].b) : null;
        return { key: x.id, place: "", name: x.name, value: one ? (ms != null ? formatTime(ms) : "No time") : `${x.won} won`, you: mine };
      };
      const mine = m.side === "a" ? m.a : m.b, theirs = m.side === "a" ? m.b : m.a;
      return {
        ...base, head: `${m.label} · best of ${view.bestOf}`, closesAt: null, rows: [side(mine, true), side(theirs, false)],
        line: m.held ? "Decided. It counts once the clips are checked." : trackText(view.settings.game, m.tracks.map((x) => x.id)),
      };
    }
    const rows = view.open.slice(0, ROWS).map((x) => ({ key: x.id, place: "", name: `${x.a.name} vs ${x.b.name}`, value: `${x.a.won} to ${x.b.won}`, you: false }));
    return { ...base, head: view.open.length ? `${view.open.length} match${view.open.length === 1 ? "" : "es"} in play` : "Waiting on the next match", closesAt: null, rows, line: null };
  }

  // ── Swiss decided by time trial ──
  const ctx = await loadSwiss(id);
  if (!ctx || ctx === "missing" || !ctx.tt) return null;
  const me = participantId ? ctx.people.find((p) => p.id === participantId) ?? null : null;
  const view = swissView(ctx, { userId: me?.user_id ?? null, canManage: false });
  if (!view || view.phase === "setup") return null;
  const closesAt = view.clock?.endsAt ?? null;
  const m = view.you?.match ?? null;
  if (m?.tt && m.opponent && !m.result) {
    const one = m.tt.tracks.length === 1;
    const mineMs = one ? m.tt.tracks[0].mine : null, theirMs = one ? m.tt.tracks[0].theirs : null;
    const rows: TtOverlayRow[] = [
      { key: "me", place: "", name: me?.display_name || "You", value: one ? (mineMs != null ? formatTime(mineMs) : "No time") : `${m.tt.won} won`, you: true },
      { key: m.opponent.id, place: "", name: m.opponent.name, value: one ? (theirMs != null ? formatTime(theirMs) : "No time") : `${m.tt.lost} won`, you: false },
    ];
    return { ...base, head: m.label, closesAt, rows, line: m.tt.held ? "Decided. It counts once the clips are checked." : trackText(ctx.tt.game, m.tt.tracks.map((x) => x.id)) };
  }
  const rows = topWithYou(view.standings.map((r) => ({ key: r.id, place: String(r.rank), name: r.name, value: r.record, you: r.id === participantId })));
  const head = view.phase === "done" ? "Final standings" : view.phase === "cut" ? `Top ${view.topCut}` : view.round ? `Round ${view.round.n} of ${view.rounds}` : "Standings";
  return { ...base, head, closesAt, rows, line: null };
}

