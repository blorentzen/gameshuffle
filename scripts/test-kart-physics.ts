// Shuffle Kart's pure core (src/lib/kart/*): determinism, laps, walls, ghosts.
//   npx tsx scripts/test-kart-physics.ts
import { autopilot } from "../src/lib/kart/autopilot";
import { decodeInputs, encodeInputs, ghostFrame, ghostFrameTick, ghostPose, loadGhost, makeGhost, quantizePose, replayInputs, type GhostData } from "../src/lib/kart/ghost";
import { NO_INPUT, startState, stepKart, TUNING, type KartInput, type KartState } from "../src/lib/kart/physics";
import { createRace, packInput, quantize, raceStep, unpackInput, you, type Race } from "../src/lib/kart/race";
import { dealRoll } from "../src/lib/kart/roll";
import { CAST, DRIVER_IDS, statsFor, YOU } from "../src/lib/kart/roster";
import { FIRST_TRACK } from "../src/lib/kart/content";
import { buildTrack, groundAt, nearest } from "../src/lib/kart/track";

let pass = 0, fail = 0;
const ok = (cond: boolean, what: string) => { if (cond) pass++; else { fail++; if (fail < 40) console.error("✗", what); } };

// Seeded random so a failure can be replayed.
let seed = 2026;
const rand = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };

const track = buildTrack(FIRST_TRACK);
const mirror = buildTrack(FIRST_TRACK, true);
const heavy = statsFor("rory", "box", "slim");
const light = statsFor("juno", "round", "small");

function goRace(t = track, stats = heavy): Race {
  const r = createRace(t, stats);
  while (r.tick < 0) raceStep(r, NO_INPUT);
  return r;
}

// ── Track ──
ok(track.n > 300 && track.length > 4000, "the loop is sampled");
ok(track.gates.length === FIRST_TRACK.gates, "gates built");
{
  // A gate never reaches another part of the track.
  let bad = 0;
  for (const g of track.gates) {
    for (let k = 0; k <= 20; k++) {
      const x = g.x1 + ((g.x2 - g.x1) * k) / 20;
      const y = g.y1 + ((g.y2 - g.y1) * k) / 20;
      const gi = Math.round((g.index * track.n) / track.gates.length) % track.n;
      for (let i = 0; i < track.n; i++) {
        const loopGap = Math.min(Math.abs(i - gi), track.n - Math.abs(i - gi));
        if (loopGap < 30) continue;
        if (Math.hypot(track.xs[i] - x, track.ys[i] - y) < track.hw[i]) bad++;
      }
    }
  }
  ok(bad === 0, `no gate crosses another part of the track (${bad})`);
}
ok(nearest(track, track.start.x, track.start.y).s > track.length - 60, "the start grid sits just behind the finish line");
{
  const r = track.ramp;
  const mid = nearest(track, r.x + r.dx * r.length / 2, r.y + r.dy * r.length / 2);
  ok(mid.dist + r.halfWidth <= mid.hw + 1, "the ramp lies on the road");
  ok(Math.abs(groundAt(track, r.x + r.dx * r.length * 0.99, r.y + r.dy * r.length * 0.99) - r.height) < 0.5, "the ramp climbs to its height");
  ok(groundAt(track, r.x - r.dx * 2, r.y - r.dy * 2) === 0, "the ground is flat before it");
}
{
  // Every solid prop is off the road except the island, which has room on both sides.
  for (const c of track.solids) {
    const nr = nearest(track, c.x, c.y);
    if (nr.dist < nr.hw) ok(nr.hw - c.r - TUNING.kartRadius * 2 > 40 && nr.dist < 10, "a prop on the road leaves a lane each side");
    else ok(nr.dist - c.r >= nr.hw - 2, "props off the road don't reach onto it");
  }
}
ok(Math.abs(mirror.length - track.length) < 1e-6 && Math.abs(mirror.start.x - (FIRST_TRACK.world - track.start.x)) < 1e-6, "the mirror twist flips the track");

// ── Inputs ──
for (let k = 0; k < 200; k++) {
  const i = quantize({ steer: rand() * 2 - 1, gas: rand() < 0.5, brake: rand() < 0.2, drift: rand() < 0.3, assist: rand() < 0.5 });
  const back = unpackInput(packInput(i));
  ok(back.steer === i.steer && back.gas === i.gas && back.brake === i.brake && back.drift === i.drift && back.assist === i.assist, "inputs pack and unpack");
}
{
  const list = Array.from({ length: 500 }, (_, k) => packInput(quantize({ steer: Math.round(Math.sin(k / 30) * 3) / 3, gas: true, brake: false, drift: k % 90 < 30, assist: false })));
  ok(decodeInputs(encodeInputs(list)).join() === list.join(), "run-length inputs round trip");
}

