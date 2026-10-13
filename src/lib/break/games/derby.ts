/**
 * Kart Derby: type a lane (1 to 8), or "join" for whichever lane has the
 * fewest, to put your name on a kart. When joining closes the whole race is
 * drawn (speeds plus item boxes: boosts, banana peels, a shell for the
 * leader) and kept in the break's meta, so every screen shows the same race.
 * Then it plays out a lap per round on the overlay. Busy chats race as eight
 * lane teams; empty lanes get a GameShuffle kart. Points: 1 for joining, then
 * 5, 3 and 2 for everyone in the lanes that finish first, second and third.
 * Pure luck: anyone can win. Our own karts, drawn by us (no Nintendo art).
 */

import type { Award, BreakGame, RunMeta } from "./common";
import { chatLine, shuffle } from "./common";
import type { DerbyEvent, DerbyLane } from "../types";

type Derby = NonNullable<RunMeta["derby"]>;
type Racer = { platform: string; viewer: string; name: string };

export const LANES = 8;
export const LAPS = 3;
export const LAP_SECONDS = 8;
const PODIUM = [5, 3, 2];

/** GameShuffle's own karts for empty lanes. */
export const HOUSE_KARTS = ["Turbo Toaster", "The Wobbler", "Sir Skids", "Lil Zoom", "Captain Clutch", "The Bolt Bucket", "Mrs Muffler", "Dash Hound"];

