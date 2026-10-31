/**
 * Boss Fight: chat against a boss with a health bar. Type "hit" each round
 * (one hit per person per round counts); every hit does 8 to 14 damage and
 * one in eight is a critical for triple. The boss's health follows the crowd:
 * HP_PER_FIGHTER for each hitter in the busiest round so far (never below
 * BASE_HP), so a busy chat meets a bigger boss, a quiet one can still win, and
 * people dropping in for one hit don't make it unbeatable. Beat it
 * within MAX_ROUNDS and everyone who hit it scores; the final blow scores a
 * little more. Lose and nobody scores (the catalog's rule: it's co-op).
 */

import type { Award, BreakGame, RunMeta } from "./common";
import { chatLine, pick } from "./common";

type Boss = NonNullable<RunMeta["boss"]>;

/** Our own bosses: names and the glyph the overlay draws (no characters from anyone's game). */
export const BOSSES = [
  { name: "King Kablooey", glyph: "bomb" },
  { name: "The Grumble Cloud", glyph: "cloud" },
  { name: "Sir Shellsworth", glyph: "shield" },
  { name: "The Mimic Box", glyph: "box" },
  { name: "The Dice Dragon", glyph: "dice" },
  { name: "Count Cartwheel", glyph: "wheel" },
  { name: "The Moody Moon", glyph: "moon" },
  { name: "Big Bad Bolt", glyph: "bolt" },
] as const;

export const BASE_HP = 60;
export const HP_PER_FIGHTER = 40;
export const MAX_ROUNDS = 5;
const MIN_HIT = 8;
const MAX_HIT = 14;
const CRIT_CHANCE = 1 / 8;
const WIN_POINTS = 3;
const FINAL_BLOW = 2;

const HIT = /^!?(hit|attack|atk|smack|bonk|punch|strike)[!.]*$/i;

/** The boss's health for this many hitters in one round. */
export const hpFor = (fighters: number) => Math.max(BASE_HP, fighters * HP_PER_FIGHTER);

/** One hit: damage and whether it was a critical. */
export function rollHit(rand: () => number): { damage: number; crit: boolean } {
  const base = MIN_HIT + Math.floor(rand() * (MAX_HIT - MIN_HIT + 1));
  const crit = rand() < CRIT_CHANCE;
  return { damage: crit ? base * 3 : base, crit };
}

function freshBoss(rand: () => number, skip: (key: string) => boolean): Boss {
  const choices = BOSSES.filter((b) => !skip(`boss:${b.glyph}`));
  const b = pick(choices.length ? choices : BOSSES, rand);
  return { name: b.name, glyph: b.glyph, hp: BASE_HP, maxHp: BASE_HP, fighters: [], peak: 0, rounds: 0, over: false, won: false };
}

/**
 * Applies a round of hits: new fighters grow the boss first, then the
 * damage lands. Pure apart from `rand`, so the test can run whole fights.
 */
export function applyHits(boss: Boss, hitters: { platform: string; viewer: string; name: string }[], rand: () => number) {
  const fighters = boss.fighters.map((f) => ({ ...f }));
  const byKey = new Map(fighters.map((f) => [`${f.platform}:${f.viewer}`, f]));
  const hits: { name: string; damage: number; crit: boolean; key: string }[] = [];
  for (const h of hitters) {
    const key = `${h.platform}:${h.viewer}`;
    let f = byKey.get(key);
    if (!f) { f = { ...h, hits: 0, crits: 0, damage: 0 }; fighters.push(f); byKey.set(key, f); }
    const { damage, crit } = rollHit(rand);
    f.hits += 1;
    f.damage += damage;
    if (crit) f.crits += 1;
    hits.push({ name: h.name, damage, crit, key });
  }
  // The crowd grew: so does the boss (its missing health stays missing).
  const peak = Math.max(boss.peak ?? 0, hits.length);
  const target = hpFor(peak);
  const grew = Math.max(0, target - boss.maxHp);
  const maxHp = boss.maxHp + grew;
  let hp = boss.hp + grew;
  let finalBlow: string | null = null;
  for (const h of hits) {
    if (hp <= 0) break;
    hp -= h.damage;
    if (hp <= 0) finalBlow = h.key;
  }
  const rounds = boss.rounds + 1;
  const won = hp <= 0;
  const next: Boss = { ...boss, fighters, peak, maxHp, hp: Math.max(0, hp), rounds, won, over: won || rounds >= MAX_ROUNDS };
  return { boss: next, hits, grew, finalBlow, damage: hits.reduce((n, h) => n + h.damage, 0) };
}

