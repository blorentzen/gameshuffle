/**
 * GET /api/series/[slug]/overlay → the small view the GameShuffle overlay's series piece polls: the night
 * that matters now, its standings (or, during a draft, who's on the clock) and the page's address.
 */

import { NextResponse } from "next/server";
import { seriesView } from "@/lib/series/store";
import { currentNight, seriesPath, type SeriesOverlayData } from "@/lib/series/view";
import { openTracks, readDraft } from "@/lib/series/draft";
import { trackName } from "@/lib/series/tracks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const view = await seriesView(slug);
  if (!view || (view.status !== "live" && view.status !== "announced" && view.status !== "finished")) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const night = currentNight(view);
  const rows = night?.teams.length ? night.teams : view.teams.map((t) => ({ teamId: t.id, n: t.n, points: 0, place: 1, last: 0 }));
  const teams = rows.flatMap((r) => {
    const t = view.teams.find((x) => x.id === r.teamId);
    return t ? [{ id: t.id, tag: t.tag, name: t.name, color: t.color, ink: t.ink, points: r.points, place: r.place, last: night?.state === "live" ? r.last : 0 }] : [];
  });
  let draft: SeriesOverlayData["draft"] = null;
  const d = night?.draft;
  if (d && (d.status === "running" || d.status === "paused" || (d.status === "done" && night?.state === "upcoming"))) {
    const last = d.turns[d.turns.length - 1];
    const lastTeam = last ? view.teams.find((t) => t.id === last.team) : null;
    const state = readDraft({ bank: d.bank, turns: d.turns, target: d.target });
    draft = {
      status: d.status, onClock: d.onClock, deadline: d.deadline, pausedLeft: d.pausedLeft, turn: d.turns.length + (d.onClock ? 1 : 0), total: d.turnTeams.length,
      last: last && lastTeam ? `${lastTeam.name} banned ${trackName(last.ban)}${last.protect ? ` and protected ${trackName(last.protect)}` : ""}${last.auto ? " (time ran out)" : ""}.` : null,
      open: state ? openTracks(state).length : 0, pool: d.bank.length - d.turns.length,
    };
  }
  const data: SeriesOverlayData = {
    title: view.title, path: seriesPath(view.slug),
    night: night ? { label: night.label, state: night.state, racesDone: night.racesDone, racesTotal: night.racesTotal, startsAt: night.startsAt } : null,
    teams, draft, champion: view.awards.champion, now: Date.now(),
  };
  return NextResponse.json(data, { headers: { "Cache-Control": "public, s-maxage=2, stale-while-revalidate=4" } });
}
