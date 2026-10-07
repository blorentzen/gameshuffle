import "server-only";

/**
 * Platform > AI usage: how much the AI features get used, by whom and what it
 * costs in tokens, over the last 30 days. Reads `ai_usage` (who, feature,
 * when, tokens; never prompts or outputs) with the service role. Staff only
 * (the route checks).
 */

import { createServiceClient } from "@/lib/supabase/admin";
import { effectiveTier, normalizeTier } from "@/lib/subscription";
import { AI_FEATURES, type AiFeature } from "@/lib/ai/features";
import { aiLimits, type AiLimits } from "@/lib/ai/usage";
import { gsAddDays, gsDay, gsDayStart } from "@/lib/time/gsClock";

const DAY_MS = 24 * 60 * 60 * 1000;
type Plan = "free" | "pro" | "staff";

interface UsageRow { user_id: string; feature: string; created_at: string; input_tokens: number | null; output_tokens: number | null }

export interface AiFeatureStats { feature: string; label: string; free: boolean; day: number; week: number; month: number; users: number; inputTokens: number; outputTokens: number }
export interface AiTopUser { userId: string; name: string; handle: string | null; plan: Plan; uses: number; lastUsed: string; atLimit: boolean }

export interface AiUsageOverview {
  limits: AiLimits;
  totals: { day: number; week: number; month: number; usersDay: number; usersWeek: number; usersMonth: number; inputTokens: number; outputTokens: number };
  /** False until ai-usage-m2.sql adds the token columns. */
  tokensRecorded: boolean;
  byFeature: AiFeatureStats[];
  byPlan: { plan: Plan; uses: number; users: number }[];
  /** One row per Pacific day, oldest first: { day, pack, recap, setup, plan, tournament }. */
  daily: Record<string, string | number>[];
  topUsers: AiTopUser[];
  /** Accounts at their limit right now (free: today's tries used, Pacific day; Pro: the 30-day allowance used). */
  atLimit: { free: number; pro: number };
}

async function loadRows(since: string): Promise<{ rows: UsageRow[]; tokensRecorded: boolean }> {
  const svc = createServiceClient();
  const rows: UsageRow[] = [];
  let tokensRecorded = true;
  for (let from = 0; from < 50_000; from += 1000) {
    const cols = tokensRecorded ? "user_id, feature, created_at, input_tokens, output_tokens" : "user_id, feature, created_at";
    const { data, error } = await svc.from("ai_usage").select(cols).gte("created_at", since).order("created_at", { ascending: true }).range(from, from + 999);
    if (error && tokensRecorded && /input_tokens|output_tokens|column/i.test(error.message)) { tokensRecorded = false; from -= 1000; continue; }
    if (error) throw new Error(error.message);
    const page = (data ?? []) as unknown as UsageRow[];
    rows.push(...page.map((r) => ({ ...r, input_tokens: r.input_tokens ?? null, output_tokens: r.output_tokens ?? null })));
    if (page.length < 1000) break;
  }
  return { rows, tokensRecorded };
}

