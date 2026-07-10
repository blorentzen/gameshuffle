/**
 * PATCH / DELETE /api/account/command-pool/[commandId]/[responseId]
 *
 * Edit or remove ONE of this community's own pool entries. Every write
 * is scoped by `community_id = <caller's community>`, so a streamer can
 * never mutate a platform-canon entry (those live under community_id
 * NULL and are staff-only).
 *
 *   PATCH  → update response / weight / enabled on a community entry
 *   DELETE → remove a community entry
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { resolveCommunityIdForOwner } from "@/lib/economy/communityResolver";

export const runtime = "nodejs";

async function authedCommunityId(): Promise<
  | { ok: true; communityId: string }
  | { ok: false; status: number; error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, status: 401, error: "unauthenticated" };
  const communityId = await resolveCommunityIdForOwner(user.id);
  if (!communityId) return { ok: false, status: 404, error: "no_community" };
  return { ok: true, communityId };
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ commandId: string; responseId: string }> },
) {
  const auth = await authedCommunityId();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const { commandId, responseId } = await params;
  if (!commandId || !responseId) {
    return NextResponse.json({ error: "missing_id" }, { status: 400 });
  }
  const body = (await req.json().catch(() => null)) as {
    response?: string;
    weight?: number;
    enabled?: boolean;
  } | null;
  if (!body) {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }
  const patch: { response?: string; weight?: number; enabled?: boolean } = {};
  if (body.response !== undefined) {
    const r = body.response.trim();
    if (!r) {
      return NextResponse.json({ error: "response_required" }, { status: 400 });
    }
    patch.response = r;
  }
  if (body.weight !== undefined) {
    if (typeof body.weight !== "number" || body.weight < 1) {
      return NextResponse.json({ error: "invalid_weight" }, { status: 400 });
    }
    patch.weight = Math.floor(body.weight);
  }
  if (body.enabled !== undefined) patch.enabled = body.enabled;
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "no_changes" }, { status: 400 });
  }

  const admin = createServiceClient();
  const { data, error } = await admin
    .from("gs_default_command_responses")
    .update(patch)
    .eq("id", responseId)
    .eq("command_id", commandId)
    .eq("community_id", auth.communityId) // wall: own entries only
    .select("id, response, weight, enabled, sort_order")
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (!data) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, entry: data });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ commandId: string; responseId: string }> },
) {
  const auth = await authedCommunityId();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const { commandId, responseId } = await params;
  if (!commandId || !responseId) {
    return NextResponse.json({ error: "missing_id" }, { status: 400 });
  }
  const admin = createServiceClient();
  const { data, error } = await admin
    .from("gs_default_command_responses")
    .delete()
    .eq("id", responseId)
    .eq("command_id", commandId)
    .eq("community_id", auth.communityId) // wall: own entries only
    .select("id")
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (!data) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
