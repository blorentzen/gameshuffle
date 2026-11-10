import "server-only";

/**
 * The site's calls to the relay (phase 1 contract, "Relay HTTP surface"), with the shared secret as a Bearer token:
 *   POST /admin/<relayId>  { timerVersion, overlayVersion, attemptBase, game, category }: the object keeps them and
 *                          closes sockets whose address is now too old.
 *   GET  /state/<relayId>  the current RelayState.
 * Both give up after a few seconds: the relay being down never holds up a page.
 */

import { speedrunEnv } from "./env";
import { isRelayState } from "./rules";
import type { RelayState } from "./types";

const TIMEOUT_MS = 4000;

export interface RelayConfig {
  timerVersion: number;
  overlayVersion: number;
  attemptBase: number;
  game: string | null;
  category: string | null;
}

async function call(path: string, init: RequestInit): Promise<Response> {
  const env = speedrunEnv();
  return fetch(`${env.httpUrl}${path}`, {
    ...init,
    headers: { ...(init.headers ?? {}), authorization: `Bearer ${env.secret}` },
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
}

/** Sends the runner's whole config (every save sends all of it, so a missed call catches up on the next). */
export async function relayAdmin(relayId: string, config: RelayConfig): Promise<boolean> {
  try {
    const res = await call(`/admin/${relayId}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(config) });
    if (!res.ok) console.warn(`[speedrun] relay /admin answered ${res.status}`);
    return res.ok;
  } catch (e) {
    console.warn(`[speedrun] relay /admin failed: ${(e as Error).message}`);
    return false;
  }
}

export type RelayStateResult = { ok: true; state: RelayState | null } | { ok: false; error: "unreachable" | "not_configured" };

/** The runner's state from the relay (state null = the relay has nothing for this runner yet). */
export async function relayState(relayId: string): Promise<RelayStateResult> {
  try {
    const res = await call(`/state/${relayId}`, { method: "GET" });
    if (res.status === 404) return { ok: true, state: null };
    if (!res.ok) return { ok: false, error: "unreachable" };
    const body = (await res.json().catch(() => null)) as unknown;
    const state = body && typeof body === "object" && "state" in (body as object) ? (body as { state: unknown }).state : body;
    return { ok: true, state: isRelayState(state) ? state : null };
  } catch (e) {
    if ((e as Error).name === "SpeedrunConfigError") return { ok: false, error: "not_configured" };
    return { ok: false, error: "unreachable" };
  }
}
