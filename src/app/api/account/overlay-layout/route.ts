/**
 * Overlay layout profiles — read + write for the layout editor.
 *
 * GET  /api/account/overlay-layout
 *      → { ok, layouts: { landscape?, portrait?, square? } } for the caller.
 *        Absent formats fall back to DEFAULT_LAYOUTS on the client.
 *
 * PUT  /api/account/overlay-layout
 *      body: { format, profile }  → upsert one format's profile
 *      body: { format, reset: true } → delete it (back to defaults)
 *
 * Owner-scoped: requires an authenticated user. The store uses the service
 * client (the overlay reads anonymously via the token route), so we enforce
 * ownership here by only ever passing the caller's own id.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  getLayoutProfiles,
  saveLayoutProfile,
  resetLayoutProfile,
} from "@/lib/overlay/layouts";
import type { LayoutProfile, OverlayFormat } from "@/lib/overlay/format";

export const runtime = "nodejs";

const FORMATS: OverlayFormat[] = ["landscape", "portrait", "square"];

function isFormat(v: unknown): v is OverlayFormat {
  return typeof v === "string" && (FORMATS as string[]).includes(v);
}

async function authedUserId(): Promise<
  { ok: true; userId: string } | { ok: false; status: number; error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, status: 401, error: "unauthenticated" };
  return { ok: true, userId: user.id };
}

export async function GET() {
  const auth = await authedUserId();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const layouts = await getLayoutProfiles(auth.userId);

  // The overlay token powers the browser-source links (OBS/Streamlabs). Null
  // when Twitch isn't connected yet — the client shows a connect prompt instead.
  const supabase = await createClient();
  const { data: conn } = await supabase
    .from("twitch_connections")
    .select("overlay_token")
    .eq("user_id", auth.userId)
    .maybeSingle();

  return NextResponse.json({
    ok: true,
    layouts,
    overlayToken: (conn?.overlay_token as string | null) ?? null,
  });
}

export async function PUT(req: NextRequest) {
  const auth = await authedUserId();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const body = (await req.json().catch(() => null)) as {
    format?: string;
    profile?: LayoutProfile;
    reset?: boolean;
  } | null;
  if (!body || !isFormat(body.format)) {
    return NextResponse.json({ error: "bad_format" }, { status: 400 });
  }

  if (body.reset) {
    await resetLayoutProfile(auth.userId, body.format);
    return NextResponse.json({ ok: true });
  }

  if (!body.profile || typeof body.profile !== "object") {
    return NextResponse.json({ error: "missing_profile" }, { status: 400 });
  }
  const res = await saveLayoutProfile(auth.userId, body.format, {
    safeArea: body.profile.safeArea ?? null,
    elements: body.profile.elements ?? {},
  });
  if (!res.ok) {
    return NextResponse.json({ error: res.error ?? "save_failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
