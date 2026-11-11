/**
 * GET /api/speedrun/templates?game=<name or key> → { ok, templates: GameTemplates | null }
 * The ready-made split lists for a game (src/lib/speedrun/templates.ts), for the setup page's Your splits section.
 * Public and the same for everyone, so it's cached.
 */

import { NextResponse } from "next/server";
import { templatesFor } from "@/lib/speedrun/templates";

export function GET(req: Request) {
  const game = new URL(req.url).searchParams.get("game")?.slice(0, 80) ?? "";
  return NextResponse.json({ ok: true, templates: templatesFor(game) }, { headers: { "cache-control": "public, max-age=3600, s-maxage=86400" } });
}
