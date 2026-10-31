import "server-only";

/**
 * Bring Mario Kart World times from MKCentral (research 2026-10-30): MKCentral's time trials keep each
 * player's timesheet behind a public API, and its registry finds a player by Discord id, so a player
 * with Discord connected imports in one press. Track codes are MKCentral's (the same short names the
 * reader knows). Proofless and not-yet-validated times come too (the player checks every row), and a
 * video proof comes along as the time's clip for our reviewers.
 */

import { worldTrack } from "./quaxly";
import type { ImportRow } from "./importText";

const API = "https://mkcentral.com/api";

async function getJson(path: string): Promise<unknown> {
  const res = await fetch(`${API}${path}`, { headers: { accept: "application/json", "user-agent": "GameShuffle (gameshuffle.co)" }, signal: AbortSignal.timeout(8000), cache: "no-store" });
  if (!res.ok) throw new Error(`mkcentral ${res.status}`);
  return res.json();
}

export type MkcResult =
  | { ok: true; playerId: number; name: string | null; rows: ImportRow[] }
  | { ok: false; error: "mkc_none" | "mkc_down" | "mkc_empty" };

type Proof = { type?: string | null; url?: string | null };
type Rec = { track?: string; time_ms?: number; validation_status?: string; proofs?: Proof[] | null };

/** A player's MKCentral time trial times for Mario Kart World, as import rows. */
export async function mkcentralTimes(discordId: string): Promise<MkcResult> {
  if (!/^\d{5,25}$/.test(discordId)) return { ok: false, error: "mkc_none" };
  try {
    const found = (await getJson(`/registry/players?discord_id=${discordId}`)) as { player_list?: { id?: number; name?: string }[] };
    const p = found.player_list?.[0];
    if (!p?.id) return { ok: false, error: "mkc_none" };
    const sheet = (await getJson(`/time-trials/timesheet?player_id=${p.id}&game=mkworld&include_unvalidated=true&include_proofless=true&include_outdated=false`)) as { records?: Rec[] };
    const rows: ImportRow[] = [];
    for (const r of sheet.records ?? []) {
      if (!r.track || !Number.isInteger(r.time_ms) || (r.time_ms ?? 0) <= 0) continue;
      const t = worldTrack(r.track);
      const video = (r.proofs ?? []).find((x) => x.url && /video/i.test(x.type ?? ""))?.url ?? null;
      rows.push({
        line: `${r.track} ${r.time_ms} (${r.validation_status ?? "unvalidated"})`,
        game: "mkworld", trackId: t?.id ?? null, trackName: t?.name ?? null, trackText: t ? null : r.track,
        cc: 150, timeMs: r.time_ms!, via: null, video: video && /^https:\/\//.test(video) ? video : null,
      });
    }
    if (!rows.length) return { ok: false, error: "mkc_empty" };
    return { ok: true, playerId: p.id, name: p.name ?? null, rows };
  } catch (e) {
    console.error("[tt] mkcentral import:", (e as Error).message);
    return { ok: false, error: "mkc_down" };
  }
}
