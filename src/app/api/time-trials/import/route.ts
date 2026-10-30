/**
 * The import (signed in; picks 2026-10-29: 5A and the migration picks).
 *   POST { text, game }              → rows read from a paste: Quaxly's list first, else one time per line,
 *                                      else Claude. Nothing saved.
 *   POST multipart files[] + game    → rows read from screenshots of Quaxly's reply (Claude copies them out)
 *   GET  ?d=<draft id>               → a list read in Discord with Save to GameShuffle, for the check table
 *   PUT  { game, rows: [{ track, cc, time }] } → saves the rows kept, only those faster than what's saved
 * Rows come back as check rows: ticked when readable, yours, under the world record and new.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/ratelimit";
import { siteActor, siteNames } from "@/lib/timeTrials/players";
import { ttReady } from "@/lib/timeTrials/store";
import { aiImport, MAX_IMPORT_CHARS } from "@/lib/timeTrials/importServer";
import { linesLookRight, readLines } from "@/lib/timeTrials/importText";
import { readQuaxly, yourRows, type QuaxlyList } from "@/lib/timeTrials/quaxly";
import { readShots, MAX_SHOTS, MAX_SHOT_BYTES } from "@/lib/timeTrials/importShots";
import { toCheckRows, type CheckRow } from "@/lib/timeTrials/importRows";
import { bestsMap, loadQuaxlyDraft, saveImported } from "@/lib/timeTrials/importFlow";
import { discordIdOf } from "@/lib/timeTrials/claim";
import { isTtGame, TT_GAMES, type TtGame } from "@/lib/timeTrials/tracks";
import type { TtActor } from "@/lib/timeTrials/players";

export const runtime = "nodejs";
export const maxDuration = 60;

type Read = { ok: true; rows: CheckRow[]; title: string | null; holders: boolean; ai: boolean; error?: string } | { ok: false; error: string };

/** A Quaxly list as check rows: on a server board only rows under your names come up ticked. */
async function fromList(list: QuaxlyList, actor: TtActor, own: boolean, ai: boolean): Promise<Read> {
  if (list.items === "none") return { ok: false, error: "no_items" };
  const { mine } = yourRows(list, await siteNames(), own);
  const mineIdx = new Set(mine.map((r) => list.rows.indexOf(r)));
  const rows = toCheckRows(list.rows, list.game, list.cc, mineIdx, await bestsMap(actor.player, list.game));
  return { ok: true, rows, title: list.title, holders: list.hasHolders, ai };
}

export async function GET(req: Request) {
  const actor = await siteActor();
  if (!actor?.userId) return NextResponse.json({ ok: false, error: "signin" }, { status: 401 });
  const id = new URL(req.url).searchParams.get("d") ?? "";
  const loaded = await loadQuaxlyDraft(id);
  if (!loaded) return NextResponse.json({ ok: false, error: "gone" }, { status: 404 });
  // The list is yours to check when it was read for this account, or for the Discord account connected to it.
  const { data: { user } } = await (await createClient()).auth.getUser();
  const discordId = user ? discordIdOf(user) : null;
  if (loaded.player !== actor.player && loaded.discordId !== discordId) return NextResponse.json({ ok: false, error: "not_yours" }, { status: 403 });
  const { list, mine } = loaded.draft;
  const rows = toCheckRows(list.rows, list.game, list.cc, new Set(mine), await bestsMap(actor.player, list.game));
  return NextResponse.json({ ok: true, game: list.game, rows, title: list.title, holders: list.hasHolders, ai: false });
}

