// Races against the cast (src/lib/kart/grandprix.ts and friends): determinism,
// every item, every quirk, boxes, odds by place, bumps, and 2,000 seeded races.
//   npx tsx scripts/test-kart-race.ts            (everything, about a minute)
//   npx tsx scripts/test-kart-race.ts --quick    (200 bulk races)
import { fork } from "child_process";
import { cpus } from "os";
import { autopilot } from "../src/lib/kart/autopilot";
import { createPlayerBot, PLAYER_GOOD, PLAYER_SLOPPY, profileFor } from "../src/lib/kart/ai";
import { CAST, FIRST_TRACK, type BodyId, type WheelId } from "../src/lib/kart/content";
import { dealField, FIELD_TUNING, gpStats } from "../src/lib/kart/field";
import {
  createGrandPrix,
  dealItem,
  decodeGpLog,
  encodeGpLog,
  gpHash,
  gpSettle,
  gpStep,
  leaderOf,
  NO_GP_INPUT,
  packGpInput,
  replayGrandPrix,
  roadPoint,
  standings,
  trackGeo,
  unpackGpInput,
  type Difficulty,
  type GpEvent,
  type GpInput,
  type GrandPrix,
  type GrandPrixOpts,
} from "../src/lib/kart/grandprix";
import { ITEM_IDS, ITEM_ODDS, ITEM_TUNING, ITEM_VALUE, itemOdds, oddsColumn, pickItem, ticks, type ItemId } from "../src/lib/kart/items";
import { startState, stepKart, TUNING } from "../src/lib/kart/physics";
import { QUIRKS } from "../src/lib/kart/quirks";
import { createRace, raceStep, unpackInput, you } from "../src/lib/kart/race";
import { seeded } from "../src/lib/kart/rng";
import { dealRoll, type Roll } from "../src/lib/kart/roll";
import { statsFor } from "../src/lib/kart/roster";
import { buildTrack, nearest, type Track } from "../src/lib/kart/track";

// A worker for the bulk races runs only them (bulk() is declared further down).
if (process.argv[2] === "--bulk") {
  const res = bulk(Number(process.argv[3]), Number(process.argv[4]));
  process.send?.(res, () => process.exit(0));
} else {
  units();
}

