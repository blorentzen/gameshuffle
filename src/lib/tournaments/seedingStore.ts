import "server-only";

/**
 * Reading and writing a tournament's draw.
 *
 * The engine (`seeding.ts`) is pure and knows nothing about the database. This
 * is the half that loads the field, persists a draw into the organizer-only
 * table, logs it, and works out whether the draw still matches the roster.
 *
 * STALE IS COMPUTED, NOT STORED. A trigger that stamps `stale` on every roster
 * change can drift: a row gets added and removed and the flag stays set, or a
 * write path forgets to fire it. Comparing the stored seed set against the
 * current seat-holders on read cannot be wrong, and it is one query.
 */

import { createServiceClient } from "@/lib/supabase/admin";
import {
  buildSeedList, newRngSeed, type SeedableEntrant, type SeedingMethod, type Tier,
} from "./seeding";

export type SeedingStatus = "unseeded" | "seeded" | "stale" | "locked";

export interface SeedingState {
  method: SeedingMethod;
  status: SeedingStatus;
  protectedCount: number;
  seededAt: string | null;
  rng: string | null;
  /** Ordered participant ids, seed 1 first. Empty when unseeded. */
  order: string[];
  /** Per participant, the organizer's private annotations. */
  tiers: Record<string, Tier | null>;
  protectedRanks: Record<string, number | null>;
  drawCount: number;
  /** True once the tournament has started: seeding is read-only from then on. */
  locked: boolean;
}

/** Entrants a draw applies to. Dropped and waitlisted are not in the field. */
const SEATED = ["registered", "confirmed", "checked_in"];

async function loadEntrants(tournamentId: string): Promise<SeedableEntrant[]> {
  const svc = createServiceClient();
  const { data } = await svc
    .from("tournament_participants")
    .select("id, joined_at, status")
    .eq("tournament_id", tournamentId)
    .in("status", SEATED)
    .order("joined_at");
  return ((data ?? []) as { id: string; joined_at: string }[])
    .map((r) => ({ id: r.id, joinedAt: r.joined_at }));
}

export async function getSeedingState(tournamentId: string): Promise<SeedingState | null> {
  const svc = createServiceClient();
  const { data: t, error } = await svc
    .from("tournaments")
    .select("status, seeding_method, seeding_config, seeding_status, seeded_at, seed_rng")
    .eq("id", tournamentId)
    .maybeSingle();
  // Pre-migration the columns are absent; the caller hides the whole surface.
  if (error || !t) return null;

  const row = t as {
    status: string; seeding_method?: string; seeding_config?: { protected_count?: number };
    seeding_status?: string; seeded_at?: string | null; seed_rng?: string | null;
  };

  const [{ data: priv }, entrants, { count: draws }] = await Promise.all([
    svc.from("tournament_seeding_private")
      .select("participant_id, seed, tier, protected_rank")
      .eq("tournament_id", tournamentId),
    loadEntrants(tournamentId),
    svc.from("tournament_seeding_log")
      .select("id", { count: "exact", head: true }).eq("tournament_id", tournamentId),
  ]);

  const rows = (priv ?? []) as { participant_id: string; seed: number | null; tier: Tier | null; protected_rank: number | null }[];
  const order = rows.filter((r) => r.seed != null)
    .sort((a, b) => (a.seed ?? 0) - (b.seed ?? 0))
    .map((r) => r.participant_id);

  const locked = row.status !== "draft" && row.status !== "open";

  /* Stale when the seeded set and the seated set have parted company: someone
     joined, someone was dropped at check-in, someone withdrew. Compared as sets
     because order is the thing a re-draw would change. */
  const seatedIds = new Set(entrants.map((e) => e.id));
  const seededIds = new Set(order);
  const matches = seatedIds.size === seededIds.size && [...seatedIds].every((id) => seededIds.has(id));

  const status: SeedingStatus = locked ? "locked"
    : order.length === 0 ? "unseeded"
    : matches ? "seeded" : "stale";

  return {
    method: (row.seeding_method as SeedingMethod) ?? "random",
    status,
    protectedCount: row.seeding_config?.protected_count ?? 2,
    seededAt: row.seeded_at ?? null,
    rng: row.seed_rng ?? null,
    order,
    tiers: Object.fromEntries(rows.map((r) => [r.participant_id, r.tier])),
    protectedRanks: Object.fromEntries(rows.map((r) => [r.participant_id, r.protected_rank])),
    drawCount: draws ?? 0,
    locked,
  };
}

