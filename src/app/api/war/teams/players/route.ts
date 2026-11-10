/**
 * A team's players on the Teams page (overrides picks 2026-11-09): in-game name → the name and flag war tables show.
 * Same access as /api/war/teams. Every answer carries the page's fresh view.
 *   POST   { guild, teamId, text }                       pasted lines ("Jalen = peep/Sxyd [us]", one a line)
 *   POST   { guild, teamId, ingame, shown?, flag?, mkcPlayerId? }   one player (tied to that MKCentral player
 *                                                        when the team is linked and they're on its MKCentral team)
 *          → { added, changed, read, view }
 *   PATCH  { guild, id, ingame, shown, flag }            one player's line exactly as typed → { view }
 *   DELETE ?guild=<id>&id=<line>                          → { view }
 */

import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/ratelimit";
import { cardsReady, removeRosterRow, setRoster } from "@/lib/wars/cardStore";
import { readRosterLines } from "@/lib/wars/cards";
import { mkcPlayerOn, rosterRowIn, teamIn, teamsAccess, teamsView, updateRosterRow } from "@/lib/wars/teamAdmin";
import { cleanFlagText } from "@/lib/wars/teamView";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });
const text = (v: unknown, max = 32) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);

type Body = { guild?: string; teamId?: string; id?: string; text?: string; ingame?: string; shown?: string | null; flag?: string | null; mkcPlayerId?: unknown };

async function open(body: Body | null) {
  if (!body) return { error: fail("bad_request", 400) };
  const a = await teamsAccess(body.guild);
  if (!a.ok) return { error: fail(a.error, a.status) };
  if (!(await cardsReady())) return { error: fail("not_ready", 503) };
  if (!(await rateLimit(`war-teams:${a.m.userId}`, { max: 120, windowMs: 10 * 60_000 })).ok) return { error: fail("slow_down", 429) };
  return { a };
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Body | null;
  const o = await open(body);
  if ("error" in o) return o.error;
  const { a } = o;
  const team = await teamIn(a.guild, body!.teamId);
  if (!team) return fail("gone", 404);
  let lines: { ingame: string; shown: string | null; flag: string | null; mkcPlayerId?: number | null }[];
  if (typeof body!.text === "string") {
    lines = readRosterLines(body!.text.slice(0, 4000));
    if (!lines.length) return fail("no_lines", 400);
  } else {
    const ingame = text(body!.ingame);
    if (!ingame) return fail("no_name", 400);
    const flagText = text(body!.flag, 16);
    const flag = flagText ? cleanFlagText(flagText) : null;
    if (flagText && !flag) return fail("bad_flag", 400);
    const shown = text(body!.shown) || null;
    const mkcPlayerId = body!.mkcPlayerId === undefined || body!.mkcPlayerId === null ? null : await mkcPlayerOn(team, body!.mkcPlayerId);
    lines = [{ ingame, shown: shown && shown !== ingame ? shown : null, flag, mkcPlayerId }];
  }
  const res = await setRoster(a.guild, team.id, lines, a.by, true, "captain");
  return NextResponse.json({ added: res.added, changed: res.changed, read: lines.length, view: await teamsView(a.guild) });
}

export async function PATCH(req: Request) {
  const body = (await req.json().catch(() => null)) as Body | null;
  const o = await open(body);
  if ("error" in o) return o.error;
  const res = await updateRosterRow(o.a.guild, String(body!.id ?? ""), { ingame: body!.ingame, shown: body!.shown, flag: body!.flag });
  if (res !== "ok") return fail(res, res === "gone" ? 404 : res === "taken" ? 409 : 400);
  return NextResponse.json({ view: await teamsView(o.a.guild) });
}

export async function DELETE(req: Request) {
  const url = new URL(req.url);
  const a = await teamsAccess(url.searchParams.get("guild"));
  if (!a.ok) return fail(a.error, a.status);
  const row = await rosterRowIn(a.guild, url.searchParams.get("id"));
  if (!row) return fail("gone", 404);
  const res = await removeRosterRow(row.id, a.by, true);
  if (res !== "ok") return fail(res, 404);
  return NextResponse.json({ view: await teamsView(a.guild) });
}
