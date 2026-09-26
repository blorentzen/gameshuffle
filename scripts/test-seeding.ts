/**
 * Seeding methods and placement, against the spec's acceptance criteria.
 * Run: npx tsx scripts/test-seeding.ts
 */
import { buildSeedList, rngFrom, type SeedableEntrant } from "../src/lib/tournaments/seeding";
import { seedOrder } from "../src/lib/tournaments/bracket";
import { previewSeeding } from "../src/lib/tournaments/seedingPreview";
import { generateHeatMains } from "../src/lib/tournaments/heatMains";

let failed = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok || !detail ? "" : `  ${detail}`}`);
};
const eq = (name: string, got: unknown, want: unknown) =>
  check(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);

const field = (n: number, extra: (i: number) => Partial<SeedableEntrant> = () => ({})): SeedableEntrant[] =>
  Array.from({ length: n }, (_, i) => ({ id: String(i + 1), joinedAt: `2026-01-0${(i % 9) + 1}T00:00:00Z`, ...extra(i) }));

// ── Criterion 7: same seed, same draw ─────────────────────────────────────
const a = buildSeedList(field(12), { method: "random", rng: "abc" });
const b = buildSeedList(field(12), { method: "random", rng: "abc" });
const c = buildSeedList(field(12), { method: "random", rng: "different" });
eq("same rng reproduces the draw", a, b);
check("different rng gives a different draw", JSON.stringify(a) !== JSON.stringify(c));
check("random keeps everyone exactly once", new Set(a).size === 12 && a.length === 12);

// ── Criterion 6: Protected pins the top N, randomises the rest ────────────
const prot = (rng: string) => buildSeedList(
  field(10, (i) => (i === 4 ? { protectedRank: 1 } : i === 7 ? { protectedRank: 2 } : {})),
  { method: "protected", rng, protectedCount: 2 },
);
eq("protected: pins are seeds 1 and 2", prot("x").slice(0, 2), ["5", "8"]);
check("protected: the rest vary by rng", JSON.stringify(prot("x").slice(2)) !== JSON.stringify(prot("y").slice(2)));

// ── Criterion 5: Tiered orders A > B > C, varies within a tier ────────────
const tierField = field(9, (i) => ({ tier: i < 3 ? "A" as const : i < 6 ? "B" as const : "C" as const }));
const t1 = buildSeedList(tierField, { method: "tiered", rng: "p" });
const t2 = buildSeedList(tierField, { method: "tiered", rng: "q" });
check("tiered: all A above all B above all C",
  t1.slice(0, 3).every((id) => Number(id) <= 3) &&
  t1.slice(3, 6).every((id) => Number(id) > 3 && Number(id) <= 6) &&
  t1.slice(6).every((id) => Number(id) > 6), JSON.stringify(t1));
check("tiered: order within a tier varies", JSON.stringify(t1) !== JSON.stringify(t2));
eq("tiered: untagged counts as B",
  buildSeedList([{ id: "x", tier: "A" }, { id: "y" }, { id: "z", tier: "C" }], { method: "tiered", rng: "r" }),
  ["x", "y", "z"]);

// ── Manual: explicit order wins, the rest sit beneath in entry order ──────
eq("manual: pinned order then entry order",
  buildSeedList(field(5, (i) => (i === 3 ? { manualSeed: 1 } : i === 1 ? { manualSeed: 2 } : {})),
    { method: "manual", rng: "z" }),
  ["4", "2", "1", "3", "5"]);

// ── Standings: ranked first, unranked below, shuffled ─────────────────────
const stand = buildSeedList(
  field(6, (i) => (i < 3 ? { standingsRank: 3 - i } : {})),
  { method: "standings", rng: "s" },
);
eq("standings: leader first, ranked in order", stand.slice(0, 3), ["3", "2", "1"]);
check("standings: unranked go below", stand.slice(3).every((id) => Number(id) > 3));

// ── Criterion 2 and 3: bracket placement (existing code, verified here) ───
eq("bracket of 8 keeps 1 and 2 apart", seedOrder(8), [1, 8, 4, 5, 2, 7, 3, 6]);
const o8 = seedOrder(8);
check("seeds 1-4 land in separate quarters",
  new Set([0, 1, 2, 3].map((q) => o8.slice(q * 2, q * 2 + 2).find((s) => s <= 4))).size === 4, JSON.stringify(o8));
const o16 = seedOrder(16);
check("bracket of 16: 1 and 2 in opposite halves",
  o16.indexOf(1) < 8 && o16.indexOf(2) >= 8, JSON.stringify(o16));
check("a field of 6 in an 8-bracket byes seeds 1 and 2",
  [1, 2].every((s) => { const opp = o8[o8.indexOf(s) % 2 === 0 ? o8.indexOf(s) + 1 : o8.indexOf(s) - 1]; return opp > 6; }),
  `pairs ${JSON.stringify(o8)}`);

// ── Criterion 13: odd field sizes lose nobody ─────────────────────────────
for (const n of [5, 6, 9, 13]) {
  for (const m of ["random", "tiered", "protected", "standings", "manual"] as const) {
    const out = buildSeedList(field(n, (i) => ({ tier: (["A", "B", "C"] as const)[i % 3], protectedRank: i === 0 ? 1 : null })), { method: m, rng: "k" });
    check(`${m}, field of ${n}: all ${n} present once`, new Set(out).size === n && out.length === n);
  }
}

// The RNG must be stable across runs, or "reproducible" is a lie.
eq("rng is stable", [0, 1, 2].map(() => Math.floor(rngFrom("fixed-seed")() * 1e6)), [Math.floor(rngFrom("fixed-seed")() * 1e6), Math.floor(rngFrom("fixed-seed")() * 1e6), Math.floor(rngFrom("fixed-seed")() * 1e6)]);


// ── Preview agrees with what actually runs ────────────────────────────────

{
  // The heat preview must match splitHeats exactly, or it teaches a lie.
  const real = generateHeatMains(Array.from({ length: 8 }, (_, i) => String(i + 1)), { series: 1, heatSize: 4 })
    .heats.map((h) => h.drivers.map(Number));
  const shown = previewSeeding({ format: "heat_mains", fieldSize: 8, heatSize: 4 }).groups.map((g) => g.seeds);
  eq("preview heats match the real split", shown, real);

  const br = previewSeeding({ format: "single_elim", fieldSize: 6 });
  eq("6 in an 8-bracket: byes shown as empty slots", br.groups.map((g) => g.seeds), [[1, null], [4, 5], [2, null], [3, 6]]);
  check("bye count is stated", br.note?.includes("2 byes") ?? false, br.note ?? "(none)");
  check("round robin explains itself", (previewSeeding({ format: "round_robin", fieldSize: 8 }).note ?? "").includes("everyone"));
}

console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