export async function POST(req: Request) {
  const actor = await siteActor();
  if (!actor?.userId) return NextResponse.json({ ok: false, error: "signin" }, { status: 401 });
  if (!(await rateLimit(`tt-import:${actor.userId}`, { max: 10, windowMs: 10 * 60_000 })).ok) return NextResponse.json({ ok: false, error: "slow_down" }, { status: 429 });

  // Screenshots of Quaxly's reply.
  if ((req.headers.get("content-type") ?? "").startsWith("multipart/form-data")) {
    const form = await req.formData().catch(() => null);
    const game = form?.get("game");
    if (!form || !isTtGame(game)) return NextResponse.json({ ok: false, error: "bad_game" }, { status: 400 });
    const files = form.getAll("files").filter((f): f is File => f instanceof File).slice(0, MAX_SHOTS);
    if (!files.length) return NextResponse.json({ ok: false, error: "empty" }, { status: 400 });
    if (files.some((f) => f.size > MAX_SHOT_BYTES)) return NextResponse.json({ ok: false, error: "too_big" }, { status: 400 });
    if (files.some((f) => !/^image\/(png|jpeg|webp)$/.test(f.type))) return NextResponse.json({ ok: false, error: "bad_type" }, { status: 400 });
    const res = await readShots(await Promise.all(files.map(async (f) => new Uint8Array(await f.arrayBuffer()))), game, actor.userId);
    if (!res.ok) return NextResponse.json({ ok: false, error: res.error });
    if (!res.list) return NextResponse.json({ ok: false, error: "nothing_read" });
    return NextResponse.json({ game, ...(await fromList(res.list, actor, true, true)) });
  }

  const body = (await req.json().catch(() => ({}))) as { text?: unknown; game?: unknown };
  if (!isTtGame(body.game)) return NextResponse.json({ ok: false, error: "bad_game" }, { status: 400 });
  const game: TtGame = body.game;
  const text = typeof body.text === "string" ? body.text.slice(0, MAX_IMPORT_CHARS) : "";
  if (!text.trim()) return NextResponse.json({ ok: false, error: "empty" }, { status: 400 });

  // Quaxly's list (title, abbreviations, holders), when it reads at least as well as one time per line.
  const list = readQuaxly(text, game);
  const lines = readLines(text, game);
  const matched = (rows: { trackId: string | null; timeMs: number | null }[]) => rows.filter((r) => r.trackId && r.timeMs).length;
  if (list && (list.title || list.hasHolders || matched(list.rows) >= matched(lines)) && matched(list.rows) > 0) {
    return NextResponse.json({ game, ...(await fromList(list, actor, true, false)) });
  }
  const bests = await bestsMap(actor.player, game);
  if (linesLookRight(lines)) return NextResponse.json({ ok: true, game, rows: toCheckRows(lines, game, TT_GAMES[game].classes[0], null, bests), title: null, holders: false, ai: false });
  const res = await aiImport(text, game, actor.userId);
  if (!res.ok) return NextResponse.json({ ok: lines.length > 0, game, rows: toCheckRows(lines, game, TT_GAMES[game].classes[0], null, bests), title: null, holders: false, ai: false, error: res.error });
  return NextResponse.json({ ok: true, game, rows: toCheckRows(res.rows, game, TT_GAMES[game].classes[0], null, bests), title: null, holders: false, ai: true });
}

export async function PUT(req: Request) {
  const actor = await siteActor();
  if (!actor?.userId) return NextResponse.json({ ok: false, error: "signin" }, { status: 401 });
  if (!(await ttReady())) return NextResponse.json({ ok: false, error: "not_ready" }, { status: 503 });
  if (!(await rateLimit(`tt-import-save:${actor.userId}`, { max: 5, windowMs: 10 * 60_000 })).ok) return NextResponse.json({ ok: false, error: "slow_down" }, { status: 429 });
  const body = (await req.json().catch(() => ({}))) as { game?: unknown; rows?: unknown };
  if (!isTtGame(body.game) || !Array.isArray(body.rows)) return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  const rows = (body.rows as { track?: unknown; cc?: unknown; time?: unknown }[]).map((r) => ({ track: typeof r.track === "string" ? r.track : "", cc: Number(r.cc), time: Number(r.time) }));
  const tally = await saveImported(actor, body.game, rows);
  return NextResponse.json({ ok: true, ...tally });
}
