/**
 * Streamer-facing API for per-community overrides on the platform
 * default-command library.
 *
 * GET   /api/account/default-command-overrides
 *   Returns the full platform catalog joined with this community's
 *   override row (if any). The UI uses this to render tri-state
 *   tiles per command: Off / Use default / Override with custom.
 *
 * PUT   /api/account/default-command-overrides
 *   Upserts a single override. Body shape:
 *     { command_id, enabled, custom_response? }
 *   When the streamer wants "use default" we DELETE their override
 *   instead — see the DELETE handler. When they want "override
 *   with custom", they PUT with `enabled: true` and a non-empty
 *   `custom_response`. When they want "off", they PUT with
 *   `enabled: false` (custom_response optional).
 *
 * DELETE /api/account/default-command-overrides?command_id=…
 *   Removes the override row → command falls back to its
 *   `default_enabled` + platform `response_template`. This is the
 *   way to return to "Use default" without leaving a stale
 *   override row in the DB.
 *
 * Platform Admin edits to the catalog (`response_template`,
 * `enabled`, etc.) never touch this table — see the non-clobber
 * guarantee comment in the admin event/command APIs. The streamer's
 * customization survives every platform update.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { resolveCommunityIdForOwner } from "@/lib/economy/communityResolver";

export const runtime = "nodejs";

interface CommandRow {
  id: string;
  trigger: string;
  aliases: string[];
  category: "info" | "fun" | "engagement" | "wholesome" | "game";
  response_template: string | null;
  handler: string | null;
  description: string;
  default_enabled: boolean;
  enabled: boolean;
  cooldown_seconds: number;
  min_authority: "viewer" | "vip" | "mod" | "host";
}

interface OverrideRow {
  command_id: string;
  enabled: boolean;
  custom_response: string | null;
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
  if (!communityId)
    return { ok: false, status: 404, error: "no_community" };
  return { ok: true, communityId };
}

export async function GET() {
  const auth = await authedCommunityId();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const admin = createServiceClient();
  const [commandsRes, overridesRes] = await Promise.all([
    admin
      .from("gs_default_commands")
      .select(
        "id, trigger, aliases, category, response_template, handler, description, default_enabled, enabled, cooldown_seconds, min_authority",
      )
      .eq("enabled", true) // platform kill-switched commands stay hidden
      .order("category", { ascending: true })
      .order("trigger", { ascending: true }),
    admin
      .from("gs_default_command_overrides")
      .select("command_id, enabled, custom_response")
      .eq("community_id", auth.communityId),
  ]);
  if (commandsRes.error) {
    return NextResponse.json(
      { error: commandsRes.error.message },
      { status: 500 },
    );
  }
  if (overridesRes.error) {
    return NextResponse.json(
      { error: overridesRes.error.message },
      { status: 500 },
    );
  }
  const commands = (commandsRes.data as CommandRow[] | null) ?? [];
  const overrides = (overridesRes.data as OverrideRow[] | null) ?? [];
  const overrideByCommand = new Map<string, OverrideRow>();
  for (const o of overrides) overrideByCommand.set(o.command_id, o);
  return NextResponse.json({
    ok: true,
    commands: commands.map((c) => ({
      ...c,
      override: overrideByCommand.get(c.id) ?? null,
    })),
  });
}

export async function PUT(req: NextRequest) {
  const auth = await authedCommunityId();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const body = (await req.json().catch(() => null)) as {
    command_id?: string;
    enabled?: boolean;
    custom_response?: string | null;
  } | null;
  if (!body || !body.command_id) {
    return NextResponse.json(
      { error: "missing_command_id" },
      { status: 400 },
    );
  }
  const admin = createServiceClient();
  // Verify the command exists + isn't platform-disabled. Stops a
  // streamer from creating an override on a deleted/disabled
  // platform command (orphan override that never fires).
  const { data: cmdRow } = await admin
    .from("gs_default_commands")
    .select("id, enabled")
    .eq("id", body.command_id)
    .maybeSingle();
  const cmd = cmdRow as { id: string; enabled: boolean } | null;
  if (!cmd || !cmd.enabled) {
    return NextResponse.json(
      { error: "command_not_found" },
      { status: 404 },
    );
  }
  const enabled = body.enabled !== false;
  // Empty / whitespace-only custom_response = no override on the
  // response (just an enable/disable toggle). Lets streamers opt
  // into the default response while still touching the row to
  // pin the enable state.
  const customResponse =
    typeof body.custom_response === "string" && body.custom_response.trim()
      ? body.custom_response.trim()
      : null;
  const { error } = await admin
    .from("gs_default_command_overrides")
    .upsert(
      {
        community_id: auth.communityId,
        command_id: body.command_id,
        enabled,
        custom_response: customResponse,
      },
      { onConflict: "community_id,command_id" },
    );
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const auth = await authedCommunityId();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const { searchParams } = new URL(req.url);
  const commandId = searchParams.get("command_id");
  if (!commandId) {
    return NextResponse.json(
      { error: "missing_command_id" },
      { status: 400 },
    );
  }
  const admin = createServiceClient();
  const { error } = await admin
    .from("gs_default_command_overrides")
    .delete()
    .eq("community_id", auth.communityId)
    .eq("command_id", commandId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
