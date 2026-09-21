/**
 * POST /api/game-nights → create a game night. Auth-gated (the
 * store sets host_id from the session + RLS enforces ownership).
 *
 * If `repeat` is a recurring cadence AND a date is set, this also creates a
 * recurring SERIES from the same settings and links the night to it as the
 * first instance. The cron sweep rolls the series forward from there.
 */
import { NextResponse, type NextRequest } from "next/server";
import { createNight } from "@/lib/game-nights/store";
import { createSeries } from "@/lib/game-nights/series";
import { CADENCES, type Cadence } from "@/lib/game-nights/seriesSchedule";
import type { NightGame, NightKind } from "@/lib/game-nights/types";

export const runtime = "nodejs";

const CADENCE_VALUES = new Set(CADENCES.map((c) => c.value));

const NIGHT_KIND_VALUES = new Set(["board", "video", "tcg", "mixed"]);

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  if (!title) {
    return NextResponse.json({ error: "Give your night a title." }, { status: 400 });
  }

  const startsAt = typeof body?.starts_at === "string" ? body.starts_at : null;
  const timezone = typeof body?.timezone === "string" ? body.timezone : null;
  const settings = {
    description: typeof body?.description === "string" ? body.description : null,
    place: typeof body?.place === "string" ? body.place : null,
    lat: typeof body?.lat === "number" ? body.lat : null,
    lng: typeof body?.lng === "number" ? body.lng : null,
    capacity: typeof body?.capacity === "number" ? body.capacity : null,
    visibility: (body?.visibility === "unlisted" ? "unlisted" : "public") as "public" | "unlisted",
    genres: Array.isArray(body?.genres) ? (body.genres as string[]) : null,
    level: typeof body?.level === "string" ? body.level : null,
    kind: typeof body?.kind === "string" && NIGHT_KIND_VALUES.has(body.kind) ? (body.kind as NightKind) : null,
    games: Array.isArray(body?.games) ? (body.games as NightGame[]) : [],
  };

  // Recurring? Spin up a series first so we can link the night to it.
  const repeat = typeof body?.repeat === "string" ? body.repeat : "none";
  let seriesId: string | null = null;
  if (repeat !== "none" && CADENCE_VALUES.has(repeat as Cadence) && startsAt) {
    const s = await createSeries({
      name: title,
      cadence: repeat as Cadence,
      anchor_at: startsAt,
      timezone,
      data: { title, ...settings },
    });
    if ("id" in s) seriesId = s.id;
  }

  const res = await createNight({
    title,
    ...settings,
    starts_at: startsAt,
    timezone,
    status: body?.status === "draft" ? "draft" : "scheduled",
    series_id: seriesId,
  });

  if ("error" in res) {
    return NextResponse.json({ error: res.error }, { status: 400 });
  }
  return NextResponse.json({ id: res.id, seriesId });
}
