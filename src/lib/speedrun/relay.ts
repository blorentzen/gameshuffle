import "server-only";

/**
 * The site's calls to the relay (phase 1 contract, "Relay HTTP surface"), with the shared secret as a Bearer token:
 *   POST /admin/<relayId>  { timerVersion, overlayVersion, attemptBase, game, category }: the object keeps them and
 *                          closes sockets whose address is now too old.
 *   GET  /state/<relayId>  { state, overlays }: the current RelayState and how many overlays are open.
 *   POST /cmd/<relayId>    { command }: start, split, undo, skip, reset, pause, resume. Forwarded to LiveSplit One when
 *                          it's connected, else run on the relay's own timer (remote mode, the phone remote).
 * Both give up after a few seconds: the relay being down never holds up a page.
 */

import { speedrunEnv } from "./env";
import { cleanTimerInfo, isRelayState } from "./rules";
import type { RelaySegment, RelayState, TimerInfo } from "./types";

const TIMEOUT_MS = 4000;

export interface RelayConfig {
  timerVersion: number;
  overlayVersion: number;
  attemptBase: number;
  game: string | null;
  category: string | null;
  /** The run for remote mode (the relay keeps its own when the names match). */
  segments?: RelaySegment[];
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

export type RelayStateResult =
  | { ok: true; state: RelayState | null; overlays: number | null; timer?: TimerInfo | null }
  | { ok: false; error: "unreachable" | "not_configured" };

/** The runner's state from the relay (state null = the relay has nothing for this runner yet). */
export async function relayState(relayId: string): Promise<RelayStateResult> {
  try {
    const res = await call(`/state/${relayId}`, { method: "GET" });
    if (res.status === 404) return { ok: true, state: null, overlays: null, timer: null };
    if (!res.ok) return { ok: false, error: "unreachable" };
    const body = (await res.json().catch(() => null)) as unknown;
    const wrapped = !!body && typeof body === "object" && "state" in (body as object);
    const state = wrapped ? (body as { state: unknown }).state : body;
    const overlays = wrapped && typeof (body as { overlays?: unknown }).overlays === "number" ? (body as { overlays: number }).overlays : null;
    // GameShuffle for LiveSplit says who it is; LiveSplit One doesn't (older relays send no `timer` at all).
    const timer = wrapped ? cleanTimerInfo((body as { timer?: unknown }).timer) : null;
    return { ok: true, state: isRelayState(state) ? state : null, overlays, timer };
  } catch (e) {
    if ((e as Error).name === "SpeedrunConfigError") return { ok: false, error: "not_configured" };
    return { ok: false, error: "unreachable" };
  }
}

export const REMOTE_COMMANDS = ["start", "split", "undo", "skip", "reset", "pause", "resume"] as const;
export type RemoteCommand = (typeof REMOTE_COMMANDS)[number];

export type RelayCmdResult =
  | { ok: true; state: RelayState; overlays: number | null }
  | { ok: false; error: string };

/** One timer command (the phone remote). LiveSplit One's refusals come back by name: busy, no_run, run_finished… */
export async function relayCmd(relayId: string, command: RemoteCommand): Promise<RelayCmdResult> {
  try {
    const res = await call(`/cmd/${relayId}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ command }) });
    const body = (await res.json().catch(() => null)) as { ok?: boolean; error?: unknown; state?: unknown; overlays?: unknown } | null;
    if (!res.ok || !body) return { ok: false, error: "unreachable" };
    if (!body.ok) return { ok: false, error: typeof body.error === "string" ? body.error : "failed" };
    if (!isRelayState(body.state)) return { ok: false, error: "failed" };
    return { ok: true, state: body.state, overlays: typeof body.overlays === "number" ? body.overlays : null };
  } catch (e) {
    if ((e as Error).name === "SpeedrunConfigError") return { ok: false, error: "not_configured" };
    return { ok: false, error: "unreachable" };
  }
}
