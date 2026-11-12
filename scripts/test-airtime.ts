// Airtime's pure core (src/lib/airtime/*): determinism, every gap clearable, hits, falls, hearts, level end, score.
//   npx tsx scripts/test-airtime.ts
import { autopilot, holdFor, LEAD_SECONDS, laneTarget } from "../src/lib/airtime/autopilot";
import { bareLevel, buildLevel, groundUnder, type Level } from "../src/lib/airtime/level";
import { aimDir, bank, createRun, createRunOn, loadAt, nextLevel, NO_INPUT, normAim, packInput, recordedInputs, step, stateHash, unpackInput, type Input, type Run, type StepEvents } from "../src/lib/airtime/sim";
import { levelSpeed, TUNING } from "../src/lib/airtime/tuning";
import { dcos, dsin } from "../src/lib/airtime/wave";

let pass = 0;
let fail = 0;
const ok = (cond: boolean, what: string) => {
  if (cond) pass++;
  else {
    fail++;
    if (fail < 40) console.error("✗", what);
  }
};

// Seeded random so a failure can be replayed.
let rs = 2026;
const rand = () => {
  rs = (rs * 1103515245 + 12345) % 2147483648;
  return rs / 2147483648;
};

// ── Deterministic trig ──
{
  let worst = 0;
  for (let i = -2000; i <= 2000; i++) {
    const x = i * 0.0137;
    worst = Math.max(worst, Math.abs(dsin(x) - Math.sin(x)), Math.abs(dcos(x) - Math.cos(x)));
  }
  ok(worst < 1e-6, `dsin and dcos match Math.sin and Math.cos (worst ${worst.toExponential(2)})`);
}

// ── Levels ──
for (const seed of [1, 7, 99, 123456]) {
  ok(JSON.stringify(buildLevel(seed, 1)) === JSON.stringify(buildLevel(seed, 1)), `level ${seed} builds the same twice`);
  ok(JSON.stringify(buildLevel(seed, 1)) !== JSON.stringify(buildLevel(seed + 1, 1)), `seeds ${seed} and ${seed + 1} differ`);
  ok(JSON.stringify(buildLevel(seed, 1)) !== JSON.stringify(buildLevel(seed, 2)), `level 1 and 2 of seed ${seed} differ`);
}
{
  let shortest = Infinity;
  let longest = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const L = buildLevel(seed, 1);
    const secs = (L.gateX - L.start.x) / L.speed;
    shortest = Math.min(shortest, secs);
    longest = Math.max(longest, secs);
  }
  ok(shortest > 52 && longest < 70, `levels take about a minute at full speed (${shortest.toFixed(1)} to ${longest.toFixed(1)} s)`);
}
ok(levelSpeed(2) > levelSpeed(1) && levelSpeed(20) === TUNING.runSpeed * TUNING.maxSpeedScale, "each level is faster, up to the cap");

/** Runs with a bot until the level ends or `max` steps. */
function drive(run: Run, bot: (r: Run) => Input, max: number, each?: (ev: StepEvents) => void): void {
  for (let i = 0; i < max && run.phase === "play"; i++) {
    const ev = step(run, bot(run));
    each?.(ev);
  }
}

