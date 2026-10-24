/**
 * Builds Trainer Road's duels ahead of time for a month (the cron does the same a few at a time),
 * stored in road_duels on the .env.local project (dev), or another project with SUPABASE_URL +
 * SUPABASE_SERVICE_ROLE_KEY set. A duel already stored is kept, unless it's on older rules and nobody
 * has started it: then it's built again on the newest.
 *
 *   npx tsx -r ./scripts/server-only-shim.cjs scripts/build-road-duels.ts [--month 2026-11-01] [--region kanto] [--only id,id] [--minutes 60]
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { DUEL_DATA } from "../src/lib/originals/duel/data";
import { regionOf, roadMonth } from "../src/lib/originals/duel/road";
import { ensureRoadDuels } from "../src/lib/originals/duel/roadStore";
import { gsDay } from "../src/lib/time/gsClock";

const args = process.argv.slice(2);
const value = (name: string) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };

async function main() {
  const month = value("month") ?? roadMonth(gsDay());
  const region = value("region");
  const only = value("only")?.split(",") ?? (region ? DUEL_DATA.trainers.filter((t) => regionOf(t) === region).map((t) => t.id) : undefined);
  const minutes = Number(value("minutes") ?? 60);
  const t0 = Date.now();
  const got = await ensureRoadDuels(minutes * 60_000, { month, only, data: DUEL_DATA });
  console.log(`${month}: built ${got.built}, ${got.left} left, ${Math.round((Date.now() - t0) / 1000)}s`);
}

main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
