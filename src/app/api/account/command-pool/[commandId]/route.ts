/**
 * GET / POST /api/account/command-pool/[commandId]
 *
 * Streamer-facing view + create for a default command's response pool.
 * Pool commands (8ball, quote, hype, …) draw a weighted pick from
 * `gs_default_command_responses`, blending platform entries
 * (`community_id IS NULL`) with this community's own. The platform
 * admin editor is staff-only; this is the streamer's window into the
 * SAME table, scoped to their community.
 *
 *   GET  → platform entries (read-only) + this community's entries
 *   POST → add one community entry ({ response, weight? })
 *
 * Community entries are edited / removed via the sibling
 * `[responseId]` route. A streamer can never touch a platform entry.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { resolveCommunityIdForOwner } from "@/lib/economy/communityResolver";

export const runtime = "nodejs";

interface PoolEntry {
  id: string;
  response: string;
  weight: number;
  enabled: boolean;
  sort_order: number;
}

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

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ commandId: string }> },
) {
  const auth = await authedCommunityId();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const { commandId } = await params;
  if (!commandId) {
    return NextResponse.json({ error: "missing_command_id" }, { status: 400 });
  }
  const admin = createServiceClient();
  const { data, error } = await admin
    .from("gs_default_command_responses")
    .select("id, response, weight, enabled, sort_order, community_id")
    .eq("command_id", commandId)
    .or(`community_id.is.null,community_id.eq.${auth.communityId}`)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const rows =
    (data as (PoolEntry & { community_id: string | null })[] | null) ?? [];
  return NextResponse.json({
    ok: true,
    // Platform canon — read-only for the streamer.
    platform: rows
      .filter((r) => r.community_id === null && r.enabled)
      .map(({ response, weight }) => ({ response, weight })),
    // The community's own entries — editable.
    community: rows
      .filter((r) => r.community_id === auth.communityId)
      .map(({ id, response, weight, enabled, sort_order }) => ({
        id,
        response,
        weight,
        enabled,
        sort_order,
      })),
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ commandId: string }> },
) {
  const auth = await authedCommunityId();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const { commandId } = await params;
  if (!commandId) {
    return NextResponse.json({ error: "missing_command_id" }, { status: 400 });
  }
  const body = (await req.json().catch(() => null)) as {
    response?: string;
    weight?: number;
  } | null;
  if (!body) {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }
  const response = (body.response ?? "").trim();
  if (!response) {
    return NextResponse.json({ error: "response_required" }, { status: 400 });
  }
  const admin = createServiceClient();

  // Guard: the command must exist (avoid orphan pool rows).
  const { data: cmd } = await admin
    .from("gs_default_commands")
    .select("id")
    .eq("id", commandId)
    .maybeSingle();
  if (!cmd) {
    return NextResponse.json({ error: "unknown_command" }, { status: 404 });
  }

  // Append after the community's current last entry.
  const { data: last } = await admin
    .from("gs_default_command_responses")
    .select("sort_order")
    .eq("command_id", commandId)
    .eq("community_id", auth.communityId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextSort = ((last?.sort_order as number | undefined) ?? -1) + 1;
  // Default weight matches the platform default (100) so a community
  // entry has comparable pick odds to the canon out of the box.
  const weight = Math.max(1, Math.floor(body.weight ?? 100));

  const { data, error } = await admin
    .from("gs_default_command_responses")
    .insert({
      command_id: commandId,
      community_id: auth.communityId,
      response,
      weight,
      sort_order: nextSort,
      enabled: true,
    })
    .select("id, response, weight, enabled, sort_order")
    .single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true, entry: data as PoolEntry });
}
