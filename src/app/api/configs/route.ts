/**
 * POST /api/configs  { randomizerSlug, configName, configData }
 *
 * Saves a setup for the signed-in account. The plan limit is checked here, on
 * the server (CONFIG_LIMITS: free 5, GS Pro unlimited, Pro worked out by
 * isProUser so Circuit 256, staff and beta count), because a browser check can
 * be skipped. Inserts use the service role; once this is live,
 * supabase/saved-configs-server-insert-m1.sql removes the browser's own insert
 * permission so this is the only way in.
 */

import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { isProUser } from "@/lib/subscription-server";
import { CONFIG_LIMITS } from "@/lib/subscription";

export const runtime = "nodejs";

const SHARE_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789";
function shareToken(): string {
  return [...randomBytes(8)].map((b) => SHARE_CHARS[b % SHARE_CHARS.length]).join("");
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in to save setups." }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { randomizerSlug?: unknown; configName?: unknown; configData?: unknown } | null;
  const slug = typeof body?.randomizerSlug === "string" ? body.randomizerSlug.slice(0, 80) : "";
  const name = typeof body?.configName === "string" ? body.configName.trim().slice(0, 100) : "";
  if (!slug || !name || !body?.configData || typeof body.configData !== "object") return NextResponse.json({ error: "Give the setup a name." }, { status: 400 });
  if (JSON.stringify(body.configData).length > 100_000) return NextResponse.json({ error: "That setup is too large to save." }, { status: 400 });

  const admin = createServiceClient();
  const limit = (await isProUser(user.id, admin)) ? CONFIG_LIMITS.pro : CONFIG_LIMITS.free;
  if (Number.isFinite(limit)) {
    const { count } = await admin.from("saved_configs").select("id", { count: "exact", head: true }).eq("user_id", user.id);
    if ((count ?? 0) >= limit) {
      return NextResponse.json({ error: `Free accounts can save up to ${limit} setups. Delete one in My Stuff, or keep every setup with GS Pro.`, limit: true }, { status: 403 });
    }
  }

  const { data, error } = await admin.from("saved_configs")
    .insert({ user_id: user.id, randomizer_slug: slug, config_name: name, config_data: body.configData, share_token: shareToken() })
    .select().single();
  if (error) {
    console.error("[configs] save failed:", error);
    return NextResponse.json({ error: "Couldn't save that setup. Try again." }, { status: 500 });
  }
  return NextResponse.json({ data });
}
