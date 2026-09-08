/**
 * GET/POST /api/account/chat-overlay — the streamer's chat-timeline overlay
 * config. Read is open to the owner; saving (enable + settings) is Pro-gated,
 * matching the other overlay tools.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { effectiveTier, normalizeTier } from "@/lib/subscription";
import {
  getChatOverlaySettings,
  isChatOverlayEnabled,
  saveChatOverlaySettings,
  type ChatOverlayAnimation,
  type ChatOverlayTheme,
} from "@/lib/overlay/chat";

export const runtime = "nodejs";

const THEMES = ["default", "midnight", "mint", "sunset", "mono"];
const ANIMATIONS = ["slide", "fade", "none"];
const ROLES = ["broadcaster", "moderator", "vip", "subscriber", "viewer"];

async function tierFor(userId: string): Promise<string> {
  const admin = createServiceClient();
  const { data } = await admin
    .from("users")
    .select("subscription_tier, role")
    .eq("id", userId)
    .maybeSingle();
  return effectiveTier({
    tier: normalizeTier(data?.subscription_tier as string | null),
    role: (data?.role as string | null) ?? null,
  });
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const [settings, enabled, tier] = await Promise.all([
    getChatOverlaySettings(user.id),
    isChatOverlayEnabled(user.id),
    tierFor(user.id),
  ]);
  return NextResponse.json({ ok: true, enabled, settings, isPro: tier === "pro" });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  if ((await tierFor(user.id)) !== "pro") {
    return NextResponse.json({ error: "pro_required" }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const patch: Parameters<typeof saveChatOverlaySettings>[1] = {};

  if (typeof body.enabled === "boolean") patch.enabled = body.enabled;
  if (typeof body.theme === "string" && THEMES.includes(body.theme)) patch.theme = body.theme as ChatOverlayTheme;
  if (typeof body.animation === "string" && ANIMATIONS.includes(body.animation))
    patch.animation = body.animation as ChatOverlayAnimation;
  if (Array.isArray(body.showRoles)) {
    const roles = body.showRoles.filter((r): r is string => typeof r === "string" && ROLES.includes(r));
    patch.showRoles = roles.length ? roles : ["viewer"];
  }
  if (typeof body.hideCommands === "boolean") patch.hideCommands = body.hideCommands;
  if (typeof body.showGsBadge === "boolean") patch.showGsBadge = body.showGsBadge;
  if (typeof body.maxMessages === "number") patch.maxMessages = Math.min(Math.max(Math.round(body.maxMessages), 3), 30);

  await saveChatOverlaySettings(user.id, patch);
  return NextResponse.json({ ok: true });
}