// ── Determinism ──
for (const seed of [3, 42, 777, 31337, 2147483000]) {
  const a = createRun(seed);
  const b = createRun(seed);
  drive(a, autopilot, 5000);
  drive(b, autopilot, 5000);
  ok(stateHash(a) === stateHash(b) && a.score === b.score, `seed ${seed}: the autopilot plays the same run twice`);
  // Random holds, fire and aim (the aim wanders like a thumb), and the recorded inputs replayed into a fresh run.
  const inputs: Input[] = [];
  let h = false;
  let f = false;
  let aim = 0;
  for (let i = 0; i < 2400; i++) {
    if (rand() < 0.06) h = !h;
    if (rand() < 0.04) f = !f;
    aim = Math.max(-95, Math.min(95, aim + (rand() - 0.5) * 9));
    inputs.push({ hold: h, fire: f, aim });
  }
  const c = createRun(seed);
  const d = createRun(seed);
  let fired = 0;
  for (const x of inputs) {
    fired += step(c, x).fired.length;
    step(d, x);
  }
  ok(fired > 0, `seed ${seed}: the random inputs fire`);
  ok(stateHash(c) === stateHash(d), `seed ${seed}: the same holds, fire and aim give the same state`);
  const replay = createRun(seed);
  for (const x of recordedInputs(c.inputs)) step(replay, x);
  ok(stateHash(replay) === stateHash(c), `seed ${seed}: the recorded inputs replay to the same state`);
  ok(c.inputs.length % 2 === 0 && c.inputs.length < inputs.length * 2, `seed ${seed}: inputs are recorded run-length (${c.inputs.length / 2} runs for ${inputs.length} steps)`);
  const other = createRun(seed + 1);
  for (const x of inputs) step(other, x);
  ok(stateHash(other) !== stateHash(c), `seed ${seed}: another seed plays differently`);
  const auto = createRun(seed);
  drive(auto, autopilot, 3000);
  const back = createRun(seed);
  for (const x of recordedInputs(auto.inputs)) step(back, x);
  ok(stateHash(back) === stateHash(auto), `seed ${seed}: an autopilot run replays from its recorded inputs`);
}

// ── Inputs: packing and the aim ──
for (let k = 0; k < 400; k++) {
  const i = { hold: rand() < 0.5, fire: rand() < 0.5, aim: Math.round(rand() * 180 - 90) };
  const back = unpackInput(packInput(i));
  ok(back.hold === i.hold && back.fire === i.fire && back.aim === i.aim, "inputs pack and unpack");
}
ok(normAim(91.4) === 90 && normAim(-200) === -90 && normAim(12.5) === 13 && normAim(-12.4) === -12 && normAim(NaN) === 0, "aims are whole degrees from -90 to 90");
{
  let worst = 0;
  for (let deg = -90; deg <= 90; deg++) {
    const [x, y] = aimDir(deg);
    worst = Math.max(worst, Math.abs(x - Math.cos((deg * Math.PI) / 180)), Math.abs(y - Math.sin((deg * Math.PI) / 180)));
  }
  ok(worst < 1e-6, "the aim table matches cos and sin");
}

// ── Every gap can be cleared ──
// For each crossing: stand on the roof half a second before the edge (or the mast), fly its lane with
// the real physics until past the next roof's front, let go, and land there: no wall bump, no hit, no
// fall. Then the whole level in one go (enemies out, crane loads swinging), start to gate, untouched,
// looking 0.8 s ahead the way the autopilot does.
type Fly = { bumps: number; hurts: number; falls: number };
function flyCrossing(L: Level, i: number): string | null {
  const c = L.crossings[i];
  const run = createRunOn(bareLevel(L));
  const lead = L.speed * LEAD_SECONDS;
  // The roof you start on: the one ending at the edge (a mast: the one it stands on).
  const from = L.solids.find((s) => s.kind === "roof" && Math.abs(s.y1 - c.fromTop) < 1e-9 && (c.kind === "mast" ? s.x0 <= c.fromX && s.x1 >= c.toX : Math.abs(s.x1 - c.fromX) < 1e-9));
  if (!from) return "no roof to start from";
  if (c.fromX - lead < from.x0 + 0.5) return `the roof before it is too short for a running start (${(from.x1 - from.x0).toFixed(1)} m)`;
  const p = run.player;
  p.x = c.fromX - lead;
  p.y = c.fromTop;
  p.grounded = true;
  run.maxX = p.x;
  // Any tick could be the moment you arrive: start the crane swinging somewhere else each time.
  run.tick = (i * 37) % 997;
  const f: Fly = { bumps: 0, hurts: 0, falls: 0 };
  for (let t = 0; t < 900; t++) {
    const flying = p.x <= c.toX + 1;
    const ev = step(run, flying ? holdFor(run, c.lane) : NO_INPUT);
    if (ev.bumped) f.bumps++;
    if (ev.hurt) f.hurts++;
    if (ev.fell) f.falls++;
    if (!flying && p.grounded) break;
  }
  if (f.bumps || f.hurts || f.falls) return `bumps ${f.bumps}, hits ${f.hurts}, falls ${f.falls}`;
  if (!p.grounded || Math.abs(p.y - c.toTop) > 1e-9) return `didn't land on the next roof (y ${p.y.toFixed(2)}, wanted ${c.toTop})`;
  return null;
}

