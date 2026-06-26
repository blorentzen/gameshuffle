/**
 * GET  /api/account/anthem/policy  → { policy }  (this streamer's channel
 *                                     walk-up policy; defaults if unset)
 * PUT  /api/account/anthem/policy  → upsert (partial) the channel policy
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getChannelPolicy, upsertChannelPolicy } from "@/lib/anthems/store";
import type { AnthemRole, AnthemTrigger, ChannelAnthemPolicy } from "@/lib/anthems/types";

export const runtime = "nodejs";

const TRIGGERS: AnthemTrigger[] = ["first_chat", "session_join", "channel_points", "manual"];
const ROLES: AnthemRole[] = ["subscriber", "vip", "moderator", "mvp", "everyone"];

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const policy = await getChannelPolicy(user.id);
  return NextResponse.json({ ok: true, policy });
}

export async function PUT(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as Partial<ChannelAnthemPolicy>;
  const patch: Partial<Omit<ChannelAnthemPolicy, "ownerUserId" | "updatedAt">> = {};

  if (typeof body.enabled === "boolean") patch.enabled = body.enabled;
  if (typeof body.allowCustom === "boolean") patch.allowCustom = body.allowCustom;
  if (typeof body.trigger === "string" && TRIGGERS.includes(body.trigger)) patch.trigger = body.trigger;
  if (Array.isArray(body.eligibleRoles)) {
    patch.eligibleRoles = body.eligibleRoles.filter((r): r is AnthemRole => ROLES.includes(r as AnthemRole));
  }
  if (Number.isFinite(body.volume)) patch.volume = Number(body.volume);
  if (Number.isFinite(body.cooldownSeconds)) patch.cooldownSeconds = Number(body.cooldownSeconds);
  if (Number.isFinite(body.maxDurationMs)) patch.maxDurationMs = Number(body.maxDurationMs);

  const policy = await upsertChannelPolicy(user.id, patch);
  if (!policy) return NextResponse.json({ error: "save_failed" }, { status: 500 });
  return NextResponse.json({ ok: true, policy });
}
