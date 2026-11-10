/**
 * A server's war settings on the Teams page (overrides picks 2026-11-09): how its typed races read, and its own
 * names for tracks. Same access as /api/war/teams.
 *   PATCH  { guild, readsLike }                          → { readsLike }
 *   POST   { guild, nick, track, game }                  adds or changes a nickname → { nicks }
 *          refused: bad_nick, is_code (already a track code), no_track (no track has that code)
 *   DELETE ?guild=<id>&nick=<nickname>                    → { nicks }
 */

import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/ratelimit";
import { cardsReady, removeTrackName, setReadsLike, setTrackName } from "@/lib/wars/cardStore";
import { isReadsLike } from "@/lib/wars/legacy";
import { teamsAccess, trackNickViews } from "@/lib/wars/teamAdmin";
import type { WarGame } from "@/lib/wars/rules";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

type Body = { guild?: string; readsLike?: string; nick?: string; track?: string; game?: string };

async function open(guild: string | null | undefined) {
  const a = await teamsAccess(guild);
  if (!a.ok) return { error: fail(a.error, a.status) };
  if (!(await cardsReady())) return { error: fail("not_ready", 503) };
  if (!(await rateLimit(`war-teams:${a.m.userId}`, { max: 120, windowMs: 10 * 60_000 })).ok) return { error: fail("slow_down", 429) };
  return { a };
}

export async function PATCH(req: Request) {
  const body = (await req.json().catch(() => null)) as Body | null;
  const o = await open(body?.guild);
  if ("error" in o) return o.error;
  if (!isReadsLike(body?.readsLike)) return fail("bad_request", 400);
  if (!(await setReadsLike(o.a.guild, body.readsLike, o.a.by.id))) return fail("failed", 500);
  return NextResponse.json({ readsLike: body.readsLike });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Body | null;
  const o = await open(body?.guild);
  if ("error" in o) return o.error;
  const game: WarGame = body?.game === "mkworld" ? "mkworld" : "mk8dx";
  const res = await setTrackName(o.a.guild, game, String(body?.nick ?? ""), String(body?.track ?? "").trim(), o.a.by.id);
  if (res !== "ok") return fail(res, res === "not_ready" ? 503 : 400);
  return NextResponse.json({ nicks: await trackNickViews(o.a.guild) });
}

export async function DELETE(req: Request) {
  const url = new URL(req.url);
  const o = await open(url.searchParams.get("guild"));
  if ("error" in o) return o.error;
  await removeTrackName(o.a.guild, String(url.searchParams.get("nick") ?? ""));
  return NextResponse.json({ nicks: await trackNickViews(o.a.guild) });
}
