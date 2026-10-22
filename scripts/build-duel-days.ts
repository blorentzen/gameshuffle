/**
 * Builds the Daily Duel ahead of time: the next N days (from today, Pacific), stored in duel_days
 * on the .env.local project (dev). Prints each day's trainer, pack, par and how long it took.
 * A day already stored is kept as is (players may have started it).
 *
 *   npx tsx -r ./scripts/server-only-shim.cjs scripts/build-duel-days.ts [--days 7] [--from 2026-10-28] [--dry] [--fixtures]
 *     --dry        build and print, store nothing
 *     --fixtures   use scripts/duel-fixtures.ts instead of the real roster (implies --dry unless --save)
 *     --budget 30  seconds of search per day (default 30)
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { gsAddDays, gsDay } from "../src/lib/time/gsClock";
import { buildDay } from "../src/lib/originals/duel/solver";
import { duelNumber } from "../src/lib/originals/duel/rules";
import type { DuelCard, DuelTrainer } from "../src/lib/originals/duel/types";

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const value = (name: string) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };

async function main() {
  const days = Number(value("days") ?? 7);
  const from = value("from") ?? gsDay();
  const budgetMs = Number(value("budget") ?? 30) * 1000;
  const fixtures = flag("fixtures");
  const dry = flag("dry") || (fixtures && !flag("save"));

  let data: { cards: Readonly<Record<string, DuelCard>>; pool: readonly string[]; trainers: readonly DuelTrainer[] };
  if (fixtures) {
    const f = await import("./duel-fixtures");
    data = { cards: f.FIX_CARDS, pool: f.FIX_POOL, trainers: f.FIX_TRAINERS };
  } else {
    data = (await import("../src/lib/originals/duel/data")).DUEL_DATA;
  }
  console.log(`${data.trainers.length} trainers, ${data.pool.length} pool cards, ${Object.keys(data.cards).length} cards${fixtures ? " (fixtures)" : ""}${dry ? ", not storing" : ""}`);

  const store = dry ? null : await import("../src/lib/originals/duel/store");
  let total = 0;
  for (let i = 0; i < days; i++) {
    const day = gsAddDays(from, i);
    const t0 = Date.now();
    if (store) {
      const have = await store.getDay(day, { build: false });
      if (have) {
        console.log(`${day} #${have.number} kept: ${have.tier} ${have.trainer.name}, par ${have.par}`);
        continue;
      }
      const made = await store.buildAndSaveDay(day, { budgetMs, data });
      const ms = Date.now() - t0;
      total += ms;
      if (!made?.build) { console.log(`${day} #${duelNumber(day)} FAILED (${ms}ms)`); continue; }
      print(day, made.build, data, ms);
    } else {
      const b = buildDay(day, data.pool, data.cards, data.trainers, "", { budgetMs });
      const ms = Date.now() - t0;
      total += ms;
      if (!b) { console.log(`${day} #${duelNumber(day)} FAILED (${ms}ms)`); continue; }
      print(day, b, data, ms);
    }
  }
  console.log(`done in ${(total / 1000).toFixed(1)}s`);
}

function print(day: string, b: NonNullable<ReturnType<typeof buildDay>>, data: { cards: Readonly<Record<string, DuelCard>>; trainers: readonly DuelTrainer[] }, ms: number) {
  const t = data.trainers.find((x) => x.id === b.trainerId)!;
  const pack = b.pack.map((id) => data.cards[id]?.short ?? id).join(", ");
  const team = t.team.map((id) => data.cards[id]?.short ?? id).join(", ");
  console.log(`${day} #${b.number} ${b.tier.padEnd(8)} ${t.name} (${t.team.length}) par ${b.par}${b.inBand ? "" : " (outside the band)"} · obvious lost on ${b.obviousTurns} · ${b.attempts} ${b.attempts === 1 ? "try" : "tries"} · ${ms}ms`);
  console.log(`    team: ${team}`);
  console.log(`    pack: ${pack}`);
  console.log(`    events: ${b.events.filter((e) => e.turn <= b.par + 2).map((e) => `${e.turn}:${e.kind}`).join(" ")}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
