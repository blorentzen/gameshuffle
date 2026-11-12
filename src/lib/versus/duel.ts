import "server-only";

/**
 * Duels against friends on the head-to-head rooms (duels picks 2026-11-11, all as recommended): two players by
 * default, up to eight, duel the same Trainer Road team at the same time. The room's checkpoints are the trainer's
 * cards; each player's own run (a normal Trainer Road run, so it counts for stars, their best and the board) tells the
 * room after every step which turn each card was knocked out on (roadStore `duelLaneOf` → `duelRunMoved`). A win
 * first, then fewer turns, then less time; anyone who lost is placed after the winners by how many cards they knocked
 * out. No professor and no tools; the host picks Easy, Normal or Hard for everyone.
 */

import { DUEL_TRAINERS } from "@/data/originals/duel/trainers";
import { currentRoadMonth, getRoadDuel, getRoadRunView, roadLevelOpen, startRoadRun } from "@/lib/originals/duel/roadStore";
import { regionOf, roadPath, teamLabel } from "@/lib/originals/duel/road";
import { personOf } from "@/lib/originals/duel/rules";
import type { DuelLevel, DuelTrainer } from "@/lib/originals/duel/types";
import type { DuelRunView } from "@/lib/originals/duel/view";
import { createServiceClient } from "@/lib/supabase/admin";
import { roomLane } from "./relay";
import type { VersusDuelInfo } from "./types";

export const duelTrainer = (id: string): DuelTrainer | null => DUEL_TRAINERS.find((t) => t.id === id) ?? null;

/** The trainer and team a duel room plays, as its page shows them. */
export function duelInfo(trainerId: string, level: DuelLevel, month: string): VersusDuelInfo | null {
  const t = duelTrainer(trainerId);
  if (!t) return null;
  const region = regionOf(t);
  return { trainerId, level, month, name: t.name, title: t.title, game: teamLabel(t), href: region ? `${roadPath(region, personOf(t))}?team=${encodeURIComponent(t.id)}` : null };
}

export type DuelSetupResult =
  | { ok: true; trainer: DuelTrainer; month: string; level: DuelLevel; checkpoints: string[] }
  | { ok: false; error: "not_found" | "not_ready" | "hard_off" | "easy_off" };

/** What a new duel room needs: the team's duel this month (built), open at that level, and its cards as checkpoints. */
export async function duelSetupFor(trainerId: string, level: DuelLevel): Promise<DuelSetupResult> {
  const trainer = duelTrainer(trainerId);
  if (!trainer) return { ok: false, error: "not_found" };
  const month = currentRoadMonth();
  const d = await getRoadDuel(trainerId, month);
  if (!d) return { ok: false, error: "not_ready" };
  if (!(await roadLevelOpen(d, level))) return { ok: false, error: level === "hard" ? "hard_off" : "easy_off" };
  return { ok: true, trainer, month, level, checkpoints: d.setup.foe.map((c) => c.short) };
}

export type PlayDuelResult = { ok: true; run: DuelRunView } | { ok: false; error: "not_running" | "not_in" | "not_ready" | "failed" };

/**
 * A player's own run in a running duel room: the one they started (picked back up after a reload), or a new one at Go.
 * The run id is kept on their entrant row.
 */
export async function playDuel(room: { id: string; room_key: string; status: string }, settings: { trainerId: string; level: DuelLevel; month: string }, userId: string): Promise<PlayDuelResult> {
  if (room.status !== "running") return { ok: false, error: "not_running" };
  const db = createServiceClient();
  const { data } = await db.from("versus_entrants").select("status, source").eq("room_id", room.id).eq("user_id", userId).maybeSingle();
  const row = data as { status: string; source: { runId?: string } | null } | null;
  if (!row || !["racing", "done", "out"].includes(row.status)) return { ok: false, error: "not_in" };
  const player = { kind: "u" as const, id: userId };
  if (row.source?.runId) {
    const run = await getRoadRunView(row.source.runId, player);
    if (run) return { ok: true, run };
  }
  if (row.status !== "racing") return { ok: false, error: "not_running" };
  const started = await startRoadRun(player, settings.trainerId, settings.level, { room: room.room_key, month: settings.month });
  if (!started.ok) return { ok: false, error: started.error === "not_ready" ? "not_ready" : "failed" };
  // Claim the run for this entrant (a second tab that raced us here gets the first run back).
  const { data: claimed } = await db.from("versus_entrants").update({ source: { runId: started.run.id }, updated_at: new Date().toISOString() })
    .eq("room_id", room.id).eq("user_id", userId).is("source->>runId", null).select("user_id");
  if (!claimed?.length) {
    const { data: again } = await db.from("versus_entrants").select("source").eq("room_id", room.id).eq("user_id", userId).maybeSingle();
    const first = (again as { source: { runId?: string } | null } | null)?.source?.runId;
    const run = first ? await getRoadRunView(first, player) : null;
    if (run) return { ok: true, run };
  }
  await duelRunMoved(room.room_key, userId, { reached: 0, times: [], current: started.run.turns });
  return { ok: true, run: started.run };
}

/** A duel-room run moved: the room hears the player's lane (knockouts by turn, the turn now, then won or lost). */
export async function duelRunMoved(roomKey: string, userId: string, lane: { reached: number; times: (number | null)[]; current: number; status?: "done" | "out"; finalMs?: number; tieMs?: number; reason?: "lost" }): Promise<void> {
  const res = await roomLane(roomKey, userId, lane);
  if (!res.ok) console.warn(`[versus] duel lane for ${roomKey}: ${res.error}`);
}
