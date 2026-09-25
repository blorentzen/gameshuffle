/**
 * Give running tournaments realistic mid-run state, and complete ones results.
 *
 * Dev seeding left five of nine running tournaments with nothing in them: a
 * "running" single-elim with no bracket, a running Heat -> Mains with no
 * ladder. The organizer tools, the display board and the overlays all read
 * that state, so there was nothing to review them against — and the five gaps
 * happen to be one per format, so filling them gives one live example of each.
 *
 * State is produced by driving the REAL engines (generateSingleElim,
 * generateDoubleElim, generateHeatMains and their report functions) rather than
 * hand-writing blobs. A hand-written bracket is a guess at the shape the UI
 * expects; a generated one is the shape by construction, and it stays correct
 * when the engine changes.
 *
 *   npx tsx scripts/seed-tournament-live-state.ts          # report only
 *   npx tsx scripts/seed-tournament-live-state.ts --write
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import {
  generateSingleElim, generateDoubleElim, reportWinner,
  currentBracketMatch, type Bracket,
} from "../src/lib/tournaments/bracket";
import {
  generateHeatMains, reportHeatResult, heatMainsStage, type HeatMains,
} from "../src/lib/tournaments/heatMains";

const WRITE = process.argv.includes("--write");

/** Deterministic shuffle, so a re-run produces the same tournaments. */
function seeded(list: string[], salt: string): string[] {
  const out = [...list];
  let h = 2166136261;
  for (const c of salt) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  for (let i = out.length - 1; i > 0; i--) {
    h = Math.imul(h ^ i, 16777619) >>> 0;
    const j = h % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Play roughly `fraction` of the bracket, always from the front so the result
 *  is a coherent mid-run state rather than random holes. */
function playBracket(b: Bracket, fraction: number): Bracket {
  const total = b.matches.length;
  const target = Math.max(1, Math.floor(total * fraction));
  let cur = b;
  for (let i = 0; i < target; i++) {
    const m = currentBracketMatch(cur);
    if (!m || !m.a || !m.b) break;
    // Lower seed wins often enough to look real, not always.
    const winner = (i % 3 === 0 ? m.b : m.a) as string;
    cur = reportWinner(cur, m.id, winner);
  }
  return cur;
}

/** Run some heats, leaving the mains to come. */
function playHeats(hm: HeatMains, fraction: number, salt: string): HeatMains {
  const target = Math.max(1, Math.floor(hm.heats.length * fraction));
  let cur = hm;
  for (let i = 0; i < target; i++) {
    const heat = cur.heats[i];
    if (!heat || heat.results?.length) continue;
    cur = reportHeatResult(cur, heat.id, seeded(heat.drivers, salt + i));
  }
  return cur;
}

async function main() {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  const { data: tours, error: te } = await db.from("tournaments")
    .select("id,title,format,status,bracket,heat_mains,settings,scoring_table,max_participants");
  if (te) throw new Error(`tournaments: ${te.message}`);

  const { data: parts, error: pe } = await db.from("tournament_participants")
    .select("id,tournament_id,user_id,status");
  if (pe) throw new Error(`participants: ${pe.message}`);

  const byTour = new Map<string, { id: string; user_id: string | null }[]>();
  for (const p of parts ?? []) {
    if (p.status === "dropped" || p.status === "waitlisted") continue;
    const arr = byTour.get(p.tournament_id) ?? [];
    arr.push({ id: p.id, user_id: p.user_id });
    byTour.set(p.tournament_id, arr);
  }

  const { data: res, error: re } = await db.from("tournament_results").select("tournament_id");
  if (re) throw new Error(`results: ${re.message}`);
  const hasResults = new Set((res ?? []).map((r) => r.tournament_id));

  const updates: { id: string; patch: Record<string, unknown>; note: string }[] = [];
  const resultRows: Record<string, unknown>[] = [];

  for (const t of tours ?? []) {
    const field = (byTour.get(t.id) ?? []).map((p) => p.id);
    const settings = (t.settings ?? {}) as Record<string, unknown>;

    // ── Running tournaments that have no live state ────────────────────────
    if (t.status === "in_progress") {
      if ((t.format === "single_elim" || t.format === "double_elim") && !t.bracket) {
        if (field.length < 4) { console.log(`  skip (needs 4+ players): ${t.title}`); continue; }
        const seeds = seeded(field, t.id);
        const fresh = t.format === "single_elim" ? generateSingleElim(seeds) : generateDoubleElim(seeds);
        const played = playBracket(fresh, 0.55);
        updates.push({ id: t.id, patch: { bracket: played }, note: `${t.format} bracket, 55% played` });
      } else if (t.format === "heat_mains" && !t.heat_mains) {
        if (field.length < 8) { console.log(`  skip (needs 8+ players): ${t.title}`); continue; }
        const hm = playHeats(generateHeatMains(seeded(field, t.id)), 0.6, t.id);
        updates.push({ id: t.id, patch: { heat_mains: hm }, note: `heat_mains, stage=${heatMainsStage(hm)}` });
      } else if ((t.format === "ffa_points" || t.format === "round_robin") && !settings.currentRaceKey) {
        // Points formats mark progress with the race they are on, which is what
        // the running ones that DO work already carry.
        const total = Number(settings.raceCount ?? 8);
        const at = Math.max(1, Math.floor(total / 2));
        updates.push({
          id: t.id,
          patch: { settings: { ...settings, currentRaceKey: `r${at}` } },
          note: `points race ${at}/${total}`,
        });
      }
    }

    // ── Complete tournaments with no results ───────────────────────────────
    if (t.status === "complete" && !hasResults.has(t.id) && field.length > 0) {
      const table = (t.scoring_table as number[] | null) ?? [15, 12, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1];
      seeded(field, t.id + "final").forEach((pid, i) => {
        resultRows.push({
          tournament_id: t.id,
          participant_id: pid,
          placement: i + 1,
          points: table[i] ?? 0,
        });
      });
    }
  }

  console.log(`\nRunning tournaments to fill: ${updates.length}`);
  updates.forEach((u) => console.log(`  ${u.note}`));
  const resultTours = new Set(resultRows.map((r) => r.tournament_id));
  console.log(`Completed tournaments to give results: ${resultTours.size} (${resultRows.length} rows)`);

  if (!WRITE) {
    console.log("\nDry run. Re-run with --write to apply.\n");
    return;
  }

  for (const u of updates) {
    const { error } = await db.from("tournaments").update(u.patch).eq("id", u.id);
    if (error) throw new Error(`update ${u.id}: ${error.message}`);
  }
  if (resultRows.length) {
    const { error } = await db.from("tournament_results").insert(resultRows);
    if (error) throw new Error(`insert results: ${error.message}`);
  }
  console.log("\nApplied.\n");
}

main().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