function units(): void {
let pass = 0, fail = 0;
const ok = (cond: boolean, what: string) => { if (cond) pass++; else { fail++; if (fail < 60) console.error("✗", what); } };

const track = buildTrack(FIRST_TRACK);
const mirror = buildTrack(FIRST_TRACK, true);

// ───────────── helpers ─────────────
function rollAs(driver: string, seed = 4242, twist: Roll["twist"] = "none"): Roll {
  return { ...dealRoll(seed), driver, twist };
}
/** Everyone sits still (the computer drivers are switched off by giving every racer an input). */
function idle(gp: GrandPrix): GpInput[] {
  return gp.riders.map(() => NO_GP_INPUT);
}
function toGo(gp: GrandPrix): void {
  while (gp.race.tick < 0) gpStep(gp, idle(gp));
}
/** A race at GO with nothing in the way: no boxes, AI off unless asked. */
function lab(driver = "you", seed = 4242, opts: Partial<GrandPrixOpts> = {}): GrandPrix {
  const gp = createGrandPrix({ roll: rollAs(driver, seed), ...opts });
  gp.boxes = [];
  toGo(gp);
  return gp;
}
/** Puts racer i on the road at s (along the first lap) and lat, moving at speed. */
function put(gp: GrandPrix, i: number, s: number, lat: number, speed = 0): void {
  const p = roadPoint(gp.race.track, s, lat);
  const r = gp.race.racers[i];
  const k = r.kart;
  Object.assign(k, { x: p.x, y: p.y, h: p.h, vx: Math.cos(p.h) * speed, vy: Math.sin(p.h) * speed, speed, z: 0, vz: 0, grounded: true, ground: 0, groundVz: 0, drift: 0, charge: 0, tier: 0, boost: 0, swing: 0 });
  const geo = trackGeo(gp.race.track);
  let last = 0;
  geo.gateS.forEach((g, q) => { if (g <= s) last = q; });
  r.passed = last + 1;
  r.maxPassed = last + 1;
  const n = gp.race.track.n;
  gp.riders[i].near = { i: Math.floor((s / gp.race.track.length) * n) % n, t: 0, dist: 0, hw: 64, s };
}
/** Parks everyone but the listed racers in a row behind the line, out of the way. */
function parkOthers(gp: GrandPrix, keep: number[], at = 20): void {
  let q = 0;
  for (let i = 0; i < gp.riders.length; i++) {
    if (keep.includes(i)) continue;
    put(gp, i, at + Math.floor(q / 3) * 26, -40 + (q % 3) * 40, 0);
    q++;
  }
}
/** Drives along the centerline (or a lane), ignoring everything. */
function cruise(gp: GrandPrix, i: number, lane = 0): GpInput {
  return { ...autopilot(gp.race.track, gp.race.racers[i].kart, { near: gp.riders[i].near, offset: lane }), item: false };
}
function run(gp: GrandPrix, steps: number, inputs: (gp: GrandPrix) => (GpInput | null)[]): GpEvent[] {
  const out: GpEvent[] = [];
  for (let n = 0; n < steps && !gp.over; n++) out.push(...gpStep(gp, inputs(gp)).events);
  return out;
}
const has = (ev: GpEvent[], f: (e: GpEvent) => boolean) => ev.some(f);

// ───────────── the lookup grid gives exactly the full scan ─────────────
function bruteNearest(t: Track, x: number, y: number) {
  const { xs, ys, n } = t;
  let bi = 0, bt = 0, bd = Infinity;
  for (let i = 0; i < n; i++) {
    const ax = xs[i], ay = ys[i];
    const k = i + 1 === n ? 0 : i + 1;
    const ex = xs[k] - ax, ey = ys[k] - ay;
    const len2 = ex * ex + ey * ey || 1;
    let tt = ((x - ax) * ex + (y - ay) * ey) / len2;
    if (tt < 0) tt = 0; else if (tt > 1) tt = 1;
    const px = ax + ex * tt - x, py = ay + ey * tt - y;
    const d = px * px + py * py;
    if (d < bd) { bd = d; bi = i; bt = tt; }
  }
  return { i: bi, t: bt, dist: Math.sqrt(bd) };
}
{
  const rnd = seeded(99);
  let same = 0, total = 0;
  for (const t of [track, mirror]) {
    for (let q = 0; q < 150000; q++) {
      const x = -300 + rnd() * 2650, y = -300 + rnd() * 2650;
      const a = nearest(t, x, y), b = bruteNearest(t, x, y);
      total++;
      if (a.i === b.i && a.t === b.t && a.dist === b.dist) same++;
    }
    // Right on the centerline and the segment ends (ties).
    for (let i = 0; i < t.n; i++) {
      const a = nearest(t, t.xs[i], t.ys[i]), b = bruteNearest(t, t.xs[i], t.ys[i]);
      total++;
      if (a.i === b.i && a.t === b.t && a.dist === b.dist) same++;
    }
  }
  ok(same === total, `the nearest-point grid matches the full scan exactly (${same} of ${total})`);
}

// ───────────── the time trial is untouched ─────────────
{
  // Finish times of autopilot runs recorded before races against the cast existed.
  const want: [string, BodyId, WheelId, boolean, number][] = [
    ["gary", "box", "slim", false, 4490.995679483281],
    ["skip", "round", "small", false, 4723.057794876215],
    ["you", "low", "chunky", false, 4608.007536072461],
    ["max", "box", "chunky", false, 4527.836598502929],
    ["gary", "box", "slim", true, 4490.995679483287],
  ];
  for (const [d, b, w, m, at] of want) {
    const t = m ? mirror : track;
    const race = createRace(t, statsFor(d, b, w));
    while (you(race).finishAt === null && race.tick < 60 * 200) raceStep(race, autopilot(t, you(race).kart, { drift: true, look: 56 }));
    ok(you(race).finishAt === at, `time trial ${d} ${b} ${w}${m ? " mirrored" : ""} finishes at exactly the same step as before (${you(race).finishAt})`);
  }
  ok(statsFor("skip", "round", "small").charge === 1, "the time trial's karts don't get quirks");
}

// ───────────── the field ─────────────
{
  for (let s = 1; s <= 300; s++) {
    const roll = dealRoll(s * 104729);
    const f = dealField(roll);
    ok(f.length === 8, "eight racers");
    ok(f[0].human && f.slice(1).every((c) => !c.human), "racer 0 is you, the rest are the computer");
    ok(f[0].grid >= 6, `you start on the back row (slot ${f[0].grid + 1})`);
    ok(new Set(f.map((c) => c.grid)).size === 8 && f.every((c) => c.grid >= 0 && c.grid < 8), "every grid slot used once");
    const ids = f.map((c) => c.id);
    ok(new Set(ids).size === 8, "no racer twice");
    if (roll.driver !== "you") ok(CAST.every((c) => ids.includes(c.id)) && f[0].id === roll.driver, "as a cast member, the other seven are the rest of the cast");
    else ok(f.slice(1).every((c) => CAST.some((m) => m.id === c.id)), "as yourself, seven of the cast");
    ok(JSON.stringify(dealField(roll)) === JSON.stringify(f), "the same roll lines up the same field");
  }
  const seen = new Set<string>();
  for (let s = 1; s <= 200; s++) {
    const f = dealField({ ...dealRoll(s), driver: "you" });
    CAST.forEach((c) => { if (!f.some((x) => x.id === c.id)) seen.add(c.id); });
  }
  ok(seen.size === CAST.length, "racing as yourself, each cast member sits out sometimes");
  const max = gpStats("max", "low", "chunky");
  const felix = gpStats("felix", "low", "chunky");
  ok(max.top > felix.top, "Speed 5 is faster than Speed 2");
  ok(Math.abs(gpStats("you", "low", "chunky").top - statsFor("you", "low", "chunky").top) < 1e-9, "racing as yourself, your kart is the time trial's kart");
  ok(gpStats("gary", "box", "slim").grip > gpStats("al", "box", "slim").grip, "Handling 5 grips better than Handling 2");
  ok(FIELD_TUNING.classTop.light > 0 && FIELD_TUNING.classTop.heavy < 0, "weight classes are closer in races against the cast");
}

// ───────────── determinism, replay, saving and resuming ─────────────
{
  for (const [seed, driver, setting, diff] of [[11, "you", "good", "normal"], [12, "pip", "sloppy", "hard"], [13, "felix", "good", "easy"], [14, "max", "sloppy", "normal"]] as const) {
    const opts: GrandPrixOpts = { roll: rollAs(driver, seed, seed % 2 ? "mirror" : "none"), difficulty: diff as Difficulty };
    const a = createGrandPrix(opts);
    const b = createGrandPrix(opts);
    const botA = createPlayerBot(setting === "good" ? PLAYER_GOOD : PLAYER_SLOPPY, seed);
    const botB = createPlayerBot(setting === "good" ? PLAYER_GOOD : PLAYER_SLOPPY, seed);
    let sameAll = true;
    let saved: string | null = null;
    while (!a.over) {
      gpStep(a, botA.input(a));
      gpStep(b, botB.input(b));
      if (a.race.tick % 300 === 0 && gpHash(a) !== gpHash(b)) sameAll = false;
      if (a.race.tick === 1500) saved = JSON.stringify(a);
    }
    ok(sameAll && gpHash(a) === gpHash(b), `same seed and inputs, same race (${driver}, ${diff})`);
    ok(JSON.stringify(standings(a)) === JSON.stringify(standings(b)), "same standings");
    const again = replayGrandPrix(opts, decodeGpLog(encodeGpLog(a.log)));
    ok(gpHash(again) === gpHash(a) && JSON.stringify(standings(again)) === JSON.stringify(standings(a)), `replaying the input log gives the same race to the bit (${a.log.length} steps)`);
    // Save mid-race as JSON, load it, and carry on with the same inputs.
    if (saved) {
      const resumed = JSON.parse(saved) as GrandPrix;
      resumed.race.track = a.race.track;
      for (const v of a.log.slice(resumed.log.length)) gpStep(resumed, unpackGpInput(v));
      ok(gpHash(resumed) === gpHash(a), "a race saved as JSON mid-race and resumed ends the same");
    }
    ok(a.log.every((v) => packGpInput(unpackGpInput(v)) === v), "inputs pack and unpack");
  }
  {
    const opts: GrandPrixOpts = { roll: rollAs("you", 77) };
    const a = createGrandPrix(opts);
    const bot = createPlayerBot(PLAYER_GOOD, 1);
    while (!a.over) gpStep(a, bot.input(a));
    const changed = a.log.slice();
    changed[400] = packGpInput({ ...unpackGpInput(changed[400]), steer: -1 });
    ok(gpHash(replayGrandPrix(opts, changed)) !== gpHash(a), "a different input gives a different race");
  }
}

// ───────────── items ─────────────
{
  // Coffee and Energy Drink.
  for (const [item, secs] of [["coffee", ITEM_TUNING.coffee.boost], ["energy-drink", ITEM_TUNING.energyDrink.boost]] as const) {
    const gp = lab();
    parkOthers(gp, [0]);
    put(gp, 0, 150, 0, 200);
    gpSettle(gp);
    gp.riders[0].item = item;
    const ev = gpStep(gp, [{ ...cruise(gp, 0), gas: true, item: true }, ...gp.riders.slice(1).map(() => NO_GP_INPUT)]).events;
    const k = gp.race.racers[0].kart;
    ok(has(ev, (e) => e.type === "use" && e.item === item) && gp.riders[0].item === null, `${item}: used and gone from the slot`);
    ok(Math.abs(k.boost - (secs - TUNING.dt)) < 1e-9, `${item}: ${secs}s of boost`);
    let top = 0;
    for (let n = 0; n < 40; n++) { gpStep(gp, [{ ...cruise(gp, 0), gas: true }, ...gp.riders.slice(1).map(() => NO_GP_INPUT)]); top = Math.max(top, k.speed); }
    ok(top > gp.riders[0].eff.top * 1.05, `${item}: faster than top speed while it lasts (${top.toFixed(0)})`);
  }

  // Shield: raised it blocks a dart; held in the slot it blocks too; without it you spin.
  for (const how of ["raised", "held", "none"] as const) {
    const gp = lab();
    parkOthers(gp, [0, 1]);
    put(gp, 1, 120, 0, 0);
    put(gp, 0, 300, 0, 0);
    const k1 = gp.race.racers[1].kart;
    Object.assign(gp.race.racers[0].kart, { x: k1.x + Math.cos(k1.h) * 180, y: k1.y + Math.sin(k1.h) * 180 });
    gpSettle(gp);
    if (how !== "none") gp.riders[0].item = "shield";
    gp.riders[1].item = "dart-blaster";
    const inp = (g: GrandPrix, fire: boolean, raise: boolean) => g.riders.map((_, i) => (i === 0 ? { ...NO_GP_INPUT, item: raise } : i === 1 ? { ...NO_GP_INPUT, item: fire } : NO_GP_INPUT));
    const ev = [...gpStep(gp, inp(gp, false, how === "raised")).events];
    if (how === "raised") ok(gp.riders[0].bubble > 0 && gp.riders[0].item === null, "Shield raised: a bubble, and the slot is free");
    ev.push(...gpStep(gp, inp(gp, true, false)).events);
    ev.push(...run(gp, 90, (g) => inp(g, false, false)));
    if (how === "none") ok(has(ev, (e) => e.type === "hit" && e.racer === 0 && e.kind === "dart" && e.by === 1), "a Dart Blaster from behind hits you");
    else {
      ok(has(ev, (e) => e.type === "block" && e.racer === 0 && e.kind === "dart") && !has(ev, (e) => e.type === "hit" && e.racer === 0), `Shield ${how}: blocks the dart`);
      ok(gp.riders[0].bubble === 0 && gp.riders[0].item === null, `Shield ${how}: used up by the block`);
    }
  }

  // Oil Slick: dropped behind; whoever drives through spins; Gary doesn't, and it stays.
  for (const driver of ["max", "gary"]) {
    const gp = lab("you", 4242);
    const victim = gp.riders.findIndex((r) => r.driver === driver);
    if (victim < 0) { ok(false, `${driver} is in the field`); continue; }
    parkOthers(gp, [0, victim]);
    put(gp, 0, 300, 0, 120);
    put(gp, victim, 140, 0, 120);
    gpSettle(gp);
    gp.riders[0].item = "oil-slick";
    const k0 = gp.race.racers[0].kart;
    const ev = gpStep(gp, gp.riders.map((_, i) => (i === 0 ? { ...cruise(gp, 0), item: true } : i === victim ? cruise(gp, victim) : NO_GP_INPUT))).events;
    ok(has(ev, (e) => e.type === "use" && e.item === "oil-slick" && e.racer === 0), "Oil Slick: used");
    const sl = gp.slicks[0];
    ok(!!sl && Math.hypot(sl.x - k0.x, sl.y - k0.y) > 15 && Math.hypot(sl.x - k0.x, sl.y - k0.y) < 40, "Oil Slick lands just behind you");
    const later = run(gp, 150, (g) => g.riders.map((_, i) => (i === 0 || i === victim ? cruise(g, i) : NO_GP_INPUT)));
    if (driver === "gary") {
      ok(has(later, (e) => e.type === "slick-proof" && e.racer === victim) && !has(later, (e) => e.type === "hit" && e.racer === victim), "Gary drives over an Oil Slick and doesn't slip");
      ok(gp.slicks.length === 1, "and the slick is still there for the next one");
    } else {
      ok(has(later, (e) => e.type === "hit" && e.racer === victim && e.kind === "slick"), "driving through an Oil Slick spins you out");
      ok(gp.slicks.length === 0, "and the slick is gone");
    }
  }
  {
    // Your own slick can't catch you as you drop it, and it dries up.
    const gp = lab();
    parkOthers(gp, [0]);
    put(gp, 0, 200, 0, 0);
    gpSettle(gp);
    gp.riders[0].item = "oil-slick";
    const ev = run(gp, ticks(ITEM_TUNING.oilSlick.life) + 5, (g) => g.riders.map((_, i) => (i === 0 ? { ...NO_GP_INPUT, item: g.race.tick < 3 } : NO_GP_INPUT)));
    ok(!has(ev, (e) => e.type === "hit"), "dropping a slick standing still doesn't spin you in the grace time");
    ok(gp.slicks.length === 0, "a slick dries up after its life");
  }

  // Homing Missile: locks on to the racer just ahead and catches them.
  {
    const gp = lab();
    parkOthers(gp, [0, 1]);
    put(gp, 0, 120, 0, 200);
    put(gp, 1, 420, 20, 200);
    gpSettle(gp);
    ok(gp.riders[1].place === gp.riders[0].place - 1, "set up: racer 1 is just ahead of you");
    gp.riders[0].item = "homing-missile";
    const ev = run(gp, 240, (g) => g.riders.map((_, i) => (i <= 1 ? { ...cruise(g, i, i === 1 ? 20 : 0), item: i === 0 && g.race.tick < 3 } : NO_GP_INPUT)));
    ok(has(ev, (e) => e.type === "use" && e.item === "homing-missile" && e.target === 1), "the Homing Missile locks on to the racer ahead");
    ok(has(ev, (e) => e.type === "hit" && e.racer === 1 && e.kind === "missile" && e.by === 0), "and hits them");
  }

  // Dart Blaster: straight where you aim, off the walls.
  {
    const gp = lab();
    parkOthers(gp, [0, 1]);
    put(gp, 0, 150, 0, 0);
    put(gp, 1, 360, 0, 0);
    gpSettle(gp);
    gp.riders[0].item = "dart-blaster";
    const k = gp.race.racers[0].kart;
    gpStep(gp, gp.riders.map((_, i) => (i === 0 ? { ...NO_GP_INPUT, item: true } : NO_GP_INPUT)));
    const s = gp.shots[0];
    ok(!!s && Math.abs(Math.atan2(s.vy, s.vx) - k.h) < 1e-9, "the dart flies the way you face");
    const ev = run(gp, 60, (g) => idle(g));
    ok(has(ev, (e) => e.type === "hit" && e.racer === 1 && e.kind === "dart"), "and hits a kart in its path");
  }
  {
    const gp = lab();
    parkOthers(gp, [0]);
    const b = gp.race.track.bounds;
    const k = gp.race.racers[0].kart;
    Object.assign(k, { x: b.x0 + 80, y: (b.y0 + b.y1) / 2, h: Math.PI, vx: 0, vy: 0 });
    gp.riders[0].item = "dart-blaster";
    gpStep(gp, gp.riders.map((_, i) => (i === 0 ? { ...NO_GP_INPUT, item: true } : NO_GP_INPUT)));
    const s = gp.shots[0];
    ok(!!s && s.vx < 0, "a dart fired at the wall heads for it");
    for (let n = 0; n < 12; n++) gpStep(gp, idle(gp));
    ok(s.bounces >= 1 && s.vx > 0, "and bounces off it");
    ok(s.x >= b.x0, "never through it");
    // It can come back and hit you (after the grace time), or run out.
    run(gp, 300, (g) => idle(g));
    ok(gp.shots.length === 0, "a dart is gone after its bounces or its life");
  }
  {
    // A dart passing 13 units from a kart's middle: hits a normal kart, misses Pip.
    for (const driver of ["max", "pip"]) {
      const gp = lab("you", 4242);
      const t = gp.riders.findIndex((r) => r.driver === driver);
      if (t < 0) { ok(false, `${driver} in the field`); continue; }
      parkOthers(gp, [t], 2000);
      put(gp, t, 300, 0, 0);
      put(gp, 0, 3000, 0, 0);
      gpSettle(gp);
      const k = gp.race.racers[t].kart;
      const nx = -Math.sin(k.h), ny = Math.cos(k.h);
      gp.shots.push({ id: 999, kind: "dart-blaster", owner: 0, x: k.x - Math.cos(k.h) * 100 + nx * 13, y: k.y - Math.sin(k.h) * 100 + ny * 13, z: 5, h: k.h, vx: Math.cos(k.h) * 560, vy: Math.sin(k.h) * 560, prog: 0, lat: 0, target: -1, skip: -1, age: 99, bounces: 0 });
      const ev = run(gp, 30, (g) => idle(g));
      const hit = has(ev, (e) => e.type === "hit" && e.racer === t);
      ok(driver === "pip" ? !hit : hit, driver === "pip" ? "Pip is harder to hit: a dart 13 units off misses him" : "a dart 13 units off a normal kart hits it");
    }
  }

  // Heat Seeker: to whoever is in first, with a blast around them; a Shield takes it but they're jolted.
  for (const shield of [false, true]) {
    const gp = lab();
    parkOthers(gp, [0, 3, 4]);
    put(gp, 0, 100, 0, 150);
    put(gp, 3, 430, -12, 150);
    put(gp, 4, 425, 22, 150);
    gpSettle(gp);
    const lead = gp.order[0];
    ok(lead === 3 || lead === 4, "set up: racer 3 or 4 leads");
    if (shield) gp.riders[lead].item = "shield";
    gp.riders[0].item = "heat-seeker";
    const leadKart = gp.race.racers[lead].kart;
    let before = 0;
    const ev: GpEvent[] = [];
    for (let n = 0; n < 240 && !ev.some((e) => e.type === "hit" || e.type === "block"); n++) {
      before = Math.hypot(leadKart.vx, leadKart.vy);
      ev.push(...gpStep(gp, gp.riders.map((_, i) => (i === 0 || i === 3 || i === 4 ? { ...cruise(gp, i, i === 3 ? -12 : i === 4 ? 22 : 0), item: i === 0 && gp.race.tick < 3 } : NO_GP_INPUT))).events);
    }
    const other = lead === 3 ? 4 : 3;
    if (!shield) {
      ok(has(ev, (e) => e.type === "hit" && e.racer === lead && e.kind === "heat"), "the Heat Seeker hits whoever is in first");
      ok(has(ev, (e) => e.type === "hit" && e.racer === other && e.kind === "splash"), "and catches the racer right beside them in the blast");
      ok(gp.riders[lead].spin >= ticks(ITEM_TUNING.hits.heat.spin) - 2, "a long spin-out");
    } else {
      ok(has(ev, (e) => e.type === "block" && e.racer === lead && e.kind === "heat"), "a Shield takes the Heat Seeker");
      ok(gp.riders[lead].spin === 0 && Math.hypot(leadKart.vx, leadKart.vy) < before * 0.7, "the leader doesn't spin but is jolted");
    }
  }
  {
    // Fired from first, it goes for whoever is in first besides you.
    const gp = lab();
    parkOthers(gp, [0, 1]);
    put(gp, 0, 400, 0, 0);
    put(gp, 1, 200, 0, 0);
    gpSettle(gp);
    ok(gp.order[0] === 0 && leaderOf(gp, 0) !== 0, "fired from first, the Heat Seeker never comes back for you");
  }

  // Shockwave: everyone ahead slows; nobody behind.
  {
    const gp = lab();
    for (let i = 1; i < 8; i++) put(gp, i, i < 4 ? 260 + i * 40 : 30 + i * 20, (i % 3) * 30 - 30, 180);
    put(gp, 0, 220, 0, 180);
    gpSettle(gp);
    const ahead = gp.riders.map((r, i) => (r.place < gp.riders[0].place ? i : -1)).filter((i) => i >= 0);
    gp.riders[0].item = "shockwave";
    const ev = gpStep(gp, gp.riders.map((_, i) => ({ ...cruise(gp, i), item: i === 0 }))).events;
    const slowed = ev.filter((e) => e.type === "slow").map((e) => (e as { racer: number }).racer).sort();
    ok(JSON.stringify(slowed) === JSON.stringify(ahead.sort()), `Shockwave slows exactly the ${ahead.length} racers ahead`);
    ok(ahead.every((i) => gp.riders[i].eff.top < gp.riders[i].base.top * (ITEM_TUNING.shockwave.top + 0.01)), "their top speed drops while it lasts");
    const behind = gp.riders.map((_, i) => i).filter((i) => i !== 0 && !ahead.includes(i));
    ok(behind.every((i) => gp.riders[i].slow === 0), "nobody behind is touched");
    ok(gp.shockWait > 0 && !itemOdds(8, 8, 0, ["shockwave"]).some((o) => o.id === "shockwave" && o.weight > 0), "and no Shockwave comes out of a box for a while");
  }

  // Smoke Bomb: the racer ahead can't see for two seconds (a computer racer drives worse).
  {
    const base = lab("you", 777);
    parkOthers(base, [0, 1]);
    put(base, 0, 150, 0, 200);
    put(base, 1, 330, 0, 200);
    gpSettle(base);
    const clear = JSON.parse(JSON.stringify(base)) as GrandPrix;
    clear.race.track = base.race.track;
    base.riders[0].item = "smoke-bomb";
    const ev = gpStep(base, base.riders.map((_, i) => (i === 0 ? { ...cruise(base, 0), item: true } : i === 1 ? null : NO_GP_INPUT))).events;
    gpStep(clear, clear.riders.map((_, i) => (i === 0 ? cruise(clear, 0) : i === 1 ? null : NO_GP_INPUT)));
    ok(has(ev, (e) => e.type === "smoke" && e.racer === 1) && base.riders[1].smoke > ticks(ITEM_TUNING.smokeBomb.time) - 3, "Smoke Bomb clouds the racer just ahead for two seconds");
    const s0a = base.riders[1].prog, s0b = clear.riders[1].prog;
    for (let n = 0; n < 110; n++) {
      gpStep(base, base.riders.map((_, i) => (i === 0 ? cruise(base, 0) : i === 1 ? null : NO_GP_INPUT)));
      gpStep(clear, clear.riders.map((_, i) => (i === 0 ? cruise(clear, 0) : i === 1 ? null : NO_GP_INPUT)));
    }
    ok(base.riders[1].prog - s0a < clear.riders[1].prog - s0b, `a smoked computer racer covers less ground (${(base.riders[1].prog - s0a).toFixed(0)} vs ${(clear.riders[1].prog - s0b).toFixed(0)})`);
  }
}

// ───────────── quirks ─────────────
{
  // Perfect starts: gas pressed in the window at GO, for everyone; Max's window is twice as wide.
  const startFor = (driver: string, press: number): string | null => {
    const gp = createGrandPrix({ roll: rollAs(driver, 5) });
    gp.boxes = [];
    for (let n = 0; n < 220; n++) {
      const gas = gp.race.tick >= press;
      gpStep(gp, gp.riders.map((_, i) => (i === 0 ? { ...NO_GP_INPUT, gas } : NO_GP_INPUT)));
    }
    return gp.riders[0].start;
  };
  ok(startFor("gary", -5) === "perfect" && startFor("max", -5) === "perfect", "gas just before GO: a perfect start");
  ok(startFor("gary", -15) === "early" && startFor("max", -15) === "perfect", "Max: twice as easy (0.25 s early is still perfect for him)");
  ok(startFor("gary", 10) === "late" && startFor("max", 10) === "perfect", "Max: and late presses too");
  ok(startFor("gary", -120) === "early" && startFor("max", -120) === "early", "holding gas from the start of the countdown is too early, even for Max");
  ok(startFor("you", 200) === "late", "no gas at all: late");
  {
    const gp = createGrandPrix({ roll: rollAs("felix", 5) });
    gp.boxes = [];
    const ev: GpEvent[] = [];
    while (gp.race.tick < 2) ev.push(...gpStep(gp, gp.riders.map((_, i) => (i === 0 ? { ...NO_GP_INPUT, gas: gp.race.tick >= -3 } : NO_GP_INPUT))).events);
    ok(has(ev, (e) => e.type === "boost" && e.racer === 0 && e.why === "start") && gp.race.racers[0].kart.boost > 1, "a perfect start is a boost (Start 5: a longer one)");
  }
  {
    // Computer racers: the Start stat and Max's window show in how often they get one.
    let maxP = 0, garyP = 0, n = 0;
    for (let s = 1; s <= 300; s++) {
      const gp = createGrandPrix({ roll: rollAs("you", s) });
      while (gp.race.tick < 20) gpStep(gp, NO_GP_INPUT);
      for (const r of gp.riders) {
        if (r.driver === "max" && r.start === "perfect") maxP++;
        if (r.driver === "gary" && r.start === "perfect") garyP++;
      }
      n++;
    }
    ok(maxP > garyP * 1.3, `computer Max gets perfect starts far more often than Gary (${maxP} vs ${garyP} of ${n})`);
  }

  // Cam: once a race, a free boost when a spin-out ends.
  {
    const gp = lab("cam");
    parkOthers(gp, [0], 3000);
    put(gp, 0, 200, 0, 150);
    gpSettle(gp);
    const zap = () => gp.shots.push({ id: gp.nextId++, kind: "dart-blaster", owner: 5, x: gp.race.racers[0].kart.x - 30, y: gp.race.racers[0].kart.y, z: 5, h: 0, vx: 500, vy: 0, prog: 0, lat: 0, target: -1, skip: -1, age: 99, bounces: 0 });
    zap();
    const ev = run(gp, 150, (g) => idle(g));
    zap();
    const ev2 = run(gp, 150, (g) => idle(g));
    ok(has(ev, (e) => e.type === "hit" && e.racer === 0) && has(ev, (e) => e.type === "boost" && e.racer === 0 && e.why === "chat"), "Cam: chat pulls through after the first hit");
    ok(has(ev2, (e) => e.type === "hit" && e.racer === 0) && !has(ev2, (e) => e.type === "boost" && e.racer === 0), "but only once a race");
  }

  // Al: longer spin-outs, then an angry boost every time.
  {
    const spinOf = (driver: string) => {
      const gp = lab(driver);
      parkOthers(gp, [0], 3000);
      put(gp, 0, 200, 0, 150);
      gpSettle(gp);
      gp.shots.push({ id: gp.nextId++, kind: "dart-blaster", owner: 5, x: gp.race.racers[0].kart.x - 30, y: gp.race.racers[0].kart.y, z: 5, h: 0, vx: 500, vy: 0, prog: 0, lat: 0, target: -1, skip: -1, age: 99, bounces: 0 });
      let longest = 0;
      const ev = run(gp, 200, (g) => { longest = Math.max(longest, g.riders[0].spin); return idle(g); });
      return { longest, angry: has(ev, (e) => e.type === "boost" && e.racer === 0 && e.why === "angry") };
    };
    const al = spinOf("al");
    const gary = spinOf("gary");
    ok(Math.abs(al.longest / gary.longest - (QUIRKS.al.spinMul ?? 1)) < 0.05, `Al spins ${QUIRKS.al.spinMul}x as long (${al.longest} vs ${gary.longest} steps)`);
    ok(al.angry && !gary.angry, "then gets an angry boost");
  }

  // Skip: drift sparks charge faster.
  {
    // Half a second of drifting down the start straight: the same kart, the charge it builds.
    const chargeAfter = (driver: string) => {
      const p0 = roadPoint(track, 60, 0);
      const k = { ...startState(track), x: p0.x, y: p0.y, h: p0.h, vx: Math.cos(p0.h) * 220, vy: Math.sin(p0.h) * 220 };
      const stats = gpStats(driver, "low", "chunky");
      for (let n = 0; n < 30; n++) stepKart(k, { steer: 0.8, gas: true, brake: false, drift: true, assist: false }, track, stats);
      return k.drift !== 0 ? k.charge : 0;
    };
    const skip = chargeAfter("skip");
    const pip = chargeAfter("pip");
    ok(skip > 0 && Math.abs(skip / pip - (QUIRKS.skip.charge ?? 1)) < 0.02, `Skip's drift sparks charge ${QUIRKS.skip.charge}x as fast (${skip.toFixed(3)} vs ${pip.toFixed(3)})`);
  }

  // Felix: better odds from every box (two deals, the rarer kept).
  {
    const gp = lab("you", 31);
    const felix = gp.riders.findIndex((r) => r.driver === "felix");
    const other = gp.riders.findIndex((r) => r.driver !== "felix" && !r.human);
    if (felix < 0) ok(false, "Felix in the field");
    else {
      for (const place of [1, 4, 8]) {
        const deal = (i: number) => {
          let strong = 0, value = 0;
          for (let n = 0; n < 4000; n++) {
            gp.riders[i].place = place;
            const it = dealItem(gp, i);
            if (it === "heat-seeker" || it === "shockwave" || it === "energy-drink" || it === "homing-missile") strong++;
            value += ITEM_VALUE[it];
          }
          return { strong, value: value / 4000 };
        };
        const f = deal(felix), o = deal(other);
        ok(f.value > o.value + 0.3 && f.strong >= o.strong, `Felix gets stronger items from the same box in ${place === 1 ? "first" : place === 8 ? "last" : `${place}th`} (value ${f.value.toFixed(2)} vs ${o.value.toFixed(2)})`);
      }
    }
  }

  // Miles: a little faster for every place gained.
  {
    const gp = lab("miles");
    parkOthers(gp, [0], 3000);
    put(gp, 0, 200, 0, 150);
    gpSettle(gp);
    const base = gp.riders[0].base.top;
    gp.riders[0].grid = 7;
    gp.riders[0].place = 8;
    gpStep(gp, idle(gp));
    const none = gp.riders[0].eff.top;
    gp.riders[0].place = 6;
    gpStep(gp, idle(gp));
    const two = gp.riders[0].eff.top;
    gp.riders[0].place = 1;
    gpStep(gp, idle(gp));
    const lots = gp.riders[0].eff.top;
    const q = QUIRKS.miles;
    ok(none === base, "Miles: no bonus before he's gained a place");
    ok(Math.abs(two - base * (1 + 2 * (q.perPlace ?? 0))) < 1e-9, "Miles: faster for each place gained");
    ok(Math.abs(lots - base * (1 + (q.maxPlaces ?? 0) * (q.perPlace ?? 0))) < 1e-9, "Miles: up to a cap");
  }

  // Pip: the steering wanders; Homing Missiles miss him a share of the time.
  {
    const steerSum = (driver: string) => {
      const gp = lab(driver);
      parkOthers(gp, [0], 3000);
      put(gp, 0, 200, 0, 0);
      gpSettle(gp);
      run(gp, 120, (g) => idle(g));
      return gp.race.racers[0].inputs.reduce((a, v) => a + Math.abs(unpackInput(v).steer), 0);
    };
    ok(steerSum("pip") > 1 && steerSum("max") === 0, "Pip's steering wanders with the wheel let go (nobody else's does)");
    let dodges = 0, hits = 0;
    for (let s = 1; s <= 120; s++) {
      const gp = lab("pip", s);
      parkOthers(gp, [0, 1]);
      put(gp, 0, 400, 0, 160);
      put(gp, 1, 150, 0, 160);
      gpSettle(gp);
      gp.riders[1].item = "homing-missile";
      const ev = run(gp, 240, (g) => g.riders.map((_, i) => (i <= 1 ? { ...cruise(g, i), item: i === 1 && g.race.tick < 3 } : NO_GP_INPUT)));
      if (has(ev, (e) => e.type === "dodge" && e.racer === 0)) dodges++;
      if (has(ev, (e) => e.type === "hit" && e.racer === 0)) hits++;
    }
    const share = dodges / (dodges + hits);
    ok(Math.abs(share - (QUIRKS.pip.missileMiss ?? 0)) < 0.12, `a Homing Missile misses Pip about ${(QUIRKS.pip.missileMiss ?? 0) * 100}% of the time (${dodges} of ${dodges + hits})`);
  }
}

// ───────────── Item Boxes ─────────────
{
  const gp = createGrandPrix({ roll: rollAs("you", 4242) });
  toGo(gp);
  parkOthers(gp, [0], 3000);
  const box = gp.boxes[0];
  put(gp, 0, box.s - 60, box.lat, 150);
  gpSettle(gp);
  const drive = (g: GrandPrix) => g.riders.map((_, i) => (i === 0 ? { ...cruise(g, 0, box.lat), gas: true } : NO_GP_INPUT));
  let tTaken = -1;
  let got: Extract<GpEvent, { type: "box" }> | undefined;
  for (let n = 0; n < 40 && !got; n++) {
    got = gpStep(gp, drive(gp)).events.find((e) => e.type === "box" && e.racer === 0) as typeof got;
    if (got) tTaken = gp.race.tick;
  }
  ok(!!got && got.item !== null && gp.riders[0].item === got.item, "driving through an Item Box deals an item");
  ok(box.back > 0, "the box is gone for now");
  ok(gp.riders[0].roll > 0, "the item spins in the roulette first");
  let readyAt = -1, backAt = -1;
  for (let n = 0; n < 200; n++) {
    const e = gpStep(gp, idle(gp)).events;
    if (readyAt < 0 && e.some((x) => x.type === "ready" && x.racer === 0)) readyAt = gp.race.tick;
    if (backAt < 0 && box.back === 0) backAt = gp.race.tick;
  }
  ok(Math.abs(readyAt - tTaken - ticks(ITEM_TUNING.roll)) <= 2, `the item is ready after ${ITEM_TUNING.roll}s (${readyAt - tTaken} steps)`);
  ok(Math.abs(backAt - tTaken - ticks(ITEM_TUNING.boxRespawn)) <= 2, `the box comes back after ${ITEM_TUNING.boxRespawn}s (${backAt - tTaken} steps)`);
  // Holding an item: the box breaks, the item stays.
  const held = gp.riders[0].item;
  const row1 = gp.boxes.find((b) => b.row === 1)!;
  put(gp, 0, row1.s - 60, row1.lat, 150);
  gpSettle(gp);
  const ev2 = run(gp, 40, (g) => g.riders.map((_, i) => (i === 0 ? { ...cruise(g, 0, row1.lat), gas: true } : NO_GP_INPUT)));
  ok(has(ev2, (e) => e.type === "box" && e.racer === 0 && e.item === null) && gp.riders[0].item === held, "one item at a time: a box taken while holding one deals nothing");
  ok(gp.boxes.length === (FIRST_TRACK.boxes ?? []).reduce((a, r) => a + r.lanes.length, 0), "every box row is laid out");
  ok(gp.boxes.every((b) => Math.abs(b.lat) < 64 - ITEM_TUNING.boxRadius), "boxes sit on the road");
}

// ───────────── odds by place ─────────────
{
  for (let c = 0; c < 8; c++) ok(ITEM_IDS.reduce((a, id) => a + ITEM_ODDS[id][c], 0) === 100, `the odds for place ${c + 1} add up to 100`);
  ok(ITEM_ODDS["heat-seeker"][0] === 0 && ITEM_ODDS.shockwave[0] === 0 && ITEM_ODDS["energy-drink"][0] === 0, "first place never gets a rare item or the long boost");
  ok(ITEM_ODDS.shield[7] === 0 && ITEM_ODDS["oil-slick"][7] === 0, "last place never gets a defensive item");
  const share = (ids: ItemId[], c: number) => ids.reduce((a, id) => a + ITEM_ODDS[id][c], 0);
  let rareUp = true, defDown = true, boostUp = true;
  for (let c = 1; c < 8; c++) {
    if (share(["heat-seeker", "shockwave"], c) < share(["heat-seeker", "shockwave"], c - 1)) rareUp = false;
    if (share(["shield", "oil-slick"], c) > share(["shield", "oil-slick"], c - 1)) defDown = false;
    if (share(["energy-drink"], c) < share(["energy-drink"], c - 1)) boostUp = false;
  }
  ok(rareUp && defDown && boostUp, "further back: more rare items and boosts, fewer defensive ones");
  ok(share(["heat-seeker", "shockwave"], 7) <= 20, "rare items stay rare even in last");
  for (const n of [2, 4, 6, 8, 12]) ok(oddsColumn(1, n) === 0 && oddsColumn(n, n) === 7, `first and last map to the ends in a field of ${n}`);
  const rnd = seeded(5);
  const counts: Record<string, number> = {};
  const odds = itemOdds(6, 8);
  for (let n = 0; n < 100000; n++) { const it = pickItem(odds, rnd()); counts[it] = (counts[it] ?? 0) + 1; }
  ok(odds.every((o) => Math.abs((counts[o.id] ?? 0) / 1000 - o.weight) < 1.2), "boxes deal at the odds (100,000 deals at 6th)");
  ok(!itemOdds(8, 8, 0, ["heat-seeker"]).some((o) => o.id === "heat-seeker" && o.weight > 0), "a blocked item can't come up");
  {
    const gp = lab("you", 7);
    gp.riders[3].item = "heat-seeker";
    let seen = false;
    for (let n = 0; n < 3000; n++) { gp.riders[0].place = 8; if (dealItem(gp, 0) === "heat-seeker") seen = true; }
    ok(!seen, "only one Heat Seeker out at a time");
  }
}

// ───────────── bumps ─────────────
{
  // Head on: the lighter kart is pushed back harder, by the mass ratio.
  const gp = lab("you", 4242);
  const heavy = gp.riders.findIndex((r) => r.driver === "gary");
  const light = gp.riders.findIndex((r) => r.driver === "skip");
  if (heavy < 0 || light < 0) ok(false, "Gary and Skip in the field");
  else {
    parkOthers(gp, [heavy, light], 3000);
    put(gp, 0, 3300, 40, 0);
    const p = roadPoint(gp.race.track, 200, 0);
    const kh = gp.race.racers[heavy].kart, kl = gp.race.racers[light].kart;
    Object.assign(kh, { x: p.x - 9, y: p.y, h: 0, vx: 100, vy: 0, speed: 100 });
    Object.assign(kl, { x: p.x + 9, y: p.y, h: Math.PI, vx: -100, vy: 0, speed: 100 });
    gpSettle(gp);
    const ev = gpStep(gp, idle(gp)).events;
    ok(has(ev, (e) => e.type === "bump"), "a bump is reported");
    const dh = Math.abs(kh.vx - 100), dl = Math.abs(kl.vx + 100);
    const mh = gp.riders[heavy].eff.mass, ml = gp.riders[light].eff.mass;
    ok(dl > dh, `the lighter kart takes the bigger knock (${dl.toFixed(0)} vs ${dh.toFixed(0)})`);
    ok(Math.abs(dl / dh - mh / ml) < 0.25, `by about the mass ratio (${(dl / dh).toFixed(2)} vs ${(mh / ml).toFixed(2)})`);
    ok(kh.vx < 100 && kl.vx > -100, "and both lose speed into each other");
  }
  // Overlapping karts are pushed apart and stay apart.
  {
    const g2 = lab("you", 99);
    parkOthers(g2, [1, 2], 3000);
    put(g2, 0, 3300, 40, 0);
    const p = roadPoint(g2.race.track, 200, 0);
    Object.assign(g2.race.racers[1].kart, { x: p.x, y: p.y, vx: 0, vy: 0 });
    Object.assign(g2.race.racers[2].kart, { x: p.x + 3, y: p.y + 1, vx: 0, vy: 0 });
    gpSettle(g2);
    run(g2, 40, (g) => idle(g));
    const a = g2.race.racers[1].kart, b = g2.race.racers[2].kart;
    ok(Math.hypot(a.x - b.x, a.y - b.y) >= TUNING.kartRadius * 2 - 0.5, `karts on top of each other are pushed apart (${Math.hypot(a.x - b.x, a.y - b.y).toFixed(1)})`);
  }
}

// ───────────── computer racers ─────────────
{
  const p = (d: string, diff: Difficulty) => profileFor(d, CAST.find((c) => c.id === d)!.stats, diff);
  ok(p("max", "normal").skill > p("felix", "normal").skill, "the Tryhard drives better than the Casual");
  ok(p("max", "hard").pace > p("max", "normal").pace && p("max", "normal").pace > p("max", "easy").pace, "difficulty moves their pace");
  ok(CAST.every((c) => p(c.id, "normal").pace < 1), "computer racers never quite drive flat out on Normal");
}

// ───────────── 2,000 seeded races ─────────────
bulkAll(ok, () => ({ pass, fail }));
}

