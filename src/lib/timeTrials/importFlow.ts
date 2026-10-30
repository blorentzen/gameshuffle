import "server-only";

/**
 * Moving times in (migration picks 2026-10-29): saving the rows someone kept, only when they beat
 * what's already saved (5A), and the drafts that carry a Discord "Save to GameShuffle" read to the
 * site's check table ("Check them on GameShuffle", 4A). Drafts live in tt_drafts for a day.
 */

import { createServiceClient } from "@/lib/supabase/admin";
import { addTime, playerBests, setVideo } from "./store";
import { videoProof } from "./rules";
import { isClassFor, ttTrack, type TtClass, type TtGame } from "./tracks";
import type { TtItems } from "./categories";
import type { TtActor } from "./players";
import type { QuaxlyList } from "./quaxly";

/** Your saved bests on one game's open boards for an items setting, keyed "<track id>|<cc>". */
export async function bestsMap(player: TtActor["player"], game: TtGame, items: TtItems = "shrooms"): Promise<Map<string, number>> {
  const bests = await playerBests(player);
  return new Map(bests.filter((b) => b.game === game && b.items === items && b.vehicle === "any").map((b) => [`${b.track}|${b.cc}`, b.timeMs]));
}

export interface SaveTally { saved: number; already: number; refused: number; skipped: number }

/** Saves rows that beat the saved best (source "import", no proof); the record floor is checked in addTime. */
export async function saveImported(actor: TtActor, game: TtGame, rows: { track: string; cc: number; time: number; video?: string | null }[], guildId: string | null = null, items: TtItems = "shrooms"): Promise<SaveTally> {
  const bests = await bestsMap(actor.player, game, items);
  const tally: SaveTally = { saved: 0, already: 0, refused: 0, skipped: 0 };
  const seen = new Set<string>();
  for (const r of rows.slice(0, 300)) {
    const k = `${r.track}|${r.cc}`;
    if (!ttTrack(game, r.track) || !isClassFor(game, r.cc) || !Number.isInteger(r.time) || seen.has(k)) { tally.skipped++; continue; }
    seen.add(k);
    const saved = bests.get(k);
    if (saved != null && saved <= r.time) { tally.already++; continue; }
    const res = await addTime({ player: actor.player, userId: actor.userId, identityId: actor.identityId, game, track: r.track, cc: r.cc as TtClass, items, vehicle: "any", timeMs: r.time, proof: "none", proofUrl: null, readByAi: false, source: "import", guildId });
    if (res.ok) {
      tally.saved++;
      // A video that came with the time (MKCentral's proof) goes to the reviewers as its clip.
      const v = r.video ? videoProof(r.video) : null;
      if (v) await setVideo(actor.player, res.timeId, v);
    }
    else if (res.error === "faster_than_record") tally.refused++;
    else tally.skipped++;
  }
  return tally;
}

export interface QuaxlyDraft { kind: "quaxly"; list: QuaxlyList; mine: number[]; names: string[] }

const DAY_MS = 24 * 60 * 60_000;

export async function saveQuaxlyDraft(actor: TtActor, discordId: string, guildId: string | null, draft: QuaxlyDraft): Promise<string | null> {
  const { data, error } = await createServiceClient().from("tt_drafts").insert({
    player: actor.player, discord_id: discordId, guild_id: guildId, payload: draft, expires_at: new Date(Date.now() + DAY_MS).toISOString(),
  }).select("id").single();
  if (error || !data) { console.error("[tt] draft failed:", error?.message); return null; }
  return (data as { id: string }).id;
}

export async function loadQuaxlyDraft(id: string): Promise<{ player: string; discordId: string; guildId: string | null; draft: QuaxlyDraft } | null> {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const { data } = await createServiceClient().from("tt_drafts").select("player, discord_id, guild_id, payload, expires_at").eq("id", id).maybeSingle();
  const row = data as { player: string; discord_id: string; guild_id: string | null; payload: QuaxlyDraft; expires_at: string } | null;
  if (!row || row.payload?.kind !== "quaxly" || new Date(row.expires_at).getTime() < Date.now()) return null;
  return { player: row.player, discordId: row.discord_id, guildId: row.guild_id, draft: row.payload };
}

export async function dropDraft(id: string): Promise<void> {
  await createServiceClient().from("tt_drafts").delete().eq("id", id);
}