const JOIN = /^!?(join|in|me|race|i'?m in)[.!]*$/i;
const LANE = /^!?(?:lane\s*)?#?([1-8])\.?$/i;

/** Lane labels: the racer's name, "Lane 3" for a team (the count shows beside it), or a GameShuffle kart. */
function laneLabel(racers: Racer[], lane: number, house: string[]): string {
  if (racers.length === 1) return racers[0].name;
  if (racers.length > 1) return `Lane ${lane}`;
  return house[(lane - 1) % house.length];
}

/** How a lane is named in a sentence: "Sam", "Lane 3 (12 racers)", "Turbo Toaster". */
const sayLane = (l: { label: string; racers: unknown[] | number }) => {
  const n = typeof l.racers === "number" ? l.racers : l.racers.length;
  return n > 1 ? `${l.label} (${n} racers)` : l.label;
};

/** Puts everyone in a lane: their pick, or the emptiest lane for "join" (ties at random). */
export function seatRacers(picks: { racer: Racer; lane: number | null }[], rand: () => number): Racer[][] {
  const lanes: Racer[][] = Array.from({ length: LANES }, () => []);
  for (const p of picks) if (p.lane) lanes[p.lane - 1].push(p.racer);
  for (const p of picks) {
    if (p.lane) continue;
    const fewest = Math.min(...lanes.map((l) => l.length));
    const open = lanes.map((l, i) => (l.length === fewest ? i : -1)).filter((i) => i >= 0);
    lanes[open[Math.floor(rand() * open.length)]].push(p.racer);
  }
  return lanes;
}

/**
 * Draws the race: each lap every kart covers some ground, and two or three
 * item boxes swing it. Positions are scaled so the winner crosses at exactly
 * 100. Returns positions after each lap (lap 0 = the start line), the events
 * per lap and the finishing order (lane numbers).
 */
export function drawRace(labels: string[], rand: () => number): { marks: number[][]; events: DerbyEvent[][]; order: number[] } {
  const dist = labels.map(() => 0);
  const raw: number[][] = [dist.slice()];
  const events: DerbyEvent[][] = [];
  for (let lap = 1; lap <= LAPS; lap += 1) {
    const gain = labels.map(() => 20 + rand() * 10);
    const lapEvents: DerbyEvent[] = [];
    const leader = dist.indexOf(Math.max(...dist));
    const kinds = shuffle(["boost", "banana", "shell", "mushroom", "boost", "banana"], rand).slice(0, 2 + Math.floor(rand() * 2));
    const used = new Set<number>();
    for (const kind of kinds) {
      let lane = Math.floor(rand() * labels.length);
      if (kind === "shell" && lap > 1) lane = leader;
      if (used.has(lane)) continue;
      used.add(lane);
      const who = labels[lane];
      const at = Math.round((0.2 + rand() * 0.6) * 100) / 100;
      if (kind === "boost") { gain[lane] += 8; lapEvents.push({ at, lane: lane + 1, text: `${who} hit a boost` }); }
      else if (kind === "mushroom") { gain[lane] += 5; lapEvents.push({ at, lane: lane + 1, text: `${who} found a shortcut` }); }
      else if (kind === "banana") { gain[lane] -= 7; lapEvents.push({ at, lane: lane + 1, text: `${who} slid on a banana peel` }); }
      else if (kind === "shell") { gain[lane] -= 8; lapEvents.push({ at, lane: lane + 1, text: lap > 1 ? `A shell caught the leader, ${who}` : `${who} took a shell` }); }
    }
    for (let i = 0; i < labels.length; i += 1) dist[i] += Math.max(6, gain[i]);
    raw.push(dist.slice());
    events.push(lapEvents.sort((p, q) => p.at - q.at));
  }
  const best = Math.max(...dist);
  const marks = raw.map((row) => row.map((d) => Math.round((d / best) * 1000) / 10));
  const order = labels.map((_, i) => i).sort((p, q) => dist[q] - dist[p]).map((i) => i + 1);
  return { marks, events, order };
}

const racerCount = (d: Derby) => d.lanes.reduce((n, l) => n + l.racers.length, 0);

function lanesView(d: Derby, lap: number, places = false): DerbyLane[] {
  return d.lanes.map((l, i) => ({
    lane: l.lane,
    label: l.label,
    racers: l.racers.length,
    from: d.marks[Math.max(0, lap - 1)][i],
    to: d.marks[lap][i],
    ...(places ? { place: d.order.indexOf(l.lane) + 1 } : {}),
  }));
}

export const kartDerby: BreakGame = {
  id: "kart-derby",
  rounds: (meta) => (meta.derby && racerCount(meta.derby) === 0 ? 1 : 1 + LAPS),
  make: (ctx) => {
    if (ctx.fresh || ctx.roundOfGame === 1) {
      const lanes: DerbyLane[] = Array.from({ length: LANES }, (_, i) => ({ lane: i + 1, label: `Lane ${i + 1}`, racers: 0, from: 0, to: 0 }));
      return {
        key: null,
        round: { layout: "derby", stage: "join", prompt: "Pick a lane for the Kart Derby", hint: "Type a lane, 1 to 8 (or join)", lanes, stretch: 0, stretches: LAPS, events: [], seconds: 0, tag: "Kart Derby" },
        secret: { stage: "join" },
        meta: { derby: null },
      };
    }
    const d = ctx.meta.derby;
    const lap = ctx.roundOfGame - 1;
    if (!d || lap > LAPS || racerCount(d) === 0) return null;
    return {
      key: null,
      round: {
        layout: "derby",
        stage: "race",
        prompt: lap === LAPS ? "Final lap!" : `Lap ${lap} of ${LAPS}`,
        hint: "Watch the race",
        lanes: lanesView(d, lap),
        stretch: lap,
        stretches: LAPS,
        events: d.events[lap - 1] ?? [],
        seconds: LAP_SECONDS,
        tag: "Kart Derby",
      },
      secret: { stage: "race", lap },
      seconds: LAP_SECONDS,
      quiet: true,
    };
  },
  accept: (text, round) => {
    if (round.layout !== "derby" || round.stage !== "join") return null;
    const t = text.trim();
    const m = LANE.exec(t);
    if (m) return m[1];
    return JOIN.test(t) ? "any" : null;
  },
  judge: ({ secret }, answers, meta) => {
    if (secret.stage === "join") {
      const seen = new Set<string>();
      const picks: { racer: Racer; lane: number | null }[] = [];
      // Latest answer per viewer is what the runner hands over; keep the first of any duplicates.
      for (const a of answers) {
        const k = `${a.platform}:${a.viewer}`;
        if (seen.has(k)) continue;
        seen.add(k);
        picks.push({ racer: { platform: a.platform, viewer: a.viewer, name: a.name || "Someone" }, lane: a.answer === "any" ? null : Number(a.answer) });
      }
      const seated = seatRacers(picks, Math.random);
      const house = shuffle(HOUSE_KARTS, Math.random);
      const labels = seated.map((racers, i) => laneLabel(racers, i + 1, house));
      const race = drawRace(labels, Math.random);
      const derby: Derby = { lanes: seated.map((racers, i) => ({ lane: i + 1, label: labels[i], racers })), ...race, shown: 0 };
      const awards: Award[] = picks.map((p) => ({ ...p.racer, points: 1 }));
      const lanesUsed = seated.filter((l) => l.length).length;
      return {
        awards,
        reveal: {
          text: picks.length ? `${picks.length === 1 ? "1 racer" : `${picks.length} racers`} in ${lanesUsed === 1 ? "1 lane" : `${lanesUsed} lanes`}. Engines on!` : "Nobody picked a lane.",
          answered: picks.length,
          right: picks.length,
          lanes: lanesView(derby, 0),
        },
        line: null,
        meta: { derby },
      };
    }
    const d = meta.derby;
    const lap = Number(secret.lap ?? 1);
    if (!d) return { awards: [], reveal: { text: "", answered: 0, right: 0 }, line: null };
    const last = lap >= LAPS;
    const lanes = lanesView(d, lap, last);
    const leadLane = [...lanes].sort((p, q) => q.to - p.to)[0];
    const awards: Award[] = [];
    let text = `${sayLane(leadLane)} leads after lap ${lap}.`;
    let line: string | null = null;
    if (last) {
      const podium = d.order.slice(0, 3).map((n) => d.lanes[n - 1]);
      podium.forEach((l, place) => { for (const r of l.racers) awards.push({ ...r, points: PODIUM[place] }); });
      const finals = d.marks[LAPS];
      const [first, second] = d.order;
      const photo = finals[second - 1] >= 98.5;
      text = `${photo ? "Photo finish! " : ""}${sayLane(podium[0])} wins, then ${sayLane(podium[1])} and ${sayLane(podium[2])}.`;
      const inLane = (l: (typeof podium)[number], n: number) => (l.racers.length > 1 ? sayLane(l) : `${l.label} (lane ${n})`);
      line = chatLine(`Kart Derby: ${inLane(podium[0], first)} wins${photo ? " in a photo finish" : ""}! ${sayLane(podium[1])} second, ${sayLane(podium[2])} third.`);
    }
    return {
      awards,
      reveal: {
        text,
        answered: 0,
        right: 0,
        lanes,
        winners: last ? d.order.slice(0, 3).map((n, place) => {
          const l = d.lanes[n - 1];
          return { name: l.label, detail: l.racers.length > 1 ? `${l.racers.length} racers` : `lane ${n}`, points: l.racers.length ? PODIUM[place] : 0 };
        }) : undefined,
      },
      line,
      meta: { derby: { ...d, shown: lap } },
    };
  },
};
