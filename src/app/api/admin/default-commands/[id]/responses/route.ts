/**
 * GET  /api/admin/default-commands/[id]/responses → list pool entries
 * POST /api/admin/default-commands/[id]/responses → create or update
 *   (body.response_id present = update existing, absent = insert new)
 *
 * Manages the random-pick response pool for a default command (the
 * 8-Ball canon, coinflip outcomes, hype variants, future quote/
 * compliment lists). Engine wiring lands with the rest of the
 * dispatcher fallback; this API powers the inline editor inside the
 * Platform Admin → Commands modal.
 *
 * Staff/admin only.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { isStaffRole } from "@/lib/subscription";

export const runtime = "nodejs";

interface ResponseRow {
  id: string;
  command_id: string;
  response: string;
  weight: number;
  sort_order: number;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

interface PostBody {
  response_id?: string;
  response?: string;
  weight?: number;
  sort_order?: number;
  enabled?: boolean;
}

async function requireStaff(): Promise<
  { ok: true } | { ok: false; status: number; error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, status: 401, error: "unauthenticated" };
  const admin = createServiceClient();
  const { data } = await admin
    .from("users")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  const role = (data as { role: string | null } | null)?.role ?? null;
  if (!isStaffRole(role)) {
    return { ok: false, status: 403, error: "forbidden" };
  }
  return { ok: true };
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireStaff();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const { id: commandId } = await params;
  if (!commandId) {
    return NextResponse.json({ error: "missing_command_id" }, { status: 400 });
  }
  const admin = createServiceClient();
  // Platform admin only sees platform-default entries — community-
  // scoped contributions live in the streamer's account UI and are
  // not editable from this surface (see the wall-of-separation
  // comment in the upsert / delete handlers).
  const { data, error } = await admin
    .from("gs_default_command_responses")
    .select(
      "id, command_id, response, weight, sort_order, enabled, created_at, updated_at",
    )
    .eq("command_id", commandId)
    .is("community_id", null)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({
    ok: true,
    responses: (data ?? []) as ResponseRow[],
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireStaff();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const { id: commandId } = await params;
  if (!commandId) {
    return NextResponse.json({ error: "missing_command_id" }, { status: 400 });
  }
  const body = (await req.json().catch(() => null)) as PostBody | null;
  if (!body) {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }
  const response = (body.response ?? "").trim();
  if (!response) {
    return NextResponse.json({ error: "response_required" }, { status: 400 });
  }
  const weight = Math.max(1, Math.floor(body.weight ?? 100));
  const sort_order = Math.floor(body.sort_order ?? 0);
  const enabled = body.enabled !== false;

  const admin = createServiceClient();

  if (body.response_id) {
    // Ownership check — refuse cross-command edits so a buggy
    // client can't accidentally rewrite the 8ball canon while
    // editing coinflip. Also refuse cross-scope edits: admin can
    // only touch platform-default entries (community_id IS NULL).
    // Community-scoped contributions (added via `!quote add` etc.)
    // are streamer-owned data; the wall between platform-curated
    // content and community content is the integrity guarantee we
    // promise streamers.
    const { data: existing } = await admin
      .from("gs_default_command_responses")
      .select("id, command_id, community_id")
      .eq("id", body.response_id)
      .maybeSingle();
    const row = existing as
      | { id: string; command_id: string; community_id: string | null }
      | null;
    if (!row || row.command_id !== commandId) {
      return NextResponse.json(
        { error: "response_not_found" },
        { status: 404 },
      );
    }
    if (row.community_id !== null) {
      return NextResponse.json(
        {
          error:
            "Cannot edit community-scoped response entries from the platform admin — those are streamer-owned.",
        },
        { status: 403 },
      );
    }
    const { error } = await admin
      .from("gs_default_command_responses")
      .update({ response, weight, sort_order, enabled })
      .eq("id", row.id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ ok: true, id: row.id });
  }

  const { data, error } = await admin
    .from("gs_default_command_responses")
    .insert({
      command_id: commandId,
      response,
      weight,
      sort_order,
      enabled,
    })
    .select("id")
    .single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true, id: (data as { id: string }).id });
}
