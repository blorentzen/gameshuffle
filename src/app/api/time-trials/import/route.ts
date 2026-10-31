/**
 * The import (signed in; picks 2026-10-29: 5A and the migration picks).
 *   POST { text, game }              → rows read from a paste: Quaxly's list first, else one time per line,
 *                                      else Claude. Nothing saved.
 *   POST multipart files[] + game    → rows read from screenshots of Quaxly's reply (Claude copies them out)
 *   GET  ?d=<draft id>               → a list read in Discord with Save to GameShuffle, for the check table
 *   POST { source: "mkcentral" }     → the account's Mario Kart World times on MKCentral, found by its Discord id
 *   GET  ?bests=1&game=&items=       → your saved bests (track|cc → ms), for the type-in grid
 *   PUT  { game, rows: [{ track, cc, time, video? }], learned? } → saves the rows kept, only those faster than
 *                                      what's saved; `learned` = tracks picked for names the reader didn't know
 * Lines the reader can't match go to Claude on their own (pasting picks 2026-10-30, 1A), and short names
 * players taught it read too (2A).
 * Rows come back as check rows: ticked when readable, yours, under the world record and new.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/ratelimit";
import { siteActor, siteNames } from "@/lib/timeTrials/players";
import { ttReady } from "@/lib/timeTrials/store";
import { aiImport, MAX_IMPORT_CHARS } from "@/lib/timeTrials/importServer";
import { linesLookRight, readLines } from "@/lib/timeTrials/importText";
import { readQuaxly, readTitle, yourRows, type Learned, type QuaxlyList, type QuaxlyRow } from "@/lib/timeTrials/quaxly";
import { learnedFor, rememberAliases } from "@/lib/timeTrials/aliases";
import { mkcentralTimes } from "@/lib/timeTrials/mkcentralImport";
import type { ImportRow } from "@/lib/timeTrials/importText";
import { isItems, type TtItems } from "@/lib/timeTrials/categories";
import { readShots, MAX_SHOTS, MAX_SHOT_BYTES } from "@/lib/timeTrials/importShots";
import { toCheckRows, type CheckRow } from "@/lib/timeTrials/importRows";
import { bestsMap, loadQuaxlyDraft, saveImported } from "@/lib/timeTrials/importFlow";
import { discordIdOf } from "@/lib/timeTrials/claim";
import { isTtGame, TT_GAMES, type TtGame } from "@/lib/timeTrials/tracks";
import type { TtActor } from "@/lib/timeTrials/players";

export const runtime = "nodejs";
export const maxDuration = 60;

type Read = { ok: true; rows: CheckRow[]; title: string | null; holders: boolean; ai: boolean; items: TtItems; error?: string } | { ok: false; error: string };

/**
 * Lines the reader couldn't match (a time but no track) go to Claude on their own, so a list that mostly
 * reads doesn't leave the rest for picking by hand. Rows it matches say "Read by AI". Counts toward the
 * daily AI import limit; at the limit the rows stay for picking.
 */
async function fillByAi<R extends ImportRow | QuaxlyRow>(rows: R[], game: TtGame, userId: string, only?: Set<number>): Promise<{ rows: R[]; error?: string }> {
  const unclear = rows.filter((r, i) => !r.trackId && r.timeMs && (!only || only.has(i)));
  if (!unclear.length) return { rows };
  const res = await aiImport(unclear.map((r) => r.line).join("\n"), game, userId);
  if (!res.ok) return { rows, error: res.error === "cap" ? "cap_some" : undefined };
  const byTime = new Map<number, ImportRow[]>();
  for (const a of res.rows) if (a.trackId && a.timeMs) byTime.set(a.timeMs, [...(byTime.get(a.timeMs) ?? []), a]);
  return {
    rows: rows.map((r, i) => {
      if (r.trackId || !r.timeMs || (only && !only.has(i))) return r;
      const hits = byTime.get(r.timeMs);
      // Only a time the AI matched exactly once, so two lines with the same time can't swap tracks.
      return hits?.length === 1 ? { ...r, trackId: hits[0].trackId, trackName: hits[0].trackName, trackText: null, via: "ai" as const } : r;
    }),
  };
}

