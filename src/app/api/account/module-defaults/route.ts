/**
 * Streamer-level module defaults — read + write.
 *
 * GET  /api/account/module-defaults?moduleId=race_randomizer
 *      → list every per-game default the streamer has saved
 *        (caller uses this to hydrate the per-game cards).
 *
 * GET  /api/account/module-defaults?moduleId=race_randomizer
 *                                  &gameSlug=mario-kart-world
 *      → single default for a specific (module, game) tuple.
 *        Returns null on `config` when nothing saved.
 *
 * PUT  /api/account/module-defaults
 *      body: { moduleId, gameSlug, config }
 *      → upsert. Server trusts the typed shape from the UI; the
 *        seed helper consults this row on the next session load.
 *
 * Authorization: requires an authenticated user. No community
 * resolution needed — defaults are owner-scoped directly (a
 * streamer can configure their MK templates before they've
 * connected Twitch).
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  getStreamerModuleDefault,
  listStreamerModuleDefaults,
  setStreamerModuleDefault,
} from "@/lib/modules/streamerDefaults";
import type { ModuleId } from "@/lib/modules/types";

export const runtime = "nodejs";

const SUPPORTED_MODULES: ReadonlyArray<ModuleId> = ["race_randomizer"];

function isModuleId(value: string): value is ModuleId {
  return (SUPPORTED_MODULES as ReadonlyArray<string>).includes(value);
}

async function authedUserId(): Promise<
  | { ok: true; userId: string }
  | { ok: false; status: number; error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, status: 401, error: "unauthenticated" };
  return { ok: true, userId: user.id };
}

export async function GET(req: NextRequest) {
  const auth = await authedUserId();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const moduleId = req.nextUrl.searchParams.get("moduleId");
  const gameSlug = req.nextUrl.searchParams.get("gameSlug");
  if (!moduleId || !isModuleId(moduleId)) {
    return NextResponse.json(
      { error: "unsupported_module" },
      { status: 400 },
    );
  }
  if (gameSlug) {
    const config = await getStreamerModuleDefault({
      ownerUserId: auth.userId,
      moduleId,
      gameSlug,
    });
    return NextResponse.json({ ok: true, config });
  }
  const rows = await listStreamerModuleDefaults({
    ownerUserId: auth.userId,
    moduleId,
  });
  return NextResponse.json({ ok: true, rows });
}

export async function PUT(req: NextRequest) {
  const auth = await authedUserId();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const body = (await req.json().catch(() => null)) as {
    moduleId?: string;
    gameSlug?: string;
    config?: Record<string, unknown>;
  } | null;
  if (!body) {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }
  if (!body.moduleId || !isModuleId(body.moduleId)) {
    return NextResponse.json(
      { error: "unsupported_module" },
      { status: 400 },
    );
  }
  if (!body.gameSlug?.trim()) {
    return NextResponse.json(
      { error: "missing_game_slug" },
      { status: 400 },
    );
  }
  if (!body.config || typeof body.config !== "object") {
    return NextResponse.json(
      { error: "missing_config" },
      { status: 400 },
    );
  }
  await setStreamerModuleDefault({
    ownerUserId: auth.userId,
    moduleId: body.moduleId,
    gameSlug: body.gameSlug.trim(),
    config: body.config as never,
  });
  return NextResponse.json({ ok: true });
}
