/**
 * Item Box Royale: everyone who types "join" in the first 25 seconds is in.
 * Then knockout waves, a few seconds each: items take players out with a
 * one-line story ("Sam slid out on a banana peel") until one is left. Nobody
 * answers after joining; it's a show. The knockouts are drawn the moment
 * joining closes and kept in the break's meta, so every screen tells the same
 * story. Points: 1 for jumping in, 2 for the last three, 5 more for the winner.
 */

import type { Award, BreakGame, RunMeta } from "./common";
import { chatLine, shuffle } from "./common";

type Royale = NonNullable<RunMeta["royale"]>;

/** Our own knockout lines ({name} is the player). Kept light: nobody gets hurt, they just spin out. */
export const ITEM_LINES = [
  "{name} slid out on a banana peel",
  "{name} took a green shell to the bumper",
  "{name} got chased down by a red shell",
  "{name} shrank under a lightning bolt",
  "{name} was flattened by a falling block",
  "{name} spun out in a puddle of ink",
  "{name} drove straight into a Bob-omb",
  "{name} got bonked by a giant mushroom",
  "{name} was blown off the track by a gust of wind",
  "{name} hit a fake item box",
  "{name} got caught in a tornado",
  "{name} took a wrong turn and never came back",
  "{name} was scared off by a Boo",
  "{name} fell off the edge chasing a coin",
  "{name} ran out of gas",
  "{name} got tangled in a jump rope",
  "{name} tripped over a stray dice block",
  "{name} was launched by a spring and landed in the lake",
  "{name} got sticky with honey",
  "{name} was snowed in by a snowball",
  "{name} stopped to pet a dog",
  "{name} was distracted by a shiny star",
  "{name} took the scenic route",
  "{name} got their wheels stuck in the mud",
  "{name} was bounced out by a bumper",
  "{name} lost a staring contest with a Thwomp",
  "{name} wandered off to find snacks",
  "{name} got zapped by a POW block",
  "{name} was swept away by a big wave",
  "{name} hit the brakes at the worst moment",
];

const MAX_WAVES = 6;
const WAVE_SECONDS = 5;
const SHOW_NAMES = 40;
const JOIN = /^!?(join|in|me|i'?m in)[.!]*$/i;

/** Draws the knockout waves for these players: about six waves, ending with one left. */
export function drawRoyale(players: Royale["players"], rand: () => number): Royale {
  const n = players.length;
  if (n <= 1) return { players, waves: [], shown: 0, winner: n === 1 ? 0 : null };
  const order = shuffle(players.map((_, i) => i), rand);
  const waveCount = Math.min(MAX_WAVES, n - 1);
  const waves: Royale["waves"] = [];
  let left = order;
  for (let w = 0; w < waveCount; w += 1) {
    const take = Math.ceil((left.length - 1) / (waveCount - w));
    const out = left.slice(0, take);
    left = left.slice(take);
    const lines = shuffle(ITEM_LINES, rand);
    waves.push({ out, lines: out.map((_, i) => lines[i % lines.length]) });
  }
  return { players, waves, shown: 0, winner: left[0] ?? null };
}

const nameAt = (r: Royale, i: number) => r.players[i]?.name ?? "Someone";
function aliveAfter(r: Royale, waves: number): number[] {
  const out = new Set(r.waves.slice(0, waves).flatMap((w) => w.out));
  return r.players.map((_, i) => i).filter((i) => !out.has(i));
}

export const itemBoxRoyale: BreakGame = {
  id: "item-box-royale",
  rounds: (meta) => (meta.royale ? 1 + meta.royale.waves.length : 8),
  make: (ctx) => {
    if (ctx.fresh || ctx.roundOfGame === 1) {
      return {
        key: null,
        round: { layout: "royale", stage: "join", prompt: "Type join to jump in", hint: "Type join. Last one standing wins", alive: [], aliveCount: 0, tag: "Item Box Royale" },
        secret: { stage: "join" },
        meta: { royale: null },
      };
    }
    const r = ctx.meta.royale;
    const wave = ctx.roundOfGame - 2;
    if (!r || wave >= r.waves.length) return null;
    const alive = aliveAfter(r, wave);
    return {
      key: null,
      round: {
        layout: "royale",
        stage: "wave",
        prompt: `Wave ${wave + 1}: items incoming`,
        hint: `${alive.length} still in`,
        alive: alive.slice(0, SHOW_NAMES).map((i) => nameAt(r, i)),
        aliveCount: alive.length,
        tag: "Item Box Royale",
      },
      secret: { stage: "wave", wave },
      seconds: WAVE_SECONDS,
      quiet: true,
    };
  },
  accept: (text, round) => (round.layout === "royale" && round.stage === "join" && JOIN.test(text.trim()) ? "join" : null),
  judge: ({ secret }, answers, meta) => {
    if (secret.stage === "join") {
      const seen = new Set<string>();
      const players: Royale["players"] = [];
      for (const a of answers) {
        const k = `${a.platform}:${a.viewer}`;
        if (seen.has(k)) continue;
        seen.add(k);
        players.push({ platform: a.platform, viewer: a.viewer, name: a.name || "Someone" });
      }
      const royale = drawRoyale(players, Math.random);
      const awards: Award[] = players.map((p) => ({ ...p, points: 1 + (players.length === 1 ? 5 : 0) }));
      const text = !players.length
        ? "Nobody jumped in."
        : players.length === 1 ? `Only ${players[0].name} jumped in, so ${players[0].name} wins!` : `${players.length} jumped in. Here come the items!`;
      return {
        awards,
        reveal: { text, answered: players.length, right: players.length, alive: players.slice(0, SHOW_NAMES).map((p) => p.name), aliveCount: players.length },
        line: players.length === 1 ? chatLine(`Item Box Royale: ${players[0].name} was the only one in, so ${players[0].name} wins!`) : null,
        meta: { royale },
      };
    }
    const r = meta.royale;
    const wave = Number(secret.wave ?? 0);
    const w = r?.waves[wave];
    if (!r || !w) return { awards: [], reveal: { text: "", answered: 0, right: 0 }, line: null };
    const alive = aliveAfter(r, wave + 1);
    const last = wave === r.waves.length - 1;
    const out = w.out.map((i, k) => ({ name: nameAt(r, i), line: w.lines[k].replace("{name}", nameAt(r, i)) }));
    const awards: Award[] = [];
    if (last) {
      // The last three standing: the winner and the last wave's knockouts.
      for (const i of [...alive, ...w.out].slice(0, 3)) awards.push({ ...r.players[i], points: 2 });
      if (r.winner !== null) awards.push({ ...r.players[r.winner], points: 5 });
    }
    const winnerName = r.winner !== null ? nameAt(r, r.winner) : null;
    const text = last && winnerName ? `${winnerName} is the last one standing!` : `${out.length} out.`;
    return {
      awards,
      reveal: {
        text,
        answered: 0,
        right: 0,
        out: out.slice(0, 12),
        outMore: Math.max(0, out.length - 12),
        alive: alive.slice(0, SHOW_NAMES).map((i) => nameAt(r, i)),
        aliveCount: alive.length,
      },
      line: last && winnerName ? chatLine(`Item Box Royale: ${winnerName} is the last one standing out of ${r.players.length}!`) : null,
      meta: { royale: { ...r, shown: wave + 1 } },
    };
  },
};
