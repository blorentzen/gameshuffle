/**
 * The War room's Cans tab (cans picks 2026-11-04, 11A): usual hours and posting a can check from the week's best time.
 *   GET  ?team=<role id>   → { teams, team, mine, players } (players' usual hours as UTC half-hours; the page works
 *                            out each viewer's own week from their device's time zone)
 *   POST { action: "hours", team, tz, picks: [{ day, hour }] }   → saves your usual hours for that team
 *   POST { action: "post", team, at (ISO), vs?, size? }          → posts a can check in this channel
 * Signed in with the Activity's own session (Bearer), in GameShuffle Competitive (`app: "comp"`), in a server.
 */

import { NextResponse } from "next/server";
import { sessionFrom } from "@/lib/activity/session";
import { rateLimit } from "@/lib/ratelimit";
import { compRest } from "@/lib/discord/compRest";
import { DEFAULT_SIZE, MAX_SIZE, MIN_SIZE, isTimeZone, storeHours } from "@/lib/cans/rules";
import { cansReady, createCheck, hoursFor, rosterFor, saveHours, setMessage, teamsFor } from "@/lib/cans/store";
import { checkMessage } from "@/lib/discord/commands/cans";

export const runtime = "nodejs";
const NO_STORE = { "Cache-Control": "no-store" };

function viewer(req: Request) {
  const s = sessionFrom(req);
  return s && s.app === "comp" ? s : null;
}

/** The server's team roles with their names (the bot reads the server's roles). */
async function namedTeams(guildId: string) {
  const [teams, roles] = await Promise.all([teamsFor(guildId), compRest<{ id: string; name: string; color: number }[]>("GET", `/guilds/${guildId}/roles`)]);
  const byId = new Map((roles.ok ? roles.data : []).map((r) => [r.id, r]));
  return teams.map((t) => ({ roleId: t.roleId, tag: t.tag, name: byId.get(t.roleId)?.name ?? t.tag ?? "A team" }));
}

export async function GET(req: Request) {
  const s = viewer(req);
  if (!s) return NextResponse.json({ error: "signin" }, { status: 401 });
  if (!s.gid) return NextResponse.json({ error: "no_server" }, { status: 400, headers: NO_STORE });
  if (!(await cansReady())) return NextResponse.json({ error: "not_ready" }, { status: 503 });
  const teams = await namedTeams(s.gid);
  const asked = new URL(req.url).searchParams.get("team");
  const team = teams.find((t) => t.roleId === asked)?.roleId ?? teams[0]?.roleId ?? null;
  const players = team ? await hoursFor(s.gid, team) : [];
  return NextResponse.json({
    teams, team,
    mine: players.find((p) => p.userId === s.did)?.slots ?? [],
    players: players.map((p) => ({ name: p.name, slots: p.slots, you: p.userId === s.did })),
    canPost: !!s.cid,
  }, { headers: NO_STORE });
}

export async function POST(req: Request) {
  const s = viewer(req);
  if (!s) return NextResponse.json({ error: "signin" }, { status: 401 });
  if (!s.gid) return NextResponse.json({ error: "no_server" }, { status: 400 });
  if (!(await cansReady())) return NextResponse.json({ error: "not_ready" }, { status: 503 });
  if (!(await rateLimit(`cans-room:${s.did}`, { max: 30, windowMs: 60_000 })).ok) return NextResponse.json({ error: "slow_down" }, { status: 429 });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const teams = await teamsFor(s.gid);
  const team = teams.find((t) => t.roleId === body?.team);
  if (!body || !team) return NextResponse.json({ error: "bad_team" }, { status: 400 });

  if (body.action === "hours") {
    if (!isTimeZone(body.tz) || !Array.isArray(body.picks) || body.picks.length > 168) return NextResponse.json({ error: "bad_request" }, { status: 400 });
    const slots = storeHours(body.picks as { day: number; hour: number }[], body.tz);
    const ok = await saveHours(s.gid, team.roleId, s.did, s.name, body.tz, slots);
    return NextResponse.json({ ok }, { status: ok ? 200 : 500 });
  }

  if (body.action === "post") {
    if (!s.cid) return NextResponse.json({ error: "no_channel" }, { status: 400 });
    const at = new Date(String(body.at ?? ""));
    if (Number.isNaN(at.getTime()) || at.getTime() < Date.now() - 10 * 60_000 || at.getTime() > Date.now() + 14 * 86_400_000) return NextResponse.json({ error: "bad_time" }, { status: 400 });
    const n = Number(body.size ?? DEFAULT_SIZE);
    const size = Number.isInteger(n) && n >= MIN_SIZE && n <= MAX_SIZE ? n : DEFAULT_SIZE;
    const vs = String(body.vs ?? "").replace(/[|<>@#*_`~]/g, "").trim().slice(0, 12) || null;
    const check = await createCheck({ guildId: s.gid, channelId: s.cid, roleId: team.roleId, teamTag: team.tag, vs, size, startsAt: at, by: s.did, byName: s.name });
    if (!check) return NextResponse.json({ error: "failed" }, { status: 500 });
    const roster = await rosterFor(s.gid, team.roleId, s.cid);
    const res = await compRest<{ id: string }>("POST", `/channels/${s.cid}/messages`, {
      content: `<@&${team.roleId}> war time`, ...checkMessage(check, [], roster), allowed_mentions: { roles: [team.roleId] },
    });
    if (!res.ok) return NextResponse.json({ error: res.status === 403 ? "no_access" : "failed" }, { status: 502 });
    await setMessage(check.id, res.data.id);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "bad_request" }, { status: 400 });
}
