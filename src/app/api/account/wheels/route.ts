/**
 * Wheel definitions — read + write (Pro-gated).
 *
 * GET    /api/account/wheels            → list the streamer's wheels
 * PUT    /api/account/wheels            body: { id?, name, segments, isDefault }
 * DELETE /api/account/wheels?id=<uuid>
 *
 * Authorization: authenticated AND has the `wheels.use` Pro capability.
 * Wheels are owner-scoped directly (no community/session resolution).
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { effectiveTier, hasCapability, normalizeTier } from "@/lib/subscription";
import { deleteWheel, listWheels, upsertWheel } from "@/lib/wheels/store";
import {
  DEFAULT_THEME_ID,
  WHEEL_THEMES,
  getFillStyle,
} from "@/lib/wheel/themes";
import {
  DEFAULT_CONTRIBUTION,
  type ContributionMode,
  type ResetMode,
  type WheelContribution,
  type WheelSegment,
} from "@/lib/wheels/types";

export const runtime = "nodejs";

const MAX_SEGMENTS = 60;
const MAX_LABEL = 80;
const MAX_ALLOWLIST = 50;

const CONTRIBUTION_MODES: ContributionMode[] = ["off", "everyone", "allowlist"];
const RESET_MODES: ResetMode[] = ["manual", "on_spin"];

/** Coerce + clamp client-supplied contribution settings. */
function sanitizeContribution(input: unknown): WheelContribution {
  if (!input || typeof input !== "object") return { ...DEFAULT_CONTRIBUTION };
  const r = input as Record<string, unknown>;
  const mode = CONTRIBUTION_MODES.includes(r.mode as ContributionMode)
    ? (r.mode as ContributionMode)
    : "off";
  const resetMode = RESET_MODES.includes(r.resetMode as ResetMode)
    ? (r.resetMode as ResetMode)
    : "manual";
  const max = Math.max(0, Math.min(5, Math.floor(Number(r.max) || 0)));
  const perViewerLimit = Math.max(1, Math.min(5, Math.floor(Number(r.perViewerLimit) || 1)));
  const allowlist = Array.isArray(r.allowlist)
    ? Array.from(
        new Set(
          r.allowlist
            .filter((x): x is string => typeof x === "string")
            .map((s) => s.trim().replace(/^@/, "").toLowerCase())
            .filter((s) => /^[a-z0-9_]{1,25}$/.test(s)),
        ),
      ).slice(0, MAX_ALLOWLIST)
    : [];
  return { mode, max, perViewerLimit, allowlist, resetMode };
}

type Authed =
  | { ok: true; userId: string }
  | { ok: false; status: number; error: string };

/** Require an authenticated user with the wheels Pro capability. */
async function authedProUser(): Promise<Authed> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, status: 401, error: "unauthenticated" };

  const { data: profile } = await supabase
    .from("users")
    .select("subscription_tier, role")
    .eq("id", user.id)
    .maybeSingle();

  const capUser = {
    tier: normalizeTier(profile?.subscription_tier as string | null),
    role: (profile?.role as string | null) ?? null,
  };
  if (effectiveTier(capUser) !== "pro" || !hasCapability(capUser, "wheels.use")) {
    return { ok: false, status: 403, error: "pro_required" };
  }
  return { ok: true, userId: user.id };
}

/** Coerce + clamp client-supplied segments into safe WheelSegment rows. */
function sanitizeSegments(input: unknown): WheelSegment[] | null {
  if (!Array.isArray(input)) return null;
  const out: WheelSegment[] = [];
  for (const raw of input.slice(0, MAX_SEGMENTS)) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const label = typeof r.label === "string" ? r.label.trim().slice(0, MAX_LABEL) : "";
    if (!label) continue;
    const seg: WheelSegment = { label };
    if (typeof r.weight === "number" && Number.isFinite(r.weight) && r.weight > 0) {
      seg.weight = r.weight;
    }
    if (typeof r.color === "string" && /^#[0-9a-fA-F]{3,8}$/.test(r.color)) {
      seg.color = r.color;
    }
    out.push(seg);
  }
  return out;
}

export async function GET() {
  const auth = await authedProUser();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const wheels = await listWheels(auth.userId);
  return NextResponse.json({ ok: true, wheels });
}

export async function PUT(req: NextRequest) {
  const auth = await authedProUser();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = (await req.json().catch(() => null)) as {
    id?: string;
    name?: string;
    segments?: unknown;
    isDefault?: boolean;
    themeId?: unknown;
    fillStyle?: unknown;
    contribution?: unknown;
  } | null;
  if (!body) return NextResponse.json({ error: "bad_json" }, { status: 400 });

  const name = typeof body.name === "string" ? body.name.trim().slice(0, 60) : "";
  if (!name) return NextResponse.json({ error: "missing_name" }, { status: 400 });

  const segments = sanitizeSegments(body.segments);
  if (!segments) return NextResponse.json({ error: "bad_segments" }, { status: 400 });
  if (segments.length < 2) {
    return NextResponse.json({ error: "need_two_segments" }, { status: 400 });
  }

  const themeId = WHEEL_THEMES.some((t) => t.id === body.themeId)
    ? (body.themeId as string)
    : DEFAULT_THEME_ID;
  const fillStyle = getFillStyle(
    typeof body.fillStyle === "string" ? body.fillStyle : null,
  );

  try {
    const wheel = await upsertWheel({
      ownerUserId: auth.userId,
      id: body.id,
      name,
      segments,
      isDefault: body.isDefault === true,
      themeId,
      fillStyle,
      contribution: sanitizeContribution(body.contribution),
    });
    return NextResponse.json({ ok: true, wheel });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "save_failed";
    // Unique (owner, name) collision surfaces a friendly error.
    const dup = /duplicate|unique/i.test(msg);
    return NextResponse.json(
      { error: dup ? "name_taken" : "save_failed" },
      { status: dup ? 409 : 500 },
    );
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await authedProUser();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 });
  await deleteWheel(auth.userId, id);
  return NextResponse.json({ ok: true });
}