// ── Determinism ──
function scripted(r: Race, steps: number, inputs: KartInput[]) {
  for (let i = 0; i < steps; i++) {
    const a = autopilot(r.track, you(r).kart, { drift: true });
    const noise = Math.sin(i * 0.071) * 0.4 + (rand() - 0.5) * 0.3;
    const inp: KartInput = { ...a, steer: a.steer + noise, drift: a.drift || i % 400 < 40 };
    inputs.push(inp);
    raceStep(r, inp);
  }
}
{
  seed = 77;
  const inputs: KartInput[] = [];
  const a = goRace();
  scripted(a, 3000, inputs);
  const b = goRace();
  for (const inp of inputs) raceStep(b, inp);
  const fields: (keyof KartState)[] = ["x", "y", "z", "vx", "vy", "vz", "h", "steer", "charge", "boost", "speed"];
  ok(fields.every((f) => you(a).kart[f] === you(b).kart[f]), "same inputs, same kart, to the last bit");
  ok(you(a).poses.length === you(b).poses.length && you(a).poses.every((v, i) => v === you(b).poses[i]), "same inputs, same recorded poses");
  ok(you(a).passed === you(b).passed && you(a).lapTimes.join() === you(b).lapTimes.join(), "same inputs, same laps");
}

// ── Laps count only in order ──
function across(r: Race, gateIndex: number, forward = true) {
  // Puts the kart 20 units before (or after) a gate, moving across it.
  const g = r.track.gates[gateIndex];
  const cx = (g.x1 + g.x2) / 2;
  const cy = (g.y1 + g.y2) / 2;
  const dir = forward ? 1 : -1;
  const k = you(r).kart;
  k.x = cx - g.tx * 20 * dir;
  k.y = cy - g.ty * 20 * dir;
  k.h = Math.atan2(g.ty * dir, g.tx * dir);
  k.vx = g.tx * 200 * dir;
  k.vy = g.ty * 200 * dir;
  k.z = 0;
  k.grounded = true;
  k.ground = 0;
  for (let i = 0; i < 20; i++) raceStep(r, { steer: 0, gas: true, brake: false, drift: false, assist: false });
}
{
  const r = goRace();
  const K = r.track.gates.length;
  across(r, 0);
  ok(you(r).passed === 1 && you(r).maxPassed === 1 && you(r).lapTimes.length === 0, "leaving the start passes gate 0, no lap yet");
  across(r, 0);
  ok(you(r).passed === 1, "crossing the finish again without the other gates does nothing");
  across(r, K - 1);
  across(r, 0);
  ok(you(r).passed === 1 && you(r).lapTimes.length === 0, "cutting back to the last gate doesn't close a lap");
  for (let gi = 1; gi < K; gi++) {
    if (gi === 5) continue; // skip one: the infield cut
    across(r, gi);
  }
  across(r, 0);
  ok(you(r).lapTimes.length === 0 && you(r).passed === 5, "a skipped gate holds the lap open");
  for (let gi = 5; gi < K; gi++) across(r, gi);
  across(r, 0);
  ok(you(r).lapTimes.length === 1 && you(r).passed === K + 1, "every gate in order then the line closes the lap");
  across(r, 0, false);
  ok(you(r).passed === K && you(r).lapTimes.length === 1, "backing over the line takes the gate back");
  across(r, 0);
  ok(you(r).passed === K + 1 && you(r).lapTimes.length === 1, "and crossing it again doesn't count a second lap");
}
{
  // Whole races with the autopilot, every driver, both ways round.
  for (const t of [track, mirror]) {
    for (const d of [CAST[0], CAST[1], CAST[2]]) {
      const r = goRace(t, statsFor(d.id, "low", "chunky"));
      let guard = 0;
      while (you(r).finishAt === null && guard++ < 60 * 200) raceStep(r, autopilot(t, you(r).kart, { drift: true }));
      ok(you(r).finishAt !== null && you(r).lapTimes.length === 3, `${d.name} finishes 3 laps${t.mirror ? " mirrored" : ""}`);
      const sum = you(r).lapTimes.reduce((a, b) => a + b, 0);
      const at = you(r).finishAt;
      ok(at !== null && Math.abs(sum - at) < 1e-6, "lap times add up to the total");
      ok(at !== null && at / 60 > 40 && at / 60 < 110, `a sane race time (${at !== null ? (at / 60).toFixed(1) : "DNF"}s)`);
    }
  }
}