export async function aiUsageOverview(): Promise<AiUsageOverview> {
  const now = Date.now();
  const since30 = new Date(now - 30 * DAY_MS).toISOString();
  const [{ rows, tokensRecorded }, limits] = await Promise.all([loadRows(since30), aiLimits()]);

  const ids = [...new Set(rows.map((r) => r.user_id))];
  const people = new Map<string, { name: string; handle: string | null; plan: Plan }>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await createServiceClient().from("users")
      .select("id, username, display_name, subscription_tier, role, circuit_tier, circuit_status").in("id", ids.slice(i, i + 200));
    for (const u of (data ?? []) as { id: string; username: string | null; display_name: string | null; subscription_tier: string | null; role: string | null; circuit_tier: string | null; circuit_status: string | null }[]) {
      const staff = u.role === "staff" || u.role === "admin";
      const pro = effectiveTier({ tier: normalizeTier(u.subscription_tier), role: u.role, circuitTier: u.circuit_tier, circuitStatus: u.circuit_status }) === "pro";
      people.set(u.id, { name: u.display_name || u.username || "Unnamed account", handle: u.username, plan: staff ? "staff" : pro ? "pro" : "free" });
    }
  }
  const planOf = (id: string): Plan => people.get(id)?.plan ?? "free";

  const dayAgo = now - DAY_MS, weekAgo = now - 7 * DAY_MS;
  // Free tries reset at midnight Pacific; the chart's days are Pacific days.
  const todayStart = gsDayStart(gsDay(now)).getTime();
  const users = { day: new Set<string>(), week: new Set<string>(), month: new Set<string>() };
  const totals = { day: 0, week: 0, month: 0, usersDay: 0, usersWeek: 0, usersMonth: 0, inputTokens: 0, outputTokens: 0 };
  const features = new Map<string, AiFeatureStats & { userSet: Set<string> }>();
  for (const f of Object.keys(AI_FEATURES) as AiFeature[]) {
    features.set(f, { feature: f, label: AI_FEATURES[f].label, free: AI_FEATURES[f].free, day: 0, week: 0, month: 0, users: 0, inputTokens: 0, outputTokens: 0, userSet: new Set() });
  }
  const plans = new Map<Plan, { uses: number; users: Set<string> }>([["free", { uses: 0, users: new Set() }], ["pro", { uses: 0, users: new Set() }], ["staff", { uses: 0, users: new Set() }]]);
  const perUser = new Map<string, { uses: number; last: string; day: number }>();
  const dayKey = (t: number) => gsDay(t);
  const daily = new Map<string, Record<string, string | number>>();
  for (let i = 29; i >= 0; i--) {
    const k = gsAddDays(gsDay(now), -i);
    daily.set(k, { day: new Date(`${k}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }), ...Object.fromEntries(Object.keys(AI_FEATURES).map((f) => [f, 0])) });
  }

  for (const r of rows) {
    const t = Date.parse(r.created_at);
    const f = features.get(r.feature) ?? (() => {
      const s = { feature: r.feature, label: r.feature, free: false, day: 0, week: 0, month: 0, users: 0, inputTokens: 0, outputTokens: 0, userSet: new Set<string>() };
      features.set(r.feature, s);
      return s;
    })();
    const inT = r.input_tokens ?? 0, outT = r.output_tokens ?? 0;
    totals.month++; users.month.add(r.user_id); f.month++; f.userSet.add(r.user_id);
    totals.inputTokens += inT; totals.outputTokens += outT; f.inputTokens += inT; f.outputTokens += outT;
    if (t >= weekAgo) { totals.week++; users.week.add(r.user_id); f.week++; }
    if (t >= dayAgo) { totals.day++; users.day.add(r.user_id); f.day++; }
    const p = plans.get(planOf(r.user_id))!;
    p.uses++; p.users.add(r.user_id);
    const u = perUser.get(r.user_id) ?? { uses: 0, last: r.created_at, day: 0 };
    u.uses++; u.last = r.created_at; if (t >= todayStart) u.day++;
    perUser.set(r.user_id, u);
    const d = daily.get(dayKey(t));
    if (d) d[r.feature] = (Number(d[r.feature]) || 0) + 1;
  }
  totals.usersDay = users.day.size; totals.usersWeek = users.week.size; totals.usersMonth = users.month.size;

  const isAtLimit = (id: string, u: { uses: number; day: number }) => {
    const plan = planOf(id);
    if (plan === "staff") return false;
    return plan === "pro" ? u.uses >= limits.proPer30d : u.day >= limits.freePerDay;
  };
  const atLimit = { free: 0, pro: 0 };
  for (const [id, u] of perUser) if (isAtLimit(id, u)) atLimit[planOf(id) === "pro" ? "pro" : "free"]++;

  const topUsers: AiTopUser[] = [...perUser.entries()]
    .sort((a, b) => b[1].uses - a[1].uses || b[1].last.localeCompare(a[1].last))
    .slice(0, 15)
    .map(([id, u]) => ({ userId: id, name: people.get(id)?.name ?? "Deleted account", handle: people.get(id)?.handle ?? null, plan: planOf(id), uses: u.uses, lastUsed: u.last, atLimit: isAtLimit(id, u) }));

  return {
    limits,
    totals,
    tokensRecorded,
    byFeature: [...features.values()].map(({ userSet, ...f }) => ({ ...f, users: userSet.size })).sort((a, b) => b.month - a.month),
    byPlan: [...plans.entries()].map(([plan, p]) => ({ plan, uses: p.uses, users: p.users.size })),
    daily: [...daily.values()],
    topUsers,
    atLimit,
  };
}