/** A Quaxly list as check rows: on a server board only rows under your names come up ticked. */
async function fromList(list: QuaxlyList, actor: TtActor, own: boolean, ai: boolean): Promise<Read> {
  // A Shrooms list goes on the mushroom boards, a No-items list on the no-mushroom boards (round 2).
  const items: TtItems = list.items === "none" ? "none" : "shrooms";
  const { mine } = yourRows(list, await siteNames(), own);
  const mineIdx = new Set(mine.map((r) => list.rows.indexOf(r)));
  // Only your rows are worth an AI read (and screenshots were read with AI already).
  const filled = ai ? { rows: list.rows } : await fillByAi(list.rows, list.game, actor.userId!, mineIdx);
  const rows = toCheckRows(filled.rows, list.game, list.cc, mineIdx, await bestsMap(actor.player, list.game, items));
  return { ok: true, rows, title: list.title, holders: list.hasHolders, ai, items, ...(filled.error ? { error: filled.error } : {}) };
}

export async function GET(req: Request) {
  const actor = await siteActor();
  if (!actor?.userId) return NextResponse.json({ ok: false, error: "signin" }, { status: 401 });
  const sp = new URL(req.url).searchParams;
  // Your saved bests for the type-in grid (pick 3A).
  if (sp.get("bests")) {
    const game = sp.get("game");
    if (!isTtGame(game)) return NextResponse.json({ ok: false, error: "bad_game" }, { status: 400 });
    const want = sp.get("items");
    const items: TtItems = isItems(want) ? want : "shrooms";
    return NextResponse.json({ ok: true, bests: Object.fromEntries(await bestsMap(actor.player, game, items)) });
  }
  const id = sp.get("d") ?? "";
  const loaded = await loadQuaxlyDraft(id);
  if (!loaded) return NextResponse.json({ ok: false, error: "gone" }, { status: 404 });
  // The list is yours to check when it was read for this account, or for the Discord account connected to it.
  const { data: { user } } = await (await createClient()).auth.getUser();
  const discordId = user ? discordIdOf(user) : null;
  if (loaded.player !== actor.player && loaded.discordId !== discordId) return NextResponse.json({ ok: false, error: "not_yours" }, { status: 403 });
  const { list, mine } = loaded.draft;
  const items: TtItems = list.items === "none" ? "none" : "shrooms";
  const rows = toCheckRows(list.rows, list.game, list.cc, new Set(mine), await bestsMap(actor.player, list.game, items));
  return NextResponse.json({ ok: true, game: list.game, rows, title: list.title, holders: list.hasHolders, ai: false, items });
}

