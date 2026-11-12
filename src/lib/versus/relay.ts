import "server-only";

/**
 * The site's calls to a room on the speedrun relay (speedrun-relay/src/room.ts), with the shared secret:
 *   GET  /room/<roomKey>                         the room as it stands (RoomView), 404 before its first setup
 *   POST /room/<roomKey> { op: "setup", … }      the whole config every time: kind, title, checkpoints, entrants
 *   POST /room/<roomKey> { op: "start", startAt, keys }   the countdown (keys = who races; anyone else is taken out)
 *   POST /room/<roomKey> { op: "leave" | "remove", key }, { op: "end" }, { op: "cancel" }, { op: "lane", key, lane }
 * Watchers connect to wss://…/roomwatch/<r1 token> (`roomWatchUrl`). Calls give up after a few seconds.
 */

import { speedrunEnv, speedrunEnvOrNull } from "@/lib/speedrun/env";
import { signToken } from "@/lib/speedrun/tokens";
import type { RoomView } from "./types";

const TIMEOUT_MS = 5000;

export interface RoomSetup {
  kind: string;
  title: string;
  checkpoints: string[];
  unit: "ms" | "turns";
  configVersion: number;
  entrants: { key: string; name: string; color: string | null; source: "relay" | "site"; relayId: string | null; delayMs: number; ready: boolean }[];
}

export type RoomCallResult = { ok: true; room: RoomView | null } | { ok: false; error: string; room?: RoomView | null };

async function call(roomKey: string, init: RequestInit): Promise<RoomCallResult> {
  try {
    const env = speedrunEnv();
    const res = await fetch(`${env.httpUrl}/room/${roomKey}`, {
      ...init,
      headers: { ...(init.headers ?? {}), authorization: `Bearer ${env.secret}`, "content-type": "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const body = (await res.json().catch(() => null)) as { ok?: boolean; error?: string; room?: RoomView } | null;
    if (res.status === 404 && init.method === "GET") return { ok: true, room: null };
    if (!body) return { ok: false, error: res.ok ? "bad_reply" : "unreachable" };
    if (!body.ok) return { ok: false, error: body.error ?? "failed", room: body.room ?? null };
    return { ok: true, room: isRoomView(body.room) ? body.room : null };
  } catch (e) {
    return { ok: false, error: (e as Error).name === "SpeedrunConfigError" ? "not_configured" : "unreachable" };
  }
}

export function isRoomView(v: unknown): v is RoomView {
  if (!v || typeof v !== "object") return false;
  const r = v as Partial<RoomView>;
  return r.v === 1 && typeof r.seq === "number" && typeof r.status === "string" && Array.isArray(r.entrants) && Array.isArray(r.checkpoints);
}

export const roomRead = (roomKey: string) => call(roomKey, { method: "GET" });
export const roomSetup = (roomKey: string, setup: RoomSetup) => call(roomKey, { method: "POST", body: JSON.stringify({ op: "setup", ...setup }) });
export const roomStart = (roomKey: string, startAt: number, keys: string[]) => call(roomKey, { method: "POST", body: JSON.stringify({ op: "start", startAt, keys }) });
export const roomTakeOut = (roomKey: string, key: string, how: "leave" | "remove") => call(roomKey, { method: "POST", body: JSON.stringify({ op: how, key }) });
export const roomEnd = (roomKey: string) => call(roomKey, { method: "POST", body: JSON.stringify({ op: "end" }) });
export const roomCancel = (roomKey: string) => call(roomKey, { method: "POST", body: JSON.stringify({ op: "cancel" }) });
/** A lane the site feeds (a duel): how far the player got, the turn now, then done or out. */
export const roomLane = (roomKey: string, key: string, lane: unknown) => call(roomKey, { method: "POST", body: JSON.stringify({ op: "lane", key, lane }) });

/** The room's public watch address (anyone with the race's link may watch). Null when the relay isn't set up. */
export async function roomWatchUrl(roomKey: string): Promise<string | null> {
  const env = speedrunEnvOrNull();
  if (!env) return null;
  return `${env.wsUrl}/roomwatch/${await signToken(env.secret, "room", roomKey, 1)}`;
}
