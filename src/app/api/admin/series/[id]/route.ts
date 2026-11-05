/**
 * Staff: one team series.
 *   GET                       → everything the organizer screen needs (raw rows, the page's view, POV and GS Pro state)
 *   POST { action, ... }      → a change (see ACTIONS below); answers { ok } or { error } in plain words
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { requireStaff } from "@/lib/shop/adminGuard";
import { forgetView, loadSeries, seriesView, type Loaded } from "@/lib/series/store";
import { readSettings, seriesPath } from "@/lib/series/view";
import * as A from "@/lib/series/admin";
import * as D from "@/lib/series/draftStore";
import { DRAFT_ERRORS } from "@/lib/series/draft";
import { cancelPredictions, lockPredictions, openPredictions, reopenPredictions } from "@/lib/series/predictions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireStaff(await createClient());
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const { id } = await params;
  const l = await loadSeries({ id });
  if (!l) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const [view, gifts, tRes] = await Promise.all([
    seriesView(l.series.slug, { staff: true, fresh: true }),
    A.playerAdmin(l),
    l.nights.some((n) => n.tournament_id)
      ? createServiceClient().from("tournaments").select("id, title, status").in("id", l.nights.flatMap((n) => (n.tournament_id ? [n.tournament_id] : [])))
      : Promise.resolve({ data: [] }),
  ]);
  const tours = (tRes.data ?? []) as { id: string; title: string; status: string }[];
  return NextResponse.json({
    series: { id: l.series.id, slug: l.series.slug, title: l.series.title, tagline: l.series.tagline, status: l.series.status, championTeamId: l.series.champion_team_id, crownedAt: l.series.crowned_at, settings: readSettings(l.series.settings), path: seriesPath(l.series.slug) },
    teams: l.teams,
    players: l.players.map((p) => ({ ...p, giftUntil: gifts.find((g) => g.id === p.id)?.giftUntil ?? null })),
    nights: l.nights.map((n) => ({ ...n, tournament: tours.find((t) => t.id === n.tournament_id) ?? null })),
    view,
  }, { headers: { "Cache-Control": "private, no-store" } });
}

type Body = Record<string, unknown>;
const s = (v: unknown) => (typeof v === "string" ? v : "");
const sn = (v: unknown) => (typeof v === "string" && v ? v : null);

function draftMsg(e: string): string {
  return (DRAFT_ERRORS as Record<string, string>)[e] ?? (D.DRAFT_ACTION_ERRORS as Record<string, string>)[e] ?? "Couldn't change the draft.";
}

async function run(l: Loaded, by: string, b: Body): Promise<{ ok: true; [k: string]: unknown } | { ok: false; error: string }> {
  const nightId = s(b.nightId);
  const wrapDraft = async (p: Promise<{ ok: true } | { ok: false; error: string }>) => {
    const r = await p;
    return r.ok ? { ok: true as const } : { ok: false as const, error: draftMsg(r.error) };
  };
  switch (b.action) {
    case "update": return A.updateSeries(l, {
      title: typeof b.title === "string" ? b.title : undefined,
      tagline: b.tagline === null ? null : typeof b.tagline === "string" ? b.tagline : undefined,
      status: typeof b.status === "string" ? (b.status as "draft") : undefined,
      slug: typeof b.slug === "string" ? b.slug : undefined,
      settings: b.settings && typeof b.settings === "object" ? (b.settings as Record<string, unknown>) : undefined,
    });
    case "team.save": return A.saveTeam(l, { id: sn(b.id) ?? undefined, name: s(b.name), tag: s(b.tag), color: sn(b.color) ?? undefined, look: sn(b.look) });
    case "team.remove": return A.removeTeam(l, s(b.teamId));
    case "player.save": return A.savePlayer(l, {
      id: sn(b.id) ?? undefined, teamId: s(b.teamId), role: b.role === "creator" ? "creator" : "competitive",
      handle: sn(b.handle) ?? undefined, name: sn(b.name) ?? undefined, hours: b.hours === null || b.hours === "" || b.hours === undefined ? null : Number(b.hours),
    });
    case "player.remove": return A.removePlayer(l, s(b.playerId));
    case "night.save": return A.saveNight(l, {
      id: sn(b.id) ?? undefined, label: typeof b.label === "string" ? b.label : undefined,
      startsAt: b.startsAt === null ? null : typeof b.startsAt === "string" ? b.startsAt : undefined,
      counts: typeof b.counts === "boolean" ? b.counts : undefined,
      hostTeamId: b.hostTeamId === null ? null : typeof b.hostTeamId === "string" ? b.hostTeamId : undefined,
      tournamentId: b.tournamentId === null ? null : typeof b.tournamentId === "string" ? b.tournamentId : undefined,
    });
    case "night.remove": return A.removeNight(l, nightId);
    case "night.tournament": return A.createNightTournament(l, nightId, by);
    case "night.sync": return A.syncNightPlayers(l, nightId);
    case "draft.setup": return wrapDraft(D.setupDraft(l, nightId));
    case "draft.order": return wrapDraft(D.setOrder(l, nightId, Array.isArray(b.order) ? b.order.filter((x): x is string => typeof x === "string") : []));
    case "draft.roll": return wrapDraft(D.rollOrder(l, nightId));
    case "draft.fromNight": return wrapDraft(D.orderFromNight(l, nightId, s(b.fromNightId)));
    case "draft.start": return wrapDraft(D.startNightDraft(l, nightId));
    case "draft.pause": return wrapDraft(D.pauseNightDraft(nightId));
    case "draft.resume": return wrapDraft(D.resumeNightDraft(nightId));
    case "draft.undo": return wrapDraft(D.undoNightDraft(nightId));
    case "draft.reset": return wrapDraft(D.resetNightDraft(nightId));
    case "predictions.open": {
      if (!l.nights.some((n) => n.id === nightId)) return { ok: false, error: "That night isn't in this series." };
      const lines: Record<string, number> = {};
      if (b.lines && typeof b.lines === "object") for (const [k, v] of Object.entries(b.lines as Record<string, unknown>)) { const n = Number(v); if (Number.isFinite(n) && n >= 0) lines[k] = Math.round(n * 2) / 2; }
      return { ok: true, made: await openPredictions(l, nightId, lines) };
    }
    case "predictions.lock": return { ok: true, changed: await lockPredictions(nightId) };
    case "predictions.reopen": return { ok: true, changed: await reopenPredictions(nightId) };
    case "predictions.cancel": return { ok: true, changed: await cancelPredictions(nightId) };
    case "crown": return A.crown(l, sn(b.teamId));
    case "play.add": return A.addPlay(l, { title: s(b.title), url: s(b.url), playerId: sn(b.playerId), nightId: sn(b.nightId) });
    case "play.remove": return A.removePlay(l, s(b.playId));
    case "pov.set": return A.setPov(l, s(b.playerId), b.pov === "sent" || b.pov === "checked" ? b.pov : "none", typeof b.note === "string" ? b.note : undefined);
    case "pov.remind": return A.remindPov(l);
    case "gift": {
      const until = new Date(s(b.until));
      return A.giftPro(l, by, until, b.who === "champions" ? "champions" : "players");
    }
    case "gift.end": return { ok: true, ended: await A.endGiftedPro(l, b.who === "champions" ? "champions" : "players") };
    default: return { ok: false, error: "Unknown action." };
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireStaff(await createClient());
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const { id } = await params;
  const l = await loadSeries({ id });
  if (!l) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body || typeof body.action !== "string") return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  const r = await run(l, guard.userId, body);
  forgetView(l.series.slug);
  return r.ok ? NextResponse.json(r) : NextResponse.json(r, { status: 400 });
}