export async function POST(req: Request) {
  const actor = await siteActor();
  if (!actor?.userId) return NextResponse.json({ ok: false, error: "signin" }, { status: 401 });
  if (!(await rateLimit(`tt-import:${actor.userId}`, { max: 30, windowMs: 10 * 60_000 })).ok) return NextResponse.json({ ok: false, error: "slow_down" }, { status: 429 });

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

  const body = (await req.json().catch(() => ({}))) as { text?: unknown; game?: unknown; source?: unknown };

  // MKCentral (Mario Kart World), found by the account's Discord id.
  if (body.source === "mkcentral") {
    const { data: { user } } = await (await createClient()).auth.getUser();
    const discordId = user ? discordIdOf(user) : null;
    if (!discordId) return NextResponse.json({ ok: false, error: "no_discord" });
    const res = await mkcentralTimes(discordId);
    if (!res.ok) return NextResponse.json({ ok: false, error: res.error });
    const bests = await bestsMap(actor.player, "mkworld", "shrooms");
    return NextResponse.json({ ok: true, game: "mkworld", rows: toCheckRows(res.rows, "mkworld", 150, null, bests), title: res.name ? `${res.name} on MKCentral` : "Your MKCentral times", holders: false, ai: false, items: "shrooms" });
  }

  if (!isTtGame(body.game)) return NextResponse.json({ ok: false, error: "bad_game" }, { status: 400 });
  const game: TtGame = body.game;
  const learned: Learned = await learnedFor(actor.player, game);
  const text = typeof body.text === "string" ? body.text.slice(0, MAX_IMPORT_CHARS) : "";
  if (!text.trim()) return NextResponse.json({ ok: false, error: "empty" }, { status: 400 });

  // Quaxly's list (title, abbreviations, holders), when it reads at least as well as one time per line.
  const list = readQuaxly(text, game, learned);
  const lines = readLines(text, game, learned);
  const matched = (rows: { trackId: string | null; timeMs: number | null }[]) => rows.filter((r) => r.trackId && r.timeMs).length;
  if (list && (list.title || list.hasHolders || matched(list.rows) >= matched(lines)) && matched(list.rows) > 0) {
    return NextResponse.json({ game, ...(await fromList(list, actor, true, false)) });
  }
  // A plain list: mushrooms unless the paste says no items.
  const items: TtItems = readTitle(text.split(/\r?\n/).find((l) => l.trim()) ?? "")?.items === "none" ? "none" : "shrooms";
  const bests = await bestsMap(actor.player, game, items);
  if (linesLookRight(lines)) {
    const filled = await fillByAi(lines, game, actor.userId);
    return NextResponse.json({ ok: true, game, rows: toCheckRows(filled.rows, game, TT_GAMES[game].classes[0], null, bests), title: null, holders: false, ai: false, items, ...(filled.error ? { error: filled.error } : {}) });
  }
  const res = await aiImport(text, game, actor.userId);
  if (!res.ok) return NextResponse.json({ ok: lines.length > 0, game, rows: toCheckRows(lines, game, TT_GAMES[game].classes[0], null, bests), title: null, holders: false, ai: false, items, error: res.error });
  return NextResponse.json({ ok: true, game, rows: toCheckRows(res.rows, game, TT_GAMES[game].classes[0], null, bests), title: null, holders: false, ai: true, items });
}

export async function PUT(req: Request) {
  const actor = await siteActor();
  if (!actor?.userId) return NextResponse.json({ ok: false, error: "signin" }, { status: 401 });
  if (!(await ttReady())) return NextResponse.json({ ok: false, error: "not_ready" }, { status: 503 });
  if (!(await rateLimit(`tt-import-save:${actor.userId}`, { max: 5, windowMs: 10 * 60_000 })).ok) return NextResponse.json({ ok: false, error: "slow_down" }, { status: 429 });
  const body = (await req.json().catch(() => ({}))) as { game?: unknown; rows?: unknown; items?: unknown; learned?: unknown };
  if (!isTtGame(body.game) || !Array.isArray(body.rows)) return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  const rows = (body.rows as { track?: unknown; cc?: unknown; time?: unknown; video?: unknown }[]).map((r) => ({ track: typeof r.track === "string" ? r.track : "", cc: Number(r.cc), time: Number(r.time), video: typeof r.video === "string" ? r.video : null }));
  const tally = await saveImported(actor, body.game, rows, null, isItems(body.items) ? body.items : "shrooms");
  // Tracks picked for names the reader didn't know (pick 2A).
  if (Array.isArray(body.learned)) {
    const picks = (body.learned as { alias?: unknown; trackId?: unknown }[]).filter((p) => typeof p.alias === "string" && typeof p.trackId === "string").map((p) => ({ alias: p.alias as string, trackId: p.trackId as string }));
    await rememberAliases(actor.player, body.game, picks);
  }
  return NextResponse.json({ ok: true, ...tally });
}