interface Bulk { races: number; nan: number; unfinished: number; stuck: number; tows: number; badOrder: number; overCap: number; youWins: number; maxTicks: number }

function bulk(from: number, to: number): Bulk {
  const out: Bulk = { races: 0, nan: 0, unfinished: 0, stuck: 0, tows: 0, badOrder: 0, overCap: 0, youWins: 0, maxTicks: 0 };
  const diffs: Difficulty[] = ["easy", "normal", "hard"];
  for (let n = from; n < to; n++) {
    const roll = dealRoll((n * 2654435761) >>> 0 || 1);
    const gp = createGrandPrix({ roll, difficulty: diffs[n % 3], runOn: 120 });
    const bot = createPlayerBot(n % 2 ? PLAYER_GOOD : PLAYER_SLOPPY, n);
    const mark = gp.riders.map(() => -1e9);
    while (!gp.over) {
      const ev = gpStep(gp, bot.input(gp));
      for (const e of ev.events) if (e.type === "tow") out.tows++;
      if (gp.race.tick > 0 && gp.race.tick % 600 === 0) {
        gp.riders.forEach((rd, i) => {
          if (gp.race.racers[i].finishAt === null && gp.race.tick > 600 && rd.prog < mark[i] + 200) out.stuck++;
          mark[i] = rd.prog;
        });
      }
      for (const r of gp.race.racers) {
        const k = r.kart;
        if (!Number.isFinite(k.x + k.y + k.z + k.vx + k.vy + k.h + k.speed)) out.nan++;
      }
    }
    out.races++;
    out.maxTicks = Math.max(out.maxTicks, gp.race.tick);
    if (gp.race.tick >= 60 * 300) out.overCap++;
    const st = standings(gp);
    out.unfinished += st.filter((s) => s.finishAt === null).length;
    const fin = st.filter((s) => s.finishAt !== null);
    for (let q = 1; q < fin.length; q++) if ((fin[q].finishAt ?? 0) < (fin[q - 1].finishAt ?? 0)) out.badOrder++;
    if (new Set(st.map((s) => s.place)).size !== st.length) out.badOrder++;
    if (st[0].human) out.youWins++;
  }
  return out;
}

