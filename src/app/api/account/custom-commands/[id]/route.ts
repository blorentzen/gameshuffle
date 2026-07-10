/**
 * PATCH / DELETE /api/account/custom-commands/[id]
 *
 * PATCH  — partial-update a custom command row (trigger, response,
 *          actor, cooldown, enabled). Only the fields present in the
 *          body are touched; the helper re-normalizes a changed trigger
 *          and re-registers the canonical name so chat picks up the edit
 *          within the same tick.
 * DELETE — removes the row and unregisters its trigger.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveCommunityIdForOwner } from "@/lib/economy/communityResolver";
import {
  deleteCustomCommandById,
  updateCustomCommandById,
} from "@/lib/twitch/commands/customCommands";

export const runtime = "nodejs";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const communityId = await resolveCommunityIdForOwner(user.id);
  if (!communityId) {
    return NextResponse.json({ error: "no_community" }, { status: 404 });
  }
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "missing_id" }, { status: 400 });
  }

  const body = (await req.json().catch(() => null)) as {
    trigger?: string;
    responseTmpl?: string;
    actor?: "everyone" | "crew" | "host";
    cooldownSeconds?: number;
    enabled?: boolean;
  } | null;
  if (!body) {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }

  // Build a partial patch from only the defined fields, validating each
  // present one. An empty patch is rejected by the helper (`no_changes`).
  const patch: {
    trigger?: string;
    responseTmpl?: string;
    actor?: "everyone" | "crew" | "host";
    cooldownSeconds?: number;
    enabled?: boolean;
  } = {};
  if (body.trigger !== undefined) {
    const t = body.trigger.trim();
    if (!t) {
      return NextResponse.json({ error: "trigger_required" }, { status: 400 });
    }
    patch.trigger = t;
  }
  if (body.responseTmpl !== undefined) {
    const r = body.responseTmpl.trim();
    if (!r) {
      return NextResponse.json({ error: "response_required" }, { status: 400 });
    }
    patch.responseTmpl = r;
  }
  if (body.actor !== undefined) patch.actor = body.actor;
  if (body.cooldownSeconds !== undefined) {
    if (typeof body.cooldownSeconds !== "number" || body.cooldownSeconds < 0) {
      return NextResponse.json({ error: "invalid_cooldown" }, { status: 400 });
    }
    patch.cooldownSeconds = Math.floor(body.cooldownSeconds);
  }
  if (body.enabled !== undefined) patch.enabled = body.enabled;

  const result = await updateCustomCommandById({ communityId, id, ...patch });
  if (!result.ok) {
    return NextResponse.json(
      { error: result.reason ?? "update_failed" },
      { status: 400 },
    );
  }
  return NextResponse.json({ ok: true, row: result.row });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const communityId = await resolveCommunityIdForOwner(user.id);
  if (!communityId) {
    return NextResponse.json({ error: "no_community" }, { status: 404 });
  }
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "missing_id" }, { status: 400 });
  }
  const result = await deleteCustomCommandById({ communityId, id });
  if (!result.ok) {
    return NextResponse.json(
      { error: result.reason ?? "delete_failed" },
      { status: 400 },
    );
  }
  return NextResponse.json({ ok: true });
}