export interface DrawResult { ok: boolean; error?: string; order?: string[]; rng?: string }

/**
 * Run a draw and persist it.
 *
 * `manualOrder` is supplied by the organizer for the Manual method; the other
 * methods read their inputs from the private table.
 */
export async function runDraw(args: {
  tournamentId: string;
  actorId: string;
  method: SeedingMethod;
  protectedCount?: number;
  manualOrder?: string[];
}): Promise<DrawResult> {
  const svc = createServiceClient();
  const { data: t } = await svc
    .from("tournaments").select("status, championship_id").eq("id", args.tournamentId).maybeSingle();
  if (!t) return { ok: false, error: "Tournament not found." };

  // Locking at start is the point of the feature: a bracket that can be
  // re-drawn mid-event is not a bracket.
  if (t.status !== "draft" && t.status !== "open") {
    return { ok: false, error: "This tournament has started. Seeding is locked." };
  }
  if (args.method === "standings" && !t.championship_id) {
    return { ok: false, error: "Standings seeding is only available for championship events." };
  }

  const entrants = await loadEntrants(args.tournamentId);
  if (entrants.length === 0) return { ok: false, error: "Nobody has entered yet." };

  const { data: priv } = await svc
    .from("tournament_seeding_private")
    .select("participant_id, tier, protected_rank")
    .eq("tournament_id", args.tournamentId);
  const annotations = new Map(((priv ?? []) as { participant_id: string; tier: Tier | null; protected_rank: number | null }[])
    .map((r) => [r.participant_id, r]));

  const manualIndex = new Map((args.manualOrder ?? []).map((id, i) => [id, i + 1]));

  const withInputs: SeedableEntrant[] = entrants.map((e) => ({
    ...e,
    tier: annotations.get(e.id)?.tier ?? null,
    protectedRank: annotations.get(e.id)?.protected_rank ?? null,
    manualSeed: manualIndex.get(e.id) ?? null,
    standingsRank: null, // filled by the caller for championship events
  }));

  const rng = newRngSeed();
  const order = buildSeedList(withInputs, {
    method: args.method,
    rng,
    protectedCount: args.protectedCount,
  });

  // Upsert rather than delete-and-insert: tiers and pins are the organizer's
  // work and must survive a re-draw.
  const rowsToWrite = order.map((participantId, i) => ({
    tournament_id: args.tournamentId,
    participant_id: participantId,
    seed: i + 1,
    tier: annotations.get(participantId)?.tier ?? null,
    protected_rank: annotations.get(participantId)?.protected_rank ?? null,
  }));
  const { error: writeErr } = await svc
    .from("tournament_seeding_private")
    .upsert(rowsToWrite, { onConflict: "tournament_id,participant_id" });
  if (writeErr) return { ok: false, error: writeErr.message };

  // Anyone no longer seated loses their seed, or a stale row would keep the
  // draw looking mismatched forever.
  await svc.from("tournament_seeding_private")
    .delete()
    .eq("tournament_id", args.tournamentId)
    .not("participant_id", "in", `(${order.join(",")})`)
    .then(undefined, () => {});

  await svc.from("tournaments").update({
    seeding_method: args.method,
    seeding_config: { protected_count: args.protectedCount ?? 2 },
    seeding_status: "seeded",
    seeded_at: new Date().toISOString(),
    seed_rng: rng,
  }).eq("id", args.tournamentId);

  await svc.from("tournament_seeding_log").insert({
    tournament_id: args.tournamentId, method: args.method, rng, actor_id: args.actorId,
  }).then(undefined, () => {});

  return { ok: true, order, rng };
}

/** Set a tier or a protected pin. Annotations only; no draw is run. */
export async function setAnnotation(args: {
  tournamentId: string; participantId: string; tier?: Tier | null; protectedRank?: number | null;
}): Promise<{ ok: boolean; error?: string }> {
  const patch: Record<string, unknown> = {
    tournament_id: args.tournamentId, participant_id: args.participantId,
  };
  if (args.tier !== undefined) patch.tier = args.tier;
  if (args.protectedRank !== undefined) patch.protected_rank = args.protectedRank;

  const { error } = await createServiceClient()
    .from("tournament_seeding_private")
    .upsert(patch, { onConflict: "tournament_id,participant_id" });
  return error ? { ok: false, error: error.message } : { ok: true };
}