function bulkAll(ok: (c: boolean, w: string) => void, score: () => { pass: number; fail: number }): void {
  const total = process.argv.includes("--quick") ? 200 : 2000;
  const workers = Math.max(1, Math.min(8, cpus().length - 2));
  const per = Math.ceil(total / workers);
  const jobs: Promise<Bulk>[] = [];
  for (let w = 0; w < workers; w++) {
    const from = w * per;
    const to = Math.min(total, from + per);
    if (from >= to) continue;
    jobs.push(new Promise((resolve, reject) => {
      const child = fork(__filename, ["--bulk", String(from), String(to)], { execArgv: process.execArgv });
      child.on("message", (m) => resolve(m as Bulk));
      child.on("error", reject);
      child.on("exit", (code) => code && reject(new Error(`worker exited ${code}`)));
    }));
  }
  Promise.all(jobs).then((parts) => {
    const b = parts.reduce((a, x) => ({ races: a.races + x.races, nan: a.nan + x.nan, unfinished: a.unfinished + x.unfinished, stuck: a.stuck + x.stuck, tows: a.tows + x.tows, badOrder: a.badOrder + x.badOrder, overCap: a.overCap + x.overCap, youWins: a.youWins + x.youWins, maxTicks: Math.max(a.maxTicks, x.maxTicks) }));
    ok(b.races === total, `${total} seeded races ran (${b.races})`);
    ok(b.nan === 0, `no kart ever has a NaN (${b.nan})`);
    ok(b.unfinished === 0, `everyone finishes every race (${b.unfinished} didn't)`);
    ok(b.stuck === 0, `nobody goes 10 seconds without getting anywhere (${b.stuck})`);
    ok(b.tows <= total / 100, `missed checkpoints and tows are rare (${b.tows} in ${total} races)`);
    ok(b.badOrder === 0, "standings: finishers in time order, every place once");
    ok(b.overCap === 0, `no race runs to the 5-minute cap (longest ${(b.maxTicks / 60).toFixed(0)}s)`);
    ok(b.youWins > total * 0.15 && b.youWins < total * 0.6, `you win some and lose some across bots and difficulties (${b.youWins} of ${total})`);
    console.log(`bulk: ${b.races} races, you won ${b.youWins}, tows ${b.tows}, stuck ${b.stuck}, unfinished ${b.unfinished}, NaN ${b.nan}, longest ${(b.maxTicks / 60).toFixed(0)}s`);
    const { pass, fail } = score();
    console.log(`${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
  }).catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
