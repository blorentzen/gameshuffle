/**
 * POST /api/championships — start a championship series (a season of Heat →
 * Mains events) from the create page.
 *
 * Championship series is a GS Circuit organizer tool (picks 2026-11-11): free
 * while organizer billing is off, then part of Circuit 64 and 256 (staff and
 * the launch grace count), checked with organizerHasPaidFeatures like trivia
 * leagues. The row is written with the service role after that check, so it
 * works whether or not the database's insert policy still asks for GS Pro
 * (supabase/championships-circuit-m1.sql drops that).
 *
 * Body: { name, description?, gameSlug, gameLabel?, series?: 1|2, heatSize?: "auto"|4..8 }
 * Answers { id } or { error } (circuit_required 402, unverified 403, reserved_name / bad_name 400).
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { organizerHasPaidFeatures } from "@/lib/tournaments/circuit-resolve";
import { randomInt } from "node:crypto";
import { isReservedName } from "@/lib/reservedName";
import { isEmailVerified } from "@/lib/auth-utils";
import { isBlockedText } from "@/lib/text/filter";

export const runtime = "nodejs";

interface Body {
  name?: unknown;
  description?: unknown;
  gameSlug?: unknown;
  gameLabel?: unknown;
  series?: unknown;
  heatSize?: unknown;
}

/** The same 8-character share token shape as generateShareToken (src/lib/tournaments.ts, a browser module). */
function shareToken(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let token = "";
  for (let i = 0; i < 8; i++) token += chars[randomInt(chars.length)];
  return token;
}

const text = (v: unknown, max: number): string => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, max) : "");

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (!isEmailVerified(user)) return NextResponse.json({ error: "unverified" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as Body;
  const name = text(body.name, 120);
  const description = typeof body.description === "string" ? body.description.trim().slice(0, 2000) : "";
  const gameSlug = text(body.gameSlug, 80).toLowerCase();
  const gameLabel = text(body.gameLabel, 120);
  if (name.length < 2 || !gameSlug || !/^[a-z0-9-]+$/.test(gameSlug)) return NextResponse.json({ error: "bad_name" }, { status: 400 });
  if (isReservedName(name)) return NextResponse.json({ error: "reserved_name" }, { status: 400 });
  if (isBlockedText(name) || (description && isBlockedText(description))) return NextResponse.json({ error: "blocked" }, { status: 400 });

  const admin = createServiceClient();
  if (!(await organizerHasPaidFeatures(admin, user.id))) return NextResponse.json({ error: "circuit_required" }, { status: 402 });

  const series = body.series === 1 ? 1 : 2;
  const heatSize = typeof body.heatSize === "number" && Number.isInteger(body.heatSize) && body.heatSize >= 4 && body.heatSize <= 8 ? body.heatSize : "auto";

  const { data, error } = await admin
    .from("championships")
    .insert({
      owner_id: user.id,
      name,
      description: description || null,
      game_slug: gameSlug,
      settings: { series, heatSize, mode: "ffa", items: "normal", game_label: gameLabel || gameSlug },
      share_token: shareToken(),
    })
    .select("id")
    .single();
  if (error || !data) {
    console.error("[championships] create failed", error);
    return NextResponse.json({ error: "create_failed" }, { status: 500 });
  }
  return NextResponse.json({ id: (data as { id: string }).id });
}
