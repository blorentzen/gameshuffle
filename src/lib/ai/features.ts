/**
 * The AI features and which ones free accounts may try (client-safe). Free
 * accounts get the daily allowance on the free ones; the rest are GS Pro.
 * The server enforces this in aiAccess; the client only uses it to explain.
 */

export type AiFeature = "pack" | "recap" | "setup" | "plan" | "tournament";

export const AI_FEATURES: Record<AiFeature, { free: boolean; label: string }> = {
  pack: { free: false, label: "Making lists with AI" },
  recap: { free: false, label: "AI recaps" },
  setup: { free: true, label: "AI setup" },
  plan: { free: true, label: "The night planner" },
  tournament: { free: true, label: "The tournament helper" },
};

export function isAiFeature(x: unknown): x is AiFeature {
  return typeof x === "string" && x in AI_FEATURES;
}

/** What the access check tells the page (GET /api/ai/access). */
export interface AiAccessInfo {
  feature: AiFeature;
  /** null = signed out. */
  plan: "free" | "pro" | "staff" | null;
  /** Generations left now: null = unlimited (staff) or signed out. */
  remaining: number | null;
  limits: { proPer30d: number; freePerDay: number };
  configured: boolean;
}

/** Why someone can't use a feature right now, before they try (null = they can). */
export type AiBlock = "signin" | "pro" | "daily" | "allowance";

export function aiBlock(info: AiAccessInfo | null): AiBlock | null {
  if (!info) return null;
  if (!info.plan) return "signin";
  if (info.plan === "free" && !AI_FEATURES[info.feature].free) return "pro";
  if (info.remaining === 0) return info.plan === "pro" ? "allowance" : "daily";
  return null;
}