function flyLevel(L: Level): { f: Fly; cleared: boolean; ticks: number } {
  const run = createRunOn(bareLevel(L));
  const f: Fly = { bumps: 0, hurts: 0, falls: 0 };
  drive(run, (r) => {
    const lane = laneTarget(r);
    return lane === null ? NO_INPUT : holdFor(r, lane);
  }, 8000, (ev) => {
    if (ev.bumped) f.bumps++;
    if (ev.hurt) f.hurts++;
    if (ev.fell) f.falls++;
  });
  return { f, cleared: run.phase === "cleared", ticks: run.tick };
}

{
  const t0 = Date.now();
  let crossings = 0;
  let levels = 0;
  const kinds: Record<string, number> = {};
  for (let seed = 1; seed <= 500; seed++) {
    for (const n of [1, 4, 8]) {
      const L = buildLevel(seed * 7919 + 13, n);
      levels++;
      for (let i = 0; i < L.crossings.length; i++) {
        const c = L.crossings[i];
        kinds[c.kind] = (kinds[c.kind] ?? 0) + 1;
        crossings++;
        ok(c.lane + TUNING.playerH < TUNING.ceiling - 0.3, `seed ${seed} level ${n}: crossing ${i} (${c.kind}) fits under the top of the screen`);
        for (const s of L.solids) {
          if (s.kind !== "arm" || s.x1 < c.fromX || s.x0 > c.toX) continue;
          ok(c.lane + TUNING.playerH < s.y0 - 0.5, `seed ${seed} level ${n}: crossing ${i} flies under the crane's arm`);
        }
        const why = flyCrossing(L, i);
        ok(why === null, `seed ${seed} level ${n}: crossing ${i} (${c.kind}, ${(c.toX - c.fromX).toFixed(1)} m, ${c.fromTop} to ${c.toTop}) can be cleared: ${why}`);
      }
      const whole = flyLevel(L);
      ok(whole.cleared && !whole.f.bumps && !whole.f.hurts && !whole.f.falls, `seed ${seed} level ${n}: the whole level can be flown untouched (cleared ${whole.cleared}, bumps ${whole.f.bumps}, hits ${whole.f.hurts}, falls ${whole.f.falls})`);
      // Nothing waits where you land after a fall: the first 3 m of every roof are clear of masts and walkers.
      for (const s of L.solids) {
        if (s.kind !== "mast") continue;
        const roof = L.solids.find((r) => r.kind === "roof" && s.x0 >= r.x0 && s.x1 <= r.x1 && Math.abs(r.y1 - s.y0) < 1e-9);
        ok(!!roof && s.x0 - roof.x0 >= 6, `seed ${seed} level ${n}: masts stand well in from a roof's edge`);
      }
      for (const e of L.enemies) if (e.kind === "walker") ok(groundUnder(L, e.x0) === e.y && groundUnder(L, e.x1) === e.y, `seed ${seed} level ${n}: walkers patrol solid ground`);
    }
  }
  console.log(`  flew ${crossings} crossings in ${levels} levels (${Object.entries(kinds).map(([k, v]) => `${v} ${k}`).join(", ")}) in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
}

// ── Hits, falls and hearts ──
function onRoof(): Run {
  // A bare level 1 with you standing on the first roof.
  const run = createRunOn(bareLevel(buildLevel(5, 1)));
  return run;
}
{
  // An enemy right on you: one heart, then a blink that shields you.
  const run = onRoof();
  run.enemies.push({ id: 999, kind: "walker", x: run.player.x + 0.6, y: run.player.y, w: 1, h: 1.1, hp: 2, alive: true, gone: false, x0: run.player.x - 5, x1: run.player.x + 20, dir: 1, ax: 0, ay: 0, awake: true, t: 0, cool: 0, charge: 0, flash: 0, aimX: -1, aimY: 0 });
  run.cool = 999; // hold fire
  const ev = step(run, NO_INPUT);
  ok(!!ev.hurt && run.hearts === 2 && run.player.invuln > 0, "touching a walker costs a heart and starts the blink");
  let more = 0;
  for (let i = 0; i < 20; i++) if (step(run, NO_INPUT).hurt) more++;
  ok(more === 0 && run.hearts === 2, "nothing hurts during the blink");
}
{
  // Landing on a walker defeats it and bounces you up.
  const run = onRoof();
  const p = run.player;
  run.enemies.push({ id: 998, kind: "walker", x: p.x + 0.2, y: p.y, w: 1, h: 1.1, hp: 2, alive: true, gone: false, x0: p.x + 0.2, x1: p.x + 0.2, dir: 1, ax: 0, ay: 0, awake: true, t: 0, cool: 0, charge: 0, flash: 0, aimX: -1, aimY: 0 });
  run.cool = 999;
  p.y += 1.15;
  p.grounded = false;
  p.vy = -6;
  p.dropping = true; // straight down
  const before = run.score;
  const ev = step(run, NO_INPUT);
  ok(ev.kills.length === 1 && ev.kills[0].stomp && run.hearts === 3 && p.vy > 0, "landing on a walker defeats it and bounces you");
  ok(run.score - before === TUNING.score.walker + TUNING.score.stomp + 0, "a stomp scores the walker plus the stomp bonus");
}
{
  // A turret shot.
  const run = onRoof();
  const p = run.player;
  run.shots.push({ id: 997, x: p.x + 0.3, y: p.y + 0.8, vx: -1, vy: 0, life: 100, foe: true, kind: "turret" });
  const ev = step(run, NO_INPUT);
  ok(ev.hurt?.cause === "shot" && run.hearts === 2 && run.shots.every((s) => !s.foe), "a turret shot costs a heart and is used up");
}
{
  // Falling off the bottom: a heart, then dropped onto the next roof, blinking.
  const run = onRoof();
  const L = run.level;
  const firstEnd = L.solids.find((s) => s.kind === "roof")!.x1;
  let fell: StepEvents | null = null;
  drive(run, () => NO_INPUT, 2000, (ev) => {
    if (ev.fell && !fell) fell = ev;
  });
  ok(fell !== null, "running off a roof without holding drops you off the bottom");
  const r2 = onRoof();
  let ticks = 0;
  while (r2.phase === "play" && ticks++ < 2000) {
    const ev = step(r2, NO_INPUT);
    if (ev.fell) {
      ok(ev.respawned && r2.hearts === 2 && r2.player.invuln > 0 && r2.player.dropping, "a fall costs a heart and drops you back in, blinking");
      const next = L.solids.filter((s) => s.kind === "roof" && s.x0 > firstEnd - 1e-9).sort((a, b) => a.x0 - b.x0)[0];
      ok(Math.abs(r2.player.x - (next.x0 + 1.4)) < 1e-9 && r2.player.y > next.y1, "you come back just above the next roof");
      for (let i = 0; i < 60 && !r2.player.grounded; i++) step(r2, NO_INPUT);
      ok(r2.player.grounded && Math.abs(r2.player.y - next.y1) < 1e-9, "and land on it");
      break;
    }
  }
  // Three falls and the run is over.
  const r3 = onRoof();
  for (let k = 0; k < 3; k++) {
    r3.player.y = TUNING.killY + 0.05;
    r3.player.grounded = false;
    r3.player.vy = -5;
    step(r3, NO_INPUT);
  }
  ok(r3.phase === "over" && r3.hearts === 0 && r3.stats.hits === 3, "three falls end the run");
  const h = stateHash(r3);
  step(r3, { hold: true, fire: true, aim: 30 });
  ok(stateHash(r3) === h, "nothing moves once the run is over");
}
{
  // The crane's load.
  let found = false;
  for (let seed = 1; seed < 400 && !found; seed++) {
    const L = buildLevel(seed, 3);
    if (!L.loads.length) continue;
    found = true;
    const l = L.loads[0];
    const run = createRunOn(bareLevel(L));
    const at = loadAt(l, run.tick);
    run.player.x = at.x;
    run.player.y = at.y - 0.6;
    run.player.grounded = false;
    run.player.dropping = true;
    const ev = step(run, { ...NO_INPUT, hold: true });
    ok(ev.hurt?.cause === "load" && run.hearts === 2, "the crane's swinging load costs a heart");
    const a0 = loadAt(l, 0);
    const a1 = loadAt(l, Math.round(l.period / 4) - l.phase);
    ok(Math.abs(a0.y - (l.py - l.len * dcos(a0.angle))) < 1e-12 && Math.abs(a1.angle) > l.amp * 0.99, "the load swings its full arc");
  }
  ok(found, "some levels have a crane");
}
{
  // Hearts: a heart pickup refills one; with three it's points.
  const run = onRoof();
  const p = run.player;
  run.hearts = 2;
  run.pickups.push({ id: 1001, kind: "heart", x: p.x + 0.1, y: p.y + 0.8, taken: false });
  step(run, NO_INPUT);
  ok(run.hearts === 3, "a heart pickup gives a heart back");
  const before = run.score;
  run.pickups.push({ id: 1002, kind: "heart", x: run.player.x + 0.1, y: run.player.y + 0.8, taken: false });
  step(run, NO_INPUT);
  ok(run.hearts === 3 && run.score - before >= TUNING.score.heartFull, "with three hearts a heart pickup is points instead");
}

// ── Weapons: you fire them ──
{
  const run = onRoof();
  const p = run.player;
  let none = 0;
  for (let i = 0; i < 30; i++) none += step(run, NO_INPUT).fired.length;
  ok(none === 0, "nothing fires until you press fire");
  const ahead = { hold: false, fire: true, aim: 0 };
  let held = 0;
  for (let i = 0; i < 60; i++) held += step(run, ahead).fired.length;
  ok(held >= 4 && held <= 5, `the Blaster fires about 4 a second while fire is held (${held})`);
  const one = step(createRunOn(run.level), ahead).fired[0];
  ok(!!one && Math.abs(one.vy) < 1e-12 && one.vx > 0, "aim 0 fires straight ahead");
  const up = step(createRunOn(run.level), { hold: false, fire: true, aim: 90 }).fired[0];
  ok(!!up && Math.abs(up.vx) < 1e-6 && up.vy > 0, "aim 90 fires straight up");
  const r0 = createRunOn(run.level);
  const down = step(r0, { hold: false, fire: true, aim: -45 }).fired[0];
  ok(!!down && down.vy < 0 && Math.abs(down.vx + down.vy) < 1e-6, "aim -45 fires down and ahead");
  // Spread: three shots in a fan, 20 seconds.
  run.pickups.push({ id: 1003, kind: "spread", x: p.x + 0.1, y: p.y + 0.8, taken: false });
  step(run, NO_INPUT);
  ok(run.weapon === "spread" && run.weaponTicks > TUNING.pickupTicks - 5, "picking up Spread sets it for 20 seconds");
  run.cool = 0;
  const fan = step(run, { hold: false, fire: true, aim: 20 }).fired;
  const angles = fan.map((f) => (Math.atan2(f.vy, f.vx) * 180) / Math.PI).sort((a, b) => a - b);
  ok(fan.length === 3 && fan.every((f) => f.kind === "spread") && Math.abs(angles[0] - 7) < 0.01 && Math.abs(angles[1] - 20) < 0.01 && Math.abs(angles[2] - 33) < 0.01, `Spread fires three shots 13 degrees apart around your aim (${angles.map((a) => a.toFixed(1)).join(", ")})`);
  run.weaponTicks = 2;
  let out = false;
  for (let i = 0; i < 3; i++) out = step(run, NO_INPUT).weaponOut || out;
  ok(run.weapon === "blaster" && out, "Spread runs out back to the Blaster");
  const r2 = onRoof();
  r2.weapon = "rapid";
  r2.weaponTicks = 600;
  let rapid = 0;
  for (let i = 0; i < 60; i++) rapid += step(r2, ahead).fired.length;
  ok(rapid === 10, `Rapid fires 10 a second (${rapid})`);
}
{
  // Aim assist: a target 4 degrees off your line is hit; one 10 degrees off isn't helped.
  const make = (offDeg: number) => {
    const run = onRoof();
    const p = run.player;
    const gx = p.x + TUNING.gunX + TUNING.muzzle;
    const gy = p.y + TUNING.gunY;
    const a = (offDeg * Math.PI) / 180;
    const ex = gx + Math.cos(a) * 10;
    const ey = gy + Math.sin(a) * 10;
    // A still target (a walker that doesn't patrol) floating where it's wanted.
    run.enemies.push({ id: 7001, kind: "walker", x: ex, y: ey - 0.55, w: 1.0, h: 1.1, hp: 1, alive: true, gone: false, x0: ex, x1: ex, dir: 0, ax: ex, ay: ey, awake: false, t: 0, cool: 0, charge: 0, flash: 0, aimX: -1, aimY: 0 });
    return run;
  };
  const near = make(4);
  const shot = step(near, { hold: false, fire: true, aim: 0 }).fired[0];
  const bent = (Math.atan2(shot.vy, shot.vx) * 180) / Math.PI;
  ok(bent > 3 && bent < 5, `a shot bends toward an enemy 4 degrees off the line (${bent.toFixed(2)})`);
  const far = make(10);
  const straight = step(far, { hold: false, fire: true, aim: 0 }).fired[0];
  ok(Math.abs(straight.vy) < 1e-12, "a shot doesn't bend toward one 10 degrees off");
  const hitNear = (() => {
    const r = make(4);
    for (let i = 0; i < 60 && r.enemies[r.enemies.length - 1].alive; i++) step(r, { hold: false, fire: i === 0, aim: 0 });
    return !r.enemies[r.enemies.length - 1].alive;
  })();
  ok(hitNear, "the bent shot hits it");
  ok(TUNING.assistCos === Math.cos((TUNING.assistDeg * Math.PI) / 180) || Math.abs(TUNING.assistCos - Math.cos((TUNING.assistDeg * Math.PI) / 180)) < 1e-15, "the assist's cosine matches its degrees");
}
{
  // Turrets: your reach beats theirs, and they take three hits.
  ok(TUNING.shotSpeed * TUNING.shotLife * TUNING.dt > TUNING.turret.range + 2, "your shots reach further than a turret's range");
  const run = onRoof();
  const p = run.player;
  run.enemies.push({ id: 7002, kind: "turret", x: p.x + 16.5, y: p.y, w: 1.3, h: 1.1, hp: TUNING.turret.hp, alive: true, gone: false, x0: 0, x1: 0, dir: 0, ax: 0, ay: 0, awake: false, t: 0, cool: 0, charge: 0, flash: 0, aimX: -1, aimY: 0 });
  // Stand still (a wall-less test: drop the player onto a flat spot) and fire straight at it.
  const turret = run.enemies[run.enemies.length - 1];
  let foeShots = 0;
  for (let i = 0; i < 90 && turret.alive; i++) foeShots += step(run, { hold: false, fire: true, aim: -2 }).foeFired.length;
  ok(!turret.alive && foeShots === 0, `firing at a turret as it comes into reach knocks it out before it shoots (${foeShots} shots)`);
}

// ── Level end and score ──
{
  const L = buildLevel(808, 1);
  const run = createRunOn(bareLevel(L));
  drive(run, (r) => {
    const lane = laneTarget(r);
    return lane === null ? NO_INPUT : holdFor(r, lane);
  }, 8000);
  ok(run.phase === "cleared", "crossing the gate clears the level");
  const meters = Math.floor((run.maxX - L.start.x) * TUNING.score.perMeter);
  ok(run.stats.clearBonus === TUNING.score.clear && run.stats.noHitBonus === TUNING.score.noHit, "level 1 pays the clear bonus and, untouched, the no-hit bonus");
  ok(run.score === meters + TUNING.score.clear + TUNING.score.noHit, `the score is distance plus the bonuses (${run.score})`);
  ok(run.cleared.length === 1 && run.stats.levelScore === run.score, "the level's numbers are kept");
  const scoreBefore = run.score;
  const h = stateHash(run);
  step(run, { hold: true, fire: true, aim: -40 });
  ok(stateHash(run) === h, "nothing moves on the Level cleared card");
  run.hearts = 2;
  nextLevel(run);
  ok(run.phase === "play" && run.level.number === 2 && run.score === scoreBefore && run.hearts === 3, "Continue: level 2, the score kept, one heart back");
  ok(run.level.speed > L.speed, "level 2 is faster");
  ok(run.player.x === run.level.start.x && run.shots.length === 0, "level 2 starts at its start");
  bank(run);
  ok(run.phase === "banked" && run.score === scoreBefore, "Bank my score ends the run with the score as it is");
}
{
  // A hit on the way: no no-hit bonus, and level 2's bonuses are doubled.
  const L = buildLevel(909, 2);
  const run = createRunOn(bareLevel(L));
  run.shots.push({ id: 990, x: run.player.x + 0.3, y: run.player.y + 0.8, vx: -1, vy: 0, life: 100, foe: true, kind: "turret" });
  drive(run, (r) => {
    const lane = laneTarget(r);
    return lane === null ? NO_INPUT : holdFor(r, lane);
  }, 9000);
  ok(run.phase === "cleared" && run.stats.hits === 1 && run.stats.noHitBonus === 0 && run.stats.clearBonus === TUNING.score.clear * 2, "a hit loses the no-hit bonus; level 2's clear bonus is twice level 1's");
}

// ── The autopilot plays the real thing ──
{
  let clears = 0;
  let total = 0;
  let enemies = 0;
  const N = 60;
  for (let seed = 1; seed <= N; seed++) {
    const run = createRun(seed * 104729);
    drive(run, autopilot, 8000);
    if (run.phase === "cleared") clears++;
    total += run.score;
    enemies += run.stats.enemies;
  }
  console.log(`  autopilot: cleared level 1 in ${clears} of ${N} runs, average score ${Math.round(total / N)}, ${(enemies / N).toFixed(1)} enemies a run`);
  ok(clears >= N * 0.6, "the autopilot clears level 1 most of the time");
}

// ── A sloppier player: aim off by up to 12 degrees, fire a beat late, react a little late ──
{
  let clears = 0;
  let hearts = 0;
  const N = 60;
  for (let seed = 1; seed <= N; seed++) {
    const run = createRun(seed * 7907);
    let err = 0;
    let delay: Input[] = [];
    drive(run, (r) => {
      const want = autopilot(r);
      if (r.tick % 20 === 0) err = (rand() - 0.5) * 24;
      const sloppy = { hold: want.hold, fire: want.fire && rand() < 0.8, aim: want.aim + err };
      // Everything happens 6 steps (a tenth of a second) after the bot would do it.
      delay.push(sloppy);
      if (delay.length > 6) return delay.shift()!;
      return NO_INPUT;
    }, 8000);
    delay = [];
    if (run.phase === "cleared") clears++;
    hearts += run.hearts;
  }
  console.log(`  sloppy player: cleared level 1 in ${clears} of ${N} runs, ${(hearts / N).toFixed(1)} hearts left on average`);
  ok(clears >= N * 0.5, "a sloppy player still clears level 1 most of the time");
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
