/**
 * GET  /api/account/profile-layout → the user's normalized profile section layout
 * PUT  /api/account/profile-layout  body: { layout } → validate + save
 * PATCH /api/account/profile-layout body: { keys, show } → show or hide those sections, keeping the rest
 *       (the room's "On my profile" switches; read and written in one go so two switches never undo each other)
 *       or body: { highlights: string[] | null } → pin Highlights (null goes back to the automatic ones)
 *
 * Controls the order + visibility of the widget blocks on /u plus a column
 * count. Stored on `users.profile_layout` (jsonb). Authenticated; no tier gate.
 *
 * SECURITY: every read AND write passes through `resolveProfileLayout`, which
 * allowlists section keys and clamps the column count — a stored blob can never
 * carry anything but known keys, and there's no free-text/markup in the shape.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { resolveProfileLayout, cleanHighlightIds, DEFAULT_PROFILE_LAYOUT, PROFILE_SECTIONS, type ProfileSectionKey } from "@/lib/profile/layout";

export const runtime = "nodejs";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const admin = createServiceClient();
  const { data } = await admin.from("users").select("profile_layout").eq("id", user.id).maybeSingle();
  const layout = resolveProfileLayout((data as { profile_layout?: unknown } | null)?.profile_layout);
  return NextResponse.json({ ok: true, layout });
}

export async function PUT(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { layout?: unknown } | null;
  // Normalize through the gate — anything unknown is dropped/clamped here.
  let layout = resolveProfileLayout(body?.layout ?? DEFAULT_PROFILE_LAYOUT);

  const admin = createServiceClient();
  // The section editor doesn't know about pinned Highlights: a layout sent without them keeps the stored ones.
  if (!body?.layout || typeof body.layout !== "object" || !("highlights" in (body.layout as object))) {
    const { data } = await admin.from("users").select("profile_layout").eq("id", user.id).maybeSingle();
    layout = { ...layout, highlights: resolveProfileLayout((data as { profile_layout?: unknown } | null)?.profile_layout).highlights };
  }
  const { error } = await admin.from("users").update({ profile_layout: layout }).eq("id", user.id);
  if (error) {
    // Column not applied yet → tell the client to try later, don't 500.
    return NextResponse.json({ error: "migration_pending" }, { status: 503 });
  }
  return NextResponse.json({ ok: true, layout });
}

export async function PATCH(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { keys?: unknown; show?: unknown; highlights?: unknown } | null;
  if (body && "highlights" in body) {
    const admin = createServiceClient();
    const { data, error: readError } = await admin.from("users").select("profile_layout").eq("id", user.id).maybeSingle();
    if (readError) return NextResponse.json({ error: "migration_pending" }, { status: 503 });
    const layout = resolveProfileLayout((data as { profile_layout?: unknown } | null)?.profile_layout);
    const next = resolveProfileLayout({ ...layout, highlights: body.highlights === null ? null : cleanHighlightIds(body.highlights) ?? [] });
    const { error } = await admin.from("users").update({ profile_layout: next }).eq("id", user.id);
    if (error) return NextResponse.json({ error: "migration_pending" }, { status: 503 });
    return NextResponse.json({ ok: true, layout: next });
  }
  const known = new Set<string>(PROFILE_SECTIONS);
  const keys = Array.isArray(body?.keys) ? (body.keys.filter((k) => typeof k === "string" && known.has(k)) as ProfileSectionKey[]) : [];
  if (!keys.length || typeof body?.show !== "boolean") return NextResponse.json({ error: "bad_request" }, { status: 400 });

  const admin = createServiceClient();
  const { data, error: readError } = await admin.from("users").select("profile_layout").eq("id", user.id).maybeSingle();
  if (readError) return NextResponse.json({ error: "migration_pending" }, { status: 503 });
  const layout = resolveProfileLayout((data as { profile_layout?: unknown } | null)?.profile_layout);
  const hidden = new Set(layout.hidden);
  for (const k of keys) { if (body.show) hidden.delete(k); else hidden.add(k); }
  const next = resolveProfileLayout({ ...layout, hidden: [...hidden] });
  const { error } = await admin.from("users").update({ profile_layout: next }).eq("id", user.id);
  if (error) return NextResponse.json({ error: "migration_pending" }, { status: 503 });
  return NextResponse.json({ ok: true, layout: next });
}
