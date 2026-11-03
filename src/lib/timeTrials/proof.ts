import "server-only";

/**
 * Proof checks (round 3 pick 10A). Nothing can prove a screenshot wasn't edited, so these never take a time down:
 * each opens a ticket (tt_reports kind 'flag', reporter 'flag:<kind>') that the mode's updaters see.
 *   dupe      the same screenshot (by fingerprint) is the proof for another player's time, or for a different time
 *   misread   the saved time differs from what the screen showed
 *   laps      the laps don't add up to the time
 * Also a signed note of what Claude read (`signRead` / `readFrom`), so the read can't be made up by the page that
 * sends the time.
 */

import sharp from "sharp";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/admin";
import { describePlayers } from "@/lib/daily/boards";
import { formatLap, formatTime, lapsAddUp } from "./rules";
import { round3Ready } from "./status";

/** A 64-bit difference hash of a picture (16 hex): survives re-encoding and resizing, not crops or edits. */
export async function shotHash(bytes: Uint8Array | Buffer): Promise<string | null> {
  try {
    const px = await sharp(bytes).rotate().greyscale().resize(9, 8, { fit: "fill" }).raw().toBuffer();
    let hex = "";
    for (let y = 0; y < 8; y++) {
      for (let half = 0; half < 2; half++) {
        let nibble = 0;
        for (let k = 0; k < 4; k++) { const x = half * 4 + k; nibble = (nibble << 1) | (px[y * 9 + x] > px[y * 9 + x + 1] ? 1 : 0); }
        hex += nibble.toString(16);
      }
    }
    return hex;
  } catch {
    return null;
  }
}

const UGC_HOST = "gs-ugc.empac.co";
/** The fingerprint of a proof screenshot in our own storage (the only proof pictures we keep). */
export async function hashOfProof(url: string | null): Promise<string | null> {
  if (!url) return null;
  try { if (new URL(url).host !== UGC_HOST) return null; } catch { return null; }
  const res = await fetch(url, { signal: AbortSignal.timeout(5000) }).catch(() => null);
  if (!res?.ok) return null;
  return shotHash(Buffer.from(await res.arrayBuffer()));
}

// ── What Claude read, signed ──────────────────────────────────────────────────────────────────

export interface ReadNote { url: string; timeMs: number | null; laps: number[] | null }

const key = () => createHash("sha256").update(`tt-read:${process.env.SUPABASE_SERVICE_ROLE_KEY ?? "dev"}`).digest();
const b64 = (s: string) => Buffer.from(s).toString("base64url");

/** A token the page sends back with the time, holding what the screenshot read as (an hour). */
export function signRead(note: ReadNote): string {
  const body = b64(JSON.stringify({ ...note, exp: Date.now() + 60 * 60_000 }));
  return `${body}.${createHmac("sha256", key()).update(body).digest("base64url")}`;
}

/** The read inside a token, when it's ours, unexpired and for this proof. */
export function readFrom(token: unknown, proofUrl: string | null): ReadNote | null {
  if (typeof token !== "string" || !proofUrl) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const want = createHmac("sha256", key()).update(body).digest();
  const got = Buffer.from(sig, "base64url");
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  try {
    const n = JSON.parse(Buffer.from(body, "base64url").toString()) as ReadNote & { exp: number };
    return n.exp > Date.now() && n.url === proofUrl ? { url: n.url, timeMs: n.timeMs ?? null, laps: n.laps ?? null } : null;
  } catch {
    return null;
  }
}

// ── Flags ─────────────────────────────────────────────────────────────────────────────────────

export type FlagKind = "dupe" | "misread" | "laps";

async function flag(timeId: string, kind: FlagKind, reason: string): Promise<void> {
  await createServiceClient().from("tt_reports").upsert(
    { time_id: timeId, reporter: `flag:${kind}`, kind: "flag", reason: reason.slice(0, 300), state: "open" },
    { onConflict: "time_id,reporter", ignoreDuplicates: true },
  );
}

/** The checks for a time that was just saved. */
export async function checkProof(t: { id: string; player: string; timeMs: number; shotHash: string | null; readMs: number | null; laps: number[] | null }): Promise<FlagKind[]> {
  if (!(await round3Ready())) return [];
  const found: FlagKind[] = [];
  if (t.shotHash) {
    const { data } = await createServiceClient().from("tt_times").select("id, player, time_ms").eq("shot_hash", t.shotHash).eq("status", "ok").neq("id", t.id).limit(5);
    const other = ((data ?? []) as { id: string; player: string; time_ms: number }[]).find((r) => r.player !== t.player || r.time_ms !== t.timeMs);
    if (other) {
      const whose = other.player === t.player ? "this player's" : `${(await describePlayers([other.player])).get(other.player)?.name ?? "another player"}'s`;
      await flag(t.id, "dupe", `This screenshot was also used for ${whose} ${formatTime(other.time_ms)}.`);
      found.push("dupe");
    }
  }
  if (t.readMs != null && t.readMs !== t.timeMs) {
    await flag(t.id, "misread", `The screen read ${formatTime(t.readMs)}; the time was saved as ${formatTime(t.timeMs)}.`);
    found.push("misread");
  }
  if (t.laps?.length && !lapsAddUp(t.laps, t.timeMs)) {
    const sum = t.laps.reduce((a, b) => a + b, 0);
    await flag(t.id, "laps", `The laps (${t.laps.map(formatLap).join(", ")}) add up to ${formatTime(sum)}, not ${formatTime(t.timeMs)}.`);
    found.push("laps");
  }
  return found;
}