// ── Several racers ──
{
  const r = createRace(track, [{ id: "you", stats: light }, { id: "cpu1", stats: heavy }, { id: "cpu2", stats: light }]);
  const ks = r.racers.map((x) => x.kart);
  const apart = ks.every((a, i) => ks.every((b, j) => i === j || Math.hypot(a.x - b.x, a.y - b.y) > TUNING.kartRadius * 2));
  ok(apart, "a grid of three: nobody starts on top of anyone");
  ok(ks.every((k) => k.item === null), "every kart has an empty item slot");
  let guard = 0;
  while (r.racers.some((x) => x.finishAt === null) && guard++ < 60 * 200) raceStep(r, r.racers.map((x) => autopilot(track, x.kart, { drift: true })));
  ok(r.racers.every((x) => x.finishAt !== null && x.lapTimes.length === 3), "every racer in a race of three finishes");
  ok(you(r) === r.racers[0], "racer 0 is you");
}

// ── Walls never hold the kart ──
function inside(k: KartState): boolean {
  const b = track.bounds;
  const r = TUNING.kartRadius;
  if (k.x < b.x0 + r - 1e-6 || k.x > b.x1 - r + 1e-6 || k.y < b.y0 + r - 1e-6 || k.y > b.y1 - r + 1e-6) return true;
  return track.solids.some((c) => Math.hypot(k.x - c.x, k.y - c.y) < c.r + r - 1e-6);
}
{
  const cases: { x: number; y: number; h: number; what: string }[] = [];
  const b = track.bounds;
  for (let i = 0; i < 8; i++) {
    const along = 0.15 + (i / 8) * 0.7;
    cases.push({ x: b.x0 + 30, y: b.y0 + (b.y1 - b.y0) * along, h: Math.PI + (rand() - 0.5) * 0.6, what: "left rim" });
    cases.push({ x: b.x1 - 30, y: b.y0 + (b.y1 - b.y0) * along, h: (rand() - 0.5) * 0.6, what: "right rim" });
    cases.push({ x: b.x0 + (b.x1 - b.x0) * along, y: b.y0 + 30, h: -Math.PI / 2 + (rand() - 0.5) * 0.6, what: "far rim" });
    cases.push({ x: b.x0 + (b.x1 - b.x0) * along, y: b.y1 - 30, h: Math.PI / 2 + (rand() - 0.5) * 0.6, what: "near rim" });
  }
  cases.push({ x: b.x0 + 30, y: b.y0 + 30, h: -Math.PI * 0.75, what: "a corner" });
  cases.push({ x: b.x1 - 30, y: b.y1 - 30, h: Math.PI * 0.25, what: "a corner" });
  for (const c of track.solids) {
    const a = rand() * Math.PI * 2;
    cases.push({ x: c.x + Math.cos(a) * (c.r + 40), y: c.y + Math.sin(a) * (c.r + 40), h: a + Math.PI, what: "a prop" });
  }
  for (const stats of [heavy, light]) {
    for (const cs of cases) {
      const k: KartState = { ...startState(track), x: cs.x, y: cs.y, h: cs.h };
      let wasInside = false;
      let travelled = 0;
      let late = 0;
      // Phone style: gas on, hands off the steering, for 8 seconds.
      for (let i = 0; i < 480; i++) {
        const px = k.x, py = k.y;
        stepKart(k, { steer: 0, gas: true, brake: false, drift: false, assist: true }, track, stats);
        const moved = Math.hypot(k.x - px, k.y - py);
        travelled += moved;
        if (i >= 300) late += moved;
        if (inside(k)) wasInside = true;
      }
      ok(!wasInside, `never inside a wall (${cs.what})`);
      // Free of it: still covering ground in the last three seconds (a kart pinned in place covers a unit or two).
      ok(travelled > 300 && late > 90, `drives off ${cs.what} without steering (${travelled.toFixed(0)} units, ${late.toFixed(0)} in the last 3 s, at ${k.x.toFixed(0)},${k.y.toFixed(0)}, from ${cs.x.toFixed(1)},${cs.y.toFixed(1)} h ${cs.h.toFixed(4)})`);
    }
  }
}

