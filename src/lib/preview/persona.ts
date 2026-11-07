/**
 * Previewing a persona (menus and account picks 2026-11-05, pick 6A): staff and admins see GameShuffle as someone
 * with other interests and another plan, from their own account. Client-safe: the cookie's shape, the presets and
 * the words. The server side (who may preview, reading the cookie) is ./server.ts.
 *
 * Nothing here is ever saved to the account: the preview lives in one staff-only cookie, and pages that read
 * interests or the plan ask ./server.ts first.
 */

import { cleanInterests, interestList, type Interest } from "@/lib/interests/rules";

export const PERSONA_COOKIE = "gs_staff_view_as_persona";

export type PreviewPlan = "free" | "pro" | "supporter";
export const PREVIEW_PLANS: { id: PreviewPlan; label: string }[] = [
  { id: "free", label: "Free" },
  { id: "pro", label: "GS Pro" },
  { id: "supporter", label: "Supporter" },
];

export interface PersonaPreview {
  interests: Interest[];
  plan: PreviewPlan;
  /** Sections where the account has nothing of its own show sample data, marked Sample. */
  sample: boolean;
}

/** The six people the persona audit walked, as presets for the View as control. */
export const PERSONA_PRESETS: { id: string; label: string; preview: PersonaPreview }[] = [
  { id: "competitive", label: "Competitive", preview: { interests: ["competitive"], plan: "free", sample: true } },
  { id: "casual", label: "Casual", preview: { interests: ["daily"], plan: "free", sample: true } },
  { id: "family", label: "Friends & family", preview: { interests: ["daily", "home"], plan: "free", sample: true } },
  { id: "pokemon", label: "Pokémon", preview: { interests: ["daily", "pokemon"], plan: "free", sample: true } },
  { id: "streamer", label: "Streamer", preview: { interests: ["competitive", "stream"], plan: "pro", sample: true } },
  { id: "organizer", label: "Organizer", preview: { interests: ["home", "events"], plan: "free", sample: true } },
];

/** `i=competitive.pokemon~p=free~d=sample` (short, readable in devtools, only characters a cookie may hold). */
export function encodePersona(p: PersonaPreview): string {
  return `i=${cleanInterests(p.interests).join(".")}~p=${p.plan}~d=${p.sample ? "sample" : "mine"}`;
}

export function decodePersona(raw: string | null | undefined): PersonaPreview | null {
  if (!raw) return null;
  const parts = new Map(raw.split("~").map((kv) => { const i = kv.indexOf("="); return [kv.slice(0, i), kv.slice(i + 1)] as const; }));
  const plan = parts.get("p");
  if (plan !== "free" && plan !== "pro" && plan !== "supporter") return null;
  const interests = cleanInterests((parts.get("i") ?? "").split(".").filter(Boolean));
  return { interests, plan, sample: parts.get("d") !== "mine" };
}

/** Which preset this preview matches, if any. */
export function presetOf(p: PersonaPreview): string | null {
  const key = encodePersona(p);
  return PERSONA_PRESETS.find((x) => encodePersona(x.preview) === key)?.id ?? null;
}

/** "Competitive Mario Kart and Pokémon · Free · sample data" for the strip. */
export function personaLine(p: PersonaPreview): string {
  const who = p.interests.length ? interestList(p.interests) : "No interests picked";
  const plan = PREVIEW_PLANS.find((x) => x.id === p.plan)?.label ?? "Free";
  return `${who} · ${plan} · ${p.sample ? "sample data" : "your data"}`;
}