export const bossFight: BreakGame = {
  id: "boss-fight",
  rounds: (meta) => (meta.boss?.over ? meta.boss.rounds : MAX_ROUNDS),
  make: (ctx) => {
    const boss = ctx.fresh || !ctx.meta.boss || ctx.meta.boss.over ? freshBoss(ctx.rand, ctx.skip) : ctx.meta.boss;
    if (boss.over) return null;
    const left = MAX_ROUNDS - boss.rounds;
    return {
      key: boss.rounds === 0 ? `boss:${boss.glyph}` : null,
      round: {
        layout: "boss",
        prompt: boss.rounds === 0 ? `${boss.name} appears!` : left === 1 ? `Last chance to take down ${boss.name}` : `${boss.name} is still standing`,
        hint: "Type hit",
        boss: { name: boss.name, glyph: boss.glyph, hp: boss.hp, maxHp: boss.maxHp },
        fighters: boss.fighters.length,
        tag: "Co-op",
      },
      secret: {},
      ...(boss !== ctx.meta.boss ? { meta: { boss } } : {}),
    };
  },
  accept: (text, round) => (round.layout === "boss" && HIT.test(text.trim()) ? "hit" : null),
  judge: (_draft, answers, meta) => {
    const start = meta.boss;
    if (!start) return { awards: [], reveal: { text: "", answered: 0, right: 0 }, line: null };
    const seen = new Set<string>();
    const hitters: { platform: string; viewer: string; name: string }[] = [];
    for (const a of answers) {
      const k = `${a.platform}:${a.viewer}`;
      if (seen.has(k)) continue;
      seen.add(k);
      hitters.push({ platform: a.platform, viewer: a.viewer, name: a.name || "Someone" });
    }
    const r = applyHits(start, hitters, Math.random);
    const boss = r.boss;
    const crits = r.hits.filter((h) => h.crit).length;
    const top = [...r.hits].sort((p, q) => q.damage - p.damage).slice(0, 3);
    const grewNote = r.grew > 0 && start.rounds > 0 ? ` More of chat joined in, so ${boss.name} grew stronger.` : "";
    let text: string;
    let line: string | null = null;
    const awards: Award[] = [];
    if (boss.won) {
      const finisher = boss.fighters.find((f) => `${f.platform}:${f.viewer}` === r.finalBlow);
      text = `${boss.name} is down! ${finisher ? `${finisher.name} landed the final blow. ` : ""}Everyone who hit it scores.`;
      for (const f of boss.fighters) awards.push({ platform: f.platform, viewer: f.viewer, name: f.name, points: WIN_POINTS + (`${f.platform}:${f.viewer}` === r.finalBlow ? FINAL_BLOW : 0) });
      line = chatLine(`Boss Fight: ${boss.fighters.length === 1 ? "1 fighter" : `${boss.fighters.length} fighters`} took down ${boss.name}${finisher ? `, ${finisher.name} with the final blow` : ""}!`);
    } else if (boss.over) {
      text = `${boss.name} got away with ${boss.hp} health left.${hitters.length ? "" : " Nobody hit it this round."}`;
      line = chatLine(`Boss Fight: ${boss.name} got away with ${boss.hp} of ${boss.maxHp} health left. Next time!`);
    } else if (!hitters.length) {
      text = `Nobody hit ${boss.name}. ${boss.hp} health left.`;
    } else {
      text = `Chat hit for ${r.damage}${crits ? ` with ${crits === 1 ? "a critical" : `${crits} criticals`}` : ""}. ${boss.hp} health left.${grewNote}`;
    }
    return {
      awards,
      reveal: {
        text,
        answered: hitters.length,
        right: hitters.length,
        boss: { name: boss.name, glyph: boss.glyph, hp: boss.hp, maxHp: boss.maxHp },
        // Won: the fight's top hitters with what they scored. Otherwise: this round's biggest hits.
        winners: boss.won
          ? [...boss.fighters].sort((p, q) => q.damage - p.damage).slice(0, 3).map((f) => ({
            name: f.name,
            detail: `${f.damage} damage`,
            points: WIN_POINTS + (`${f.platform}:${f.viewer}` === r.finalBlow ? FINAL_BLOW : 0),
          }))
          : top.map((h) => ({ name: h.name, detail: h.crit ? `${h.damage}, critical` : String(h.damage), points: 0 })),
      },
      line,
      meta: { boss },
    };
  },
};