// ── Drifts charge and boost ──
function driftFor(seconds: number): number {
  const k: KartState = { ...startState(track), x: 1000, y: 700, h: 0, vx: 200, vy: 0 };
  // Out in the open: move the solids away for this check.
  const open = { ...track, solids: [], bounds: { x0: -1e5, y0: -1e5, x1: 1e5, y1: 1e5 } };
  let boost = 0;
  const steps = Math.round(seconds * 60);
  for (let i = 0; i < steps; i++) stepKart(k, { steer: 0.8, gas: true, brake: false, drift: true, assist: false }, open, heavy);
  const ev = stepKart(k, { steer: 0, gas: true, brake: false, drift: false, assist: false }, open, heavy);
  boost = ev.boost;
  return boost;
}
ok(driftFor(0.4) === 0, "a quick drift gives no boost");
ok(driftFor(1.2) === 1, "a short drift gives the small boost");
ok(driftFor(2.6) === 2, "a long drift gives the big boost");

// ── Ghosts replay the run exactly ──
{
  const r = goRace(track, light);
  seed = 9;
  let guard = 0;
  while (you(r).finishAt === null && guard++ < 60 * 200) {
    const a = autopilot(track, you(r).kart, { drift: true });
    raceStep(r, { ...a, steer: a.steer + (rand() - 0.5) * 0.2 });
  }
  const data = makeGhost(r, "juno.round.small");
  ok(!!data, "a finished race makes a ghost");
  const stored = JSON.parse(JSON.stringify(data)) as GhostData;
  const g = loadGhost(stored);
  ok(!!g, "the ghost loads back from storage");
  if (g && data) {
    let same = true;
    for (let n = 0; n < g.count; n++) {
      const t = ghostFrameTick(g, n);
      const p = you(r).poses;
      const want = quantizePose(p[t * 5], p[t * 5 + 1], p[t * 5 + 2], p[t * 5 + 3], p[t * 5 + 4]);
      const got = ghostFrame(g, n);
      if (want.some((v, i) => v !== got[i])) same = false;
      const pose = ghostPose(g, t);
      if (Math.abs(pose.x - want[0] / 8) > 1e-9 || Math.abs(pose.y - want[1] / 8) > 1e-9) same = false;
    }
    ok(same, "every stored pose replays exactly where it was recorded");
    ok(g.data.last === you(r).poses.length / 5 - 1, "the ghost ends on the finishing pose");
    // Between two stored poses it is never far from the real run.
    let worst = 0;
    for (let t = 0; t < g.data.last; t += 1) {
      const pose = ghostPose(g, t);
      worst = Math.max(worst, Math.hypot(pose.x - you(r).poses[t * 5], pose.y - you(r).poses[t * 5 + 1]));
    }
    ok(worst < 1.5, `in between, the ghost stays on the real line (worst ${worst.toFixed(2)} units)`);
    const again = replayInputs(track, light, decodeInputs(stored.inputs));
    ok(you(again).finishAt === you(r).finishAt, "replaying the stored inputs gives the same finish time");
    ok(you(again).kart.x === you(r).kart.x && you(again).kart.y === you(r).kart.y && you(again).lapTimes.join() === you(r).lapTimes.join(), "and the same race, step for step");
    ok(data.totalMs === Math.round(you(r).finishAt! * 1000 / 60) && data.lapMs.length === 3, "ghost keeps the times");
    ok(JSON.stringify(stored).length < 80000, `a ghost is small enough to keep (${JSON.stringify(stored).length} characters)`);
  }
}

// ── The roll ──
{
  const a = dealRoll(12345);
  const b = dealRoll(12345);
  ok(JSON.stringify(a) === JSON.stringify(b), "the same seed deals the same roll");
  const seen = new Set<string>();
  let mirrors = 0;
  for (let i = 1; i <= 400; i++) {
    const r = dealRoll(i * 7919);
    seen.add(r.driver);
    if (r.twist === "mirror") mirrors++;
    ok(DRIVER_IDS.includes(r.driver), "only the cast or you get dealt");
    ok(["box", "round", "low"].includes(r.body) && ["chunky", "slim", "small"].includes(r.wheels), "only karts there are get dealt");
  }
  ok(seen.size === DRIVER_IDS.length && seen.has(YOU), "every cast member and you come up");
  ok(mirrors > 50 && mirrors < 160, `Mirror comes up about a quarter of the time (${mirrors} of 400)`);
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
