/**
 * POST /api/board-game-nights → create a board-game night. Auth-gated (the
 * store sets host_id from the session + RLS enforces ownership).
 */
import { NextResponse, type NextRequest } from "next/server";
import { createNight } from "@/lib/board-game-nights/store";
import type { NightGame } from "@/lib/board-game-nights/types";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  if (!title) {
    return NextResponse.json({ error: "Give your night a title." }, { status: 400 });
  }

  const res = await createNight({
    title,
    description: typeof body?.description === "string" ? body.description : null,
    place: typeof body?.place === "string" ? body.place : null,
    starts_at: typeof body?.starts_at === "string" ? body.starts_at : null,
    timezone: typeof body?.timezone === "string" ? body.timezone : null,
    capacity: typeof body?.capacity === "number" ? body.capacity : null,
    visibility: body?.visibility === "unlisted" ? "unlisted" : "public",
    genres: Array.isArray(body?.genres) ? (body.genres as string[]) : null,
    level: typeof body?.level === "string" ? body.level : null,
    games: Array.isArray(body?.games) ? (body.games as NightGame[]) : [],
    status: body?.status === "draft" ? "draft" : "scheduled",
  });

  if ("error" in res) {
    return NextResponse.json({ error: res.error }, { status: 400 });
  }
  return NextResponse.json({ id: res.id });
}
