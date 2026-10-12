/**
 * Play together, the phone's side of the wire: calls to the live routes and
 * the guest's seat tokens (kept in this browser so a refresh or a locked
 * phone gets back into the game). A signed-in player needs no token.
 */

import type { SessionAction } from "./state";
import type { LivePreview, LiveView } from "./liveRules";
import type { SessionState } from "./types";

const STORE = "gs-companion-live";
const KEEP = 6;

type Tokens = Record<string, { token: string; at: number }>;

function readTokens(): Tokens {
  try {
    const raw = window.localStorage.getItem(STORE);
    const parsed = raw ? (JSON.parse(raw) as Tokens) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function savedToken(code: string): string | null {
  return readTokens()[code]?.token ?? null;
}

export function saveToken(code: string, token: string): void {
  try {
    const all = { ...readTokens(), [code]: { token, at: Date.now() } };
    const kept = Object.entries(all).sort((a, b) => b[1].at - a[1].at).slice(0, KEEP);
    window.localStorage.setItem(STORE, JSON.stringify(Object.fromEntries(kept)));
  } catch {
    /* storage blocked: the game still works until the page reloads */
  }
}

export interface LiveFailure {
  error: string;
  message: string;
  status: number;
}

async function call<T>(url: string, init: RequestInit & { token?: string | null } = {}): Promise<(T & { status: number }) | LiveFailure> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (init.token) headers["x-live-token"] = init.token;
  try {
    const res = await fetch(url, { ...init, headers, cache: "no-store" });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) return { error: String(body.error ?? "error"), message: String(body.message ?? "That didn't go through. Try again."), status: res.status };
    return { ...(body as T), status: res.status };
  } catch {
    return { error: "offline", message: "Couldn't reach GameShuffle. Check your connection.", status: 0 };
  }
}

export const isFailure = (r: object): r is LiveFailure => "error" in r && "message" in r;

const gameUrl = (code: string) => `/api/companion/live/${encodeURIComponent(code)}`;

export function liveStatus() {
  return call<{ ready: boolean; mine: { code: string; opponent: string | null } | null }>("/api/companion/live");
}

export function liveCreate(state: SessionState, mode: string) {
  return call<{ view: LiveView }>("/api/companion/live", { method: "POST", body: JSON.stringify({ state, mode }) });
}

export function livePreview(code: string) {
  return call<{ preview: LivePreview }>(`${gameUrl(code)}?preview=1`);
}

export function liveGet(code: string, token: string | null, since?: number) {
  const q = since != null ? `?v=${since}` : "";
  return call<{ view?: LiveView; unchanged?: true; version?: number }>(`${gameUrl(code)}${q}`, { token });
}

export function liveJoin(code: string, token: string | null, name: string) {
  return call<{ view: LiveView; token: string | null }>(gameUrl(code), { method: "POST", token, body: JSON.stringify({ op: "join", name }) });
}

export function liveMove(code: string, token: string | null, action: SessionAction) {
  return call<{ view: LiveView }>(gameUrl(code), { method: "POST", token, body: JSON.stringify({ op: "move", action }) });
}

export function liveUndoCall(code: string, token: string | null) {
  return call<{ view: LiveView }>(gameUrl(code), { method: "POST", token, body: JSON.stringify({ op: "undo" }) });
}

export function liveRollCall(code: string, token: string | null, body: { kind: "coin" | "die"; faces?: number; use: "log" | "resolve" }) {
  return call<{ value: number | "a" | "b"; rollId?: string; view: LiveView }>(gameUrl(code), { method: "POST", token, body: JSON.stringify({ op: "roll", ...body }) });
}

export function liveEnd(code: string, token: string | null) {
  return call<{ ok: true }>(gameUrl(code), { method: "POST", token, body: JSON.stringify({ op: "end" }) });
}

// Whether Play together is switched on (its table exists), asked once per page.
let readyAsk: Promise<boolean> | null = null;
export function liveReadyOnce(): Promise<boolean> {
  readyAsk ??= liveStatus().then((r) => !isFailure(r) && r.ready).catch(() => false);
  return readyAsk;
}
