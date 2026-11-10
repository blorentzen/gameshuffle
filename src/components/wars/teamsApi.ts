/** The Teams page's calls to /api/war/teams and its plain-words answers. Client-side. */

import type { TeamsView } from "@/lib/wars/teamView";

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string; data: Record<string, unknown> };

export async function teamsApi<T>(path: string, method: "GET" | "POST" | "PATCH" | "DELETE", body?: unknown): Promise<ApiResult<T>> {
  const res = await fetch(path, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  }).catch(() => null);
  if (!res) return { ok: false, error: "network", data: {} };
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) return { ok: false, error: typeof data.error === "string" ? data.error : "failed", data };
  return { ok: true, data: data as T };
}

export type WithView = { view: TeamsView | null };

/** What any refusal means, in plain words (each form adds its own). */
export const COMMON_ERRORS: Record<string, string> = {
  network: "Couldn't reach GameShuffle. Check your connection and try again.",
  not_ready: "Teams and players arrive with the next update.",
  slow_down: "That's a lot of changes at once. Wait a few minutes and try again.",
  signin: "Your sign-in ran out. Reload the page and sign in again.",
  not_yours: "Only the account that added the bot to this server can change its teams here.",
  gone: "That's already gone. Reload the page to see the latest.",
  failed: "That didn't save. Try again?",
};

export const errorText = (error: string, own: Record<string, string> = {}) => own[error] ?? COMMON_ERRORS[error] ?? COMMON_ERRORS.failed;
