/**
 * GET / PUT /api/discord/bot/automod
 *
 * Native Discord AutoMod (GS Pro). GameShuffle manages a custom keyword
 * blocklist rule + a preset (profanity/sexual/slurs) rule; Discord blocks the
 * offending messages itself. PUT { keywords: string[], presets: number[] }.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { effectiveTier, normalizeTier } from "@/lib/subscription";
import { syncKeywordAutoMod, syncPresetAutoMod, deleteAutoModRule } from "@/lib/adapters/discord/adapter";

export const runtime = "nodejs";

const VALID_PRESETS = new Set([1, 2, 3]);

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });

  const { data } = await createServiceClient()
    .from("discord_automod")
    .select("keywords, presets")
    .eq("user_id", user.id)
    .maybeSingle();
  const row = data as { keywords: string[] | null; presets: number[] | null } | null;
  return NextResponse.json({ ok: true, keywords: row?.keywords ?? [], presets: row?.presets ?? [] });
}

export async function PUT(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });

  const admin = createServiceClient();
  const { data: profile } = await admin
    .from("users")
    .select("discord_guild_id, subscription_tier, role")
    .eq("id", user.id)
    .maybeSingle();
  const p = profile as { discord_guild_id: string | null; subscription_tier: string | null; role: string | null } | null;
  const isPro = effectiveTier({ tier: normalizeTier(p?.subscription_tier ?? null), role: p?.role ?? null }) === "pro";
  if (!isPro) return NextResponse.json({ ok: false, error: "pro_required" }, { status: 403 });
  if (!p?.discord_guild_id) return NextResponse.json({ ok: false, error: "bot_not_installed" }, { status: 404 });
  const guildId = p.discord_guild_id;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }
  const b = body as { keywords?: unknown; presets?: unknown };
  const keywords = (Array.isArray(b.keywords) ? b.keywords : [])
    .filter((k): k is string => typeof k === "string")
    .map((k) => k.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 200);
  const presets = [...new Set((Array.isArray(b.presets) ? b.presets : []).filter((n): n is number => typeof n === "number" && VALID_PRESETS.has(n)))];

  // Existing rule ids (so we update in place rather than pile up rules).
  const { data: existing } = await admin
    .from("discord_automod")
    .select("keyword_rule_id, preset_rule_id")
    .eq("user_id", user.id)
    .maybeSingle();
  const e = existing as { keyword_rule_id: string | null; preset_rule_id: string | null } | null;

  // Keyword rule: sync when there are words, delete when cleared.
  let keywordRuleId: string | null = e?.keyword_rule_id ?? null;
  if (keywords.length) {
    keywordRuleId = await syncKeywordAutoMod(guildId, keywordRuleId, keywords);
  } else if (keywordRuleId) {
    await deleteAutoModRule(guildId, keywordRuleId);
    keywordRuleId = null;
  }

  // Preset rule: same.
  let presetRuleId: string | null = e?.preset_rule_id ?? null;
  if (presets.length) {
    presetRuleId = await syncPresetAutoMod(guildId, presetRuleId, presets);
  } else if (presetRuleId) {
    await deleteAutoModRule(guildId, presetRuleId);
    presetRuleId = null;
  }

  await admin.from("discord_automod").upsert(
    {
      user_id: user.id,
      guild_id: guildId,
      keyword_rule_id: keywordRuleId,
      preset_rule_id: presetRuleId,
      keywords,
      presets,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  return NextResponse.json({ ok: true });
}
