/**
 * GET / POST handlers for the streamer-level custom-commands editor
 * on `/account?tab=chat-commands`.
 *
 * GET   /api/account/custom-commands       — list all rows for the
 *                                            authenticated streamer's
 *                                            community
 * POST  /api/account/custom-commands       — upsert one row
 *                                            (create or overwrite)
 *
 * Delete is a separate path (`/[id]/route.ts`) so the URL carries
 * the identifier — easier for the client to model with a simple
 * fetch + path param.
 *
 * Authorization: requires an authenticated user + a community
 * resolved from their Twitch identity. Returns 404 when the user
 * hasn't connected Twitch yet (so the UI can render an empty-state
 * with a deep link to /account?tab=integrations).
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveCommunityIdForOwner } from "@/lib/economy/communityResolver";
import {
  upsertCustomCommand,
  type CustomCommandRow,
} from "@/lib/twitch/commands/customCommands";
import { createServiceClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

async function authedCommunityId(): Promise<
  | { ok: true; userId: string; communityId: string }
  | { ok: false; status: number; error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, status: 401, error: "unauthenticated" };
  const communityId = await resolveCommunityIdForOwner(user.id);
  if (!communityId)
    return {
      ok: false,
      status: 404,
      error: "no_community",
    };
  return { ok: true, userId: user.id, communityId };
}

export async function GET() {
  const auth = await authedCommunityId();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const admin = createServiceClient();
  // Parallel-fetch the community slug alongside the rows so the
  // tab can render links to the public quote / list pages without
  // a second round-trip.
  const [{ data, error }, { data: communityRow }] = await Promise.all([
    admin
      .from("gs_custom_commands")
      .select(
        "id, community_id, trigger, response_tmpl, actor, cooldown_s, enabled, use_count",
      )
      .eq("community_id", auth.communityId)
      .order("trigger", { ascending: true }),
    admin
      .from("gs_communities")
      .select("slug, display_name")
      .eq("id", auth.communityId)
      .maybeSingle(),
  ]);
  if (error) {
    console.error("[/api/account/custom-commands] list failed:", error);
    return NextResponse.json({ error: "lookup_failed" }, { status: 500 });
  }
  const community = communityRow as
    | { slug: string; display_name: string | null }
    | null;
  return NextResponse.json({
    ok: true,
    rows: (data as CustomCommandRow[] | null) ?? [],
    community: community
      ? { slug: community.slug, displayName: community.display_name }
      : null,
  });
}

export async function POST(req: NextRequest) {
  const auth = await authedCommunityId();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const body = (await req.json().catch(() => null)) as {
    trigger?: string;
    responseTmpl?: string;
    actor?: "everyone" | "crew" | "host";
    cooldownSeconds?: number;
  } | null;
  if (!body) {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }
  const trigger = body.trigger?.trim();
  const responseTmpl = body.responseTmpl?.trim();
  if (!trigger || !responseTmpl) {
    return NextResponse.json(
      { error: "trigger_and_response_required" },
      { status: 400 },
    );
  }
  const result = await upsertCustomCommand({
    communityId: auth.communityId,
    trigger,
    responseTmpl,
    actor: body.actor ?? "everyone",
    cooldownSeconds:
      typeof body.cooldownSeconds === "number" && body.cooldownSeconds >= 0
        ? Math.floor(body.cooldownSeconds)
        : 5,
  });
  if (!result.ok) {
    return NextResponse.json(
      { error: result.reason ?? "upsert_failed" },
      { status: 400 },
    );
  }
  return NextResponse.json({ ok: true, row: result.row });
}
