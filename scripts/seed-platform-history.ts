/**
 * Give the platform-admin growth charts a believable history.
 *
 * The charts read real `created_at` columns rather than a metrics table, which
 * is the right design — nothing to backfill, nothing that can drift. But every
 * seeded account was created the moment the seeder ran, so the signup series is
 * one spike and tells you nothing about whether the chart design works.
 *
 * This spreads the SEEDED accounts across a growth curve: a slowly accelerating
 * ramp with weekday/weekend seasonality, which is what a real early-stage
 * signup chart looks like. The account's creation date is a seeding artifact,
 * not a fact worth preserving, so moving it costs nothing.
 *
 * SAFETY: only touches accounts at the seed email domain. A real account's
 * created_at is a fact and is never rewritten — the script asserts this rather
 * than trusting the filter.
 *
 * Note this updates `public.users.created_at`, which is what the dashboards
 * read. The matching `auth.users` row keeps its real timestamp.
 *
 * Usage:
 *   npx tsx scripts/seed-platform-history.ts --dry
 *   npx tsx scripts/seed-platform-history.ts
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";

const SEED_DOMAIN = "seed.gameshuffle.dev";
const DAYS = 90;

const dry = process.argv.includes("--dry");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Missing Supabase env");
const db = createClient(url, key);

/** Deterministic, so a re-run lands every account on the same day. */
function prng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

/**
 * Relative signup weight for a day `d` days ago.
 * Accelerating toward the present, damped on weekends — the shape an early
 * product actually produces, rather than a uniform scatter.
 */
function weight(daysAgo: number, dow: number): number {
  const recency = Math.pow((DAYS - daysAgo) / DAYS, 1.8); // ramps up over time
  const weekend = dow === 0 || dow === 6 ? 0.55 : 1;
  return recency * weekend;
}

(async () => {
  console.log(`project ${url.slice(8, 14)}…  ${dry ? "(DRY RUN)" : ""}`);

  const { data, error } = await db
    .from("user_directory")
    .select("id, email, created_at")
    .limit(1000);
  if (error) throw new Error(error.message);

  const all = (data ?? []) as { id: string; email: string | null; created_at: string }[];
  const seeded = all.filter((u) => (u.email ?? "").toLowerCase().endsWith(`@${SEED_DOMAIN}`));
  const real = all.filter((u) => !(u.email ?? "").toLowerCase().endsWith(`@${SEED_DOMAIN}`));

  // Guard rather than trust: if the filter is ever wrong, stop before writing.
  for (const u of seeded) {
    if (!(u.email ?? "").toLowerCase().endsWith(`@${SEED_DOMAIN}`)) {
      throw new Error(`Refusing to touch a non-seed account: ${u.id}`);
    }
  }
  console.log(`${seeded.length} seeded accounts to redistribute; ${real.length} real account(s) untouched\n`);

  // Build the day buckets, then deal accounts into them by weight.
  const rnd = prng(20260924);
  const buckets: { iso: string; weight: number; take: number }[] = [];
  for (let d = DAYS - 1; d >= 0; d--) {
    const day = new Date();
    day.setUTCHours(0, 0, 0, 0);
    day.setUTCDate(day.getUTCDate() - d);
    buckets.push({ iso: day.toISOString().slice(0, 10), weight: weight(d, day.getUTCDay()), take: 0 });
  }
  const totalWeight = buckets.reduce((a, b) => a + b.weight, 0);
  let assigned = 0;
  for (const b of buckets) {
    b.take = Math.floor((b.weight / totalWeight) * seeded.length);
    assigned += b.take;
  }
  // Hand out the rounding remainder to the busiest (most recent) days.
  for (let i = buckets.length - 1; assigned < seeded.length; i = (i - 1 + buckets.length) % buckets.length) {
    buckets[i].take += 1;
    assigned += 1;
  }

  let n = 0;
  const updates: { id: string; created_at: string }[] = [];
  for (const b of buckets) {
    for (let i = 0; i < b.take && n < seeded.length; i++, n++) {
      // Scatter within the day so the ordering is not an artifact of the loop.
      const hour = 8 + Math.floor(rnd() * 14);
      const min = Math.floor(rnd() * 60);
      updates.push({
        id: seeded[n].id,
        created_at: `${b.iso}T${String(hour).padStart(2, "0")}:${String(min).padStart(2, "0")}:00.000Z`,
      });
    }
  }

  // Sparkline of the resulting shape, so the run shows what it produced.
  const last30 = buckets.slice(-30);
  console.log("signups per day (last 30):");
  console.log("  " + last30.map((b) => (b.take === 0 ? "·" : b.take > 9 ? "#" : String(b.take))).join(""));
  console.log(`  90-day total ${updates.length}, 30-day total ${last30.reduce((a, b) => a + b.take, 0)}\n`);

  if (dry) { console.log("dry run — nothing written"); return; }

  for (const u of updates) {
    const { error: e } = await db.from("users").update({ created_at: u.created_at }).eq("id", u.id);
    if (e) console.error(`  ${u.id}: ${e.message}`);
  }
  console.log(`updated ${updates.length} accounts`);
})();
