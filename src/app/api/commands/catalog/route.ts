/**
 * GET   /api/commands/catalog → { slug, setup, commands } for the signed-in
 *       streamer's channel (Streaming ▸ Chat ▸ Commands).
 * PATCH /api/commands/catalog { key, enabled } switches one command on or
 *       off, whatever kind it is: a built-in (gs_command_toggles), a reply
 *       (gs_default_command_overrides), your own (gs_custom_commands) or an
 *       event (gs_event_overrides). Only `enabled` changes: a custom reply
 *       text or event wording stays as it was.
 * Editing a reply's text or your own command still goes through
 * /api/account/default-command-overrides and /api/account/custom-commands.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { resolveCommunityIdForOwner } from "@/lib/economy/communityResolver";
import { getCommunityById } from "@/lib/economy/community";
import { commandCatalog } from "@/lib/commands/catalog";
import { setCommandEnabled } from "@/lib/twitch/commands/toggles";
import { invalidateCustomCommandCache } from "@/lib/twitch/commands/customCommands";
import { listCommandReference } from "@/lib/twitch/commands/reference";

export const runtime = "nodejs";

async function owner() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const communityId = await resolveCommunityIdForOwner(user.id).catch(() => null);
  return { userId: user.id, communityId };
}

export async function GET() {
  const me = await owner();
  if (!me) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const [catalog, community] = await Promise.all([
    commandCatalog(me.userId, me.communityId),
    me.communityId ? getCommunityById(me.communityId) : Promise.resolve(null),
  ]);
  return NextResponse.json({ ok: true, slug: community?.slug ?? null, hasCommunity: !!me.communityId, ...catalog });
}

export async function PATCH(request: Request) {
  const me = await owner();
  if (!me) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (!me.communityId) return NextResponse.json({ error: "no_community" }, { status: 400 });
  const body = (await request.json().catch(() => ({}))) as { key?: string; enabled?: boolean };
  if (typeof body.key !== "string" || typeof body.enabled !== "boolean") {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  const cut = body.key.indexOf(":");
  const kind = body.key.slice(0, cut);
  const id = body.key.slice(cut + 1);
  const admin = createServiceClient();

  if (kind === "builtin") {
    if (!listCommandReference().some((c) => c.name === id)) return NextResponse.json({ error: "unknown_command" }, { status: 404 });
    const res = await setCommandEnabled({ communityId: me.communityId, name: id, enabled: body.enabled, userId: me.userId });
    return res.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "not_saved", detail: res.error }, { status: 500 });
  }
  if (kind === "reply") {
    const { error } = await admin.from("gs_default_command_overrides")
      .upsert({ community_id: me.communityId, command_id: id, enabled: body.enabled }, { onConflict: "community_id,command_id" });
    return error ? NextResponse.json({ error: error.message }, { status: 400 }) : NextResponse.json({ ok: true });
  }
  if (kind === "custom") {
    const { error } = await admin.from("gs_custom_commands").update({ enabled: body.enabled }).eq("id", id).eq("community_id", me.communityId);
    invalidateCustomCommandCache(me.communityId);
    return error ? NextResponse.json({ error: error.message }, { status: 400 }) : NextResponse.json({ ok: true });
  }
  if (kind === "event") {
    const { error } = await admin.from("gs_event_overrides")
      .upsert({ community_id: me.communityId, event_id: id, enabled: body.enabled }, { onConflict: "community_id,event_id" });
    return error ? NextResponse.json({ error: error.message }, { status: 400 }) : NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "invalid_request" }, { status: 400 });
}
