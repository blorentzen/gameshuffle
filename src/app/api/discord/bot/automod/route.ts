/**
 * GET / PUT /api/discord/bot/automod
 *
 * Native Discord AutoMod (GS Pro), per server (?guild=). GameShuffle manages a custom keyword
 * blocklist rule + a preset (profanity/sexual/slurs) rule; Discord blocks the
 * offending messages itself. PUT { keywords: string[], presets: number[] }.
 */

import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { botServer, proRequired } from "@/lib/discord/botServer";
import { syncKeywordAutoMod, syncPresetAutoMod, deleteAutoModRule } from "@/lib/adapters/discord/adapter";

export const runtime = "nodejs";

const VALID_PRESETS = new Set([1, 2, 3]);

export async function GET(request: Request) {
  const ctx = await botServer(request, { allowRemoved: true });
  if (!ctx.ok) return ctx.response.status === 404 ? NextResponse.json({ ok: true, keywords: [], presets: [] }) : ctx.response;
  const { data } = await createServiceClient()
    .from("discord_automod")
    .select("keywords, presets")
    .eq("guild_id", ctx.guild.guildId)
    .maybeSingle();
  const row = data as { keywords: string[] | null; presets: number[] | null } | null;
  return NextResponse.json({ ok: true, keywords: row?.keywords ?? [], presets: row?.presets ?? [] });
}

export async function PUT(request: Request) {
  const ctx = await botServer(request);
  if (!ctx.ok) return ctx.response;
  const denied = proRequired(ctx);
  if (denied) return denied;
  const admin = createServiceClient();
  const guildId = ctx.guild.guildId;

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
    .eq("guild_id", guildId)
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
      user_id: ctx.userId,
      guild_id: guildId,
      keyword_rule_id: keywordRuleId,
      preset_rule_id: presetRuleId,
      keywords,
      presets,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "guild_id" },
  );

  return NextResponse.json({ ok: true });
}
