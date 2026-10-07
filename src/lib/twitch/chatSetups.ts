/**
 * Match rolls: what `!gs setup` rolls for the game on stream, the part of a
 * match everyone plays on rather than each player's pick. Each game uses its
 * own randomizer: tracks for Mario Kart, a stage and rules for Smash, a board
 * and turns for Mario Party, a map for the hero shooters, a battle for
 * Splatoon, a course for Kirby, the whole match for the N64 shooters, a cup
 * for Pokémon Stadium.
 *
 * Returns the same ChatRoll shape as a player roll (kind "setup", with a
 * title), so the overlay card, recap and Hub feed show it without new
 * readers. Server-side: imports every game's data. Keyed by randomizer slug;
 * `getChatGame` still decides whether a game is on in chat.
 */

import mk64Data from "@/data/mk64-data.json";
import { randomizeTrackList } from "@/lib/randomizer";
import { TWITCH_GAMES } from "@/lib/twitch/games";
import type { Cup, KnockoutRally } from "@/data/types";
import type { ChatRoll, RollSlot } from "@/lib/twitch/chatRoll";
import { pick } from "@/lib/party/roll";
import { ULTIMATE } from "@/data/smash/ultimate";
import { COMPETITIVE_RULES, rollPartyRules, rollStage, stagePool, type SmashRules } from "@/lib/smash/roll";
import { PARTY_GAMES } from "@/data/party";
import { rollSetup } from "@/lib/party/roll";
import type { PartyGame } from "@/lib/party/types";
import { OVERWATCH } from "@/data/heroes/overwatch";
import { MARVEL_RIVALS } from "@/data/heroes/marvel-rivals";
import { mapModes, rollMap } from "@/lib/heroes/roll";
import type { HeroGame } from "@/lib/heroes/types";
import { SPLATOON3, splatStageArt } from "@/data/splatoon/splatoon3";
import { rollBattle, rollSalmon, rollSet } from "@/lib/splatoon/roll";
import { AIR_RIDERS } from "@/data/kirby/air-riders";
import { rollCourse, rollStadium } from "@/lib/kirby/roll";
import { rollMatch as rollGoldenEyeMatch } from "@/lib/goldeneye/roll";
import { rollMatch as rollPdMatch } from "@/lib/perfectdark/roll";
import { stadiumGame } from "@/lib/pokemon/stadium";

export interface SetupContext {
  /** Whatever followed the command ("8", "party", "push", "top"). */
  arg: string;
  /** Players in the lobby (some setups depend on it: GoldenEye maps). */
  players: number;
}

export interface ChatSetup {
  /** What can follow `!gs setup`, for help text. */
  argHint?: string;
  roll(ctx: SetupContext): ChatRoll;
}

const words = (arg: string) => arg.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").split(/\s+/).filter(Boolean);
/** Chat reads "🏁 Grand Prix, 4 races: 1. Mushroom Gorge · 2. …" (titles never contain ": "; the command splits there). */
const setup = (game: string, title: string, slots: RollSlot[], emoji: string, parts: string[]): ChatRoll => ({ v: 2, kind: "setup", game, title, slots, text: `${emoji} ${title}: ${parts.join(" · ")}` });
const failed = (game: string, title: string, message: string): ChatRoll => ({ v: 2, kind: "setup", game, title, slots: [], text: message });
const text = (name: string, color: string, label: string, detail?: string): RollSlot => ({ label, name, kind: "text", color, detail });

// ── Mario Kart ───────────────────────────────────────────────────────────────

/** A count from the args, else the default, within the game's limits. */
function raceCount(arg: string, fallback: number, max: number): number {
  const n = Number(words(arg).find((w) => /^\d+$/.test(w)));
  return Number.isInteger(n) && n >= 1 ? Math.min(n, max) : fallback;
}

function tracks(slug: string, title: string, cups: Cup[], arg: string, max: number): ChatRoll {
  const count = raceCount(arg, 4, max);
  const list = randomizeTrackList(cups, count, true, false);
  return setup(
    slug,
    `${title}, ${count} ${count === 1 ? "race" : "races"}`,
    list.map((t) => ({ label: `Race ${t.raceNumber}`, name: t.course.name, kind: "art" as const, img: t.course.img || undefined })),
    "🏁",
    list.map((t, i) => `${i + 1}. ${t.course.name}`),
  );
}

function rally(slug: string, rallies: KnockoutRally[], label: string): ChatRoll {
  const r = pick(rallies)!;
  return setup(slug, label, [{ label, name: r.name, kind: "art", img: r.img || undefined }], "🏁", [r.name]);
}

const MK8 = TWITCH_GAMES["mario-kart-8-deluxe"].data;
const MKW = TWITCH_GAMES["mario-kart-world"].data;
const MK64 = mk64Data as unknown as { cups: Cup[]; battleCourses: KnockoutRally[] };

// ── Smash ────────────────────────────────────────────────────────────────────

function smashRulesText(r: SmashRules): string {
  const how = r.kind === "time" ? `${r.minutes} minute time battle` : r.kind === "stamina" ? `stamina, ${r.stocks} ${r.stocks === 1 ? "stock" : "stocks"}` : `${r.stocks} ${r.stocks === 1 ? "stock" : "stocks"}, ${r.minutes} minutes`;
  return `${how}, items ${r.items}${r.finalSmashMeter ? ", Final Smash meter on" : ""}`;
}

const smashSetup: ChatSetup = {
  argHint: "party",
  roll: ({ arg }) => {
    const party = words(arg).includes("party");
    const pool = stagePool(ULTIMATE, { list: party ? "all" : "competitive", sometimes: false });
    const s = rollStage(pool, !party);
    const stage = ULTIMATE.stages.find((x) => x.id === s.stageId)!;
    const rules = party ? rollPartyRules() : COMPETITIVE_RULES;
    const form = s.form === "battlefield" ? "Battlefield form" : s.form === "omega" ? "Omega form" : null;
    const stageDetail = [form, party ? (s.hazards ? "hazards on" : "hazards off") : null].filter(Boolean).join(", ");
    const rulesLine = smashRulesText(rules);
    return setup(
      ULTIMATE.slug,
      party ? "Party battle" : "Match setup",
      [
        { label: "Stage", name: stage.name, kind: "art", img: ULTIMATE.artReady ? `${ULTIMATE.assetBase}${stage.img}` : undefined, detail: stageDetail || undefined },
        text(rulesLine.charAt(0).toUpperCase() + rulesLine.slice(1), "#3a3f4b", "Rules"),
      ],
      "🏟️",
      [`${stage.name}${stageDetail ? ` (${stageDetail})` : ""}`, rulesLine],
    );
  },
};

// ── Mario Party ──────────────────────────────────────────────────────────────

function partySetup(game: PartyGame): ChatSetup {
  return {
    roll: () => {
      const edition = game.editions?.[0]?.id ?? "switch1";
      const s = rollSetup(game, { edition, boardIds: game.boards.map((b) => b.id) });
      if (!s) return failed(game.slug, "Party setup", "🎲 Couldn't roll a board for this game.");
      const board = game.boards.find((b) => b.id === s.boardId)!;
      const ruleset = game.rulesets.find((r) => r.id === s.rulesetId)!;
      const bonus = game.bonusModes.find((b) => b.id === s.bonusModeId);
      const details = [`${s.turns} turns`, ruleset.label, bonus?.label ?? null].filter(Boolean) as string[];
      return setup(
        game.slug,
        "Party setup",
        [{ label: "Board", name: board.name, kind: board.img && game.artReady ? "art" : "text", img: board.img && game.artReady ? `${game.assetBase}${board.img}` : undefined, color: board.color, detail: details.join(" · ") }],
        "🎲",
        [board.name, ...details],
      );
    },
  };
}

// ── Hero shooters ────────────────────────────────────────────────────────────

const MODE_COLORS = ["#2f6fd6", "#c8413b", "#22936a", "#b5651d", "#6b5ccf", "#2a8fa3"];

function heroSetup(game: HeroGame): ChatSetup {
  const modes = mapModes(game);
  return {
    argHint: modes.map((m) => m.toLowerCase()).join(", ").replace(/, ([^,]*)$/, " or $1"),
    roll: ({ arg }) => {
      const w = words(arg)[0];
      const mode = w ? modes.find((m) => m.toLowerCase() === w || m.toLowerCase().startsWith(w)) : undefined;
      const map = rollMap(game, mode ? [mode] : []);
      if (!map) return failed(game.slug, "Next map", "🗺️ No maps to roll for this game.");
      return setup(
        game.slug,
        "Next map",
        [text(map.name, MODE_COLORS[modes.indexOf(map.mode) % MODE_COLORS.length], "Map", map.mode)],
        "🗺️",
        [`${map.name} (${map.mode})`],
      );
    },
  };
}

// ── Splatoon ─────────────────────────────────────────────────────────────────

const splatArt = (stage: string) => (SPLATOON3.artReady ? `${SPLATOON3.assetBase}${splatStageArt(stage)}` : undefined);

const splatoonSetup: ChatSetup = {
  argHint: "3, 5, turf, ranked or salmon",
  roll: ({ arg }) => {
    const w = words(arg);
    if (w.includes("salmon")) {
      const stage = rollSalmon(SPLATOON3);
      return setup(SPLATOON3.slug, "Salmon Run", [{ label: "Stage", name: stage, kind: "art", img: splatArt(stage) }], "🐟", [stage]);
    }
    const kinds = w.includes("turf") ? (["turf"] as const) : w.includes("ranked") ? (["ranked"] as const) : (["turf", "ranked"] as const);
    const count = w.includes("5") ? 5 : w.includes("3") ? 3 : 1;
    const battles = count === 1 ? [rollBattle(SPLATOON3, [...kinds])] : rollSet(SPLATOON3, [...kinds], count);
    const mode = (id: string) => SPLATOON3.modes.find((m) => m.id === id)?.name ?? id;
    return setup(
      SPLATOON3.slug,
      count === 1 ? "Next battle" : `A set of ${count}`,
      battles.map((b, i) => ({ label: count === 1 ? "Battle" : `Battle ${i + 1}`, name: b.stage, kind: "art" as const, img: splatArt(b.stage), detail: mode(b.modeId) })),
      "🦑",
      battles.map((b, i) => `${count === 1 ? "" : `${i + 1}. `}${mode(b.modeId)} on ${b.stage}`),
    );
  },
};

// ── Kirby ────────────────────────────────────────────────────────────────────

const kirbySetup: ChatSetup = {
  argHint: "top or city",
  roll: ({ arg }) => {
    const w = words(arg);
    if (w.includes("city") || w.includes("stadium")) {
      const name = rollStadium(AIR_RIDERS, ["battle", "race", "glide", "collect"]);
      return setup(AIR_RIDERS.slug, "City Trial Stadium", [text(name, "#f08bb4", "Stadium")], "🏟️", [name]);
    }
    const kind = w.includes("top") ? "top" : "air";
    const name = rollCourse(AIR_RIDERS, kind);
    const list = kind === "air" ? AIR_RIDERS.airRideCourses : AIR_RIDERS.topRideCourses;
    const course = list.find((c) => c.name === name);
    const label = kind === "air" ? "Air Ride" : "Top Ride";
    const img = course?.img && AIR_RIDERS.artReady ? `${AIR_RIDERS.assetBase}${course.img}` : undefined;
    return setup(AIR_RIDERS.slug, `${label} course`, [img ? { label, name, kind: "art", img } : text(name, "#f08bb4", label)], "⭐", [name]);
  },
};

// ── N64 shooters ─────────────────────────────────────────────────────────────

const goldeneyeSetup: ChatSetup = {
  roll: ({ players }) => {
    const m = rollGoldenEyeMatch({ players: Math.max(2, Math.min(4, players)), freshSave: false, noOddjob: true, allowTeams: true, handicaps: false, cheat: false });
    return setup(
      "goldeneye-007",
      "Match setup",
      [text(m.scenario.name, "#3a3f4b", "Scenario"), text(m.map.name, "#5a4632", "Map"), text(m.weaponSet.name, "#7a2e2e", "Weapons"), text(m.length.label, "#2f4f6f", "Length")],
      "🕶️",
      [`${m.scenario.name} on ${m.map.name}`, m.weaponSet.name, m.length.label],
    );
  },
};

const perfectDarkSetup: ChatSetup = {
  roll: ({ players }) => {
    const m = rollPdMatch({ players: Math.max(1, Math.min(4, players)), freshSave: false, allowTeams: true, sims: 0, simDifficulties: [], simSpecials: false, chaos: false, cast: "main" });
    return setup(
      "perfect-dark",
      "Match setup",
      [text(m.scenario.name, "#8a1c2b", "Scenario"), text(m.arena.name, "#3a3f4b", "Arena"), text(m.weaponSet.name, "#5a4632", "Weapons"), text(m.limit, "#2f4f6f", "Limit")],
      "🕶️",
      [`${m.scenario.name} in ${m.arena.name}`, m.weaponSet.name, m.limit],
    );
  },
};

// ── Pokémon Stadium ──────────────────────────────────────────────────────────

function stadiumSetup(slug: string): ChatSetup {
  const game = stadiumGame(slug);
  return {
    roll: () => {
      const cup = pick(game.cups)!;
      return setup(slug, "Next cup", [text(cup.name, "#c8447a", "Cup", cup.rule)], "🏆", [`${cup.name} (${cup.rule})`]);
    },
  };
}

// ── Registry ─────────────────────────────────────────────────────────────────

export const CHAT_SETUPS: Record<string, ChatSetup> = {
  "mario-kart-8-deluxe": { argHint: "a number of races (4 by default)", roll: ({ arg }) => tracks("mario-kart-8-deluxe", "Grand Prix", MK8.cups ?? [], arg, 16) },
  "mario-kart-world": {
    argHint: "a number of races or rally",
    roll: ({ arg }) => (words(arg).some((w) => w.startsWith("rally") || w === "knockout") && MKW.knockoutRallies?.length
      ? rally("mario-kart-world", MKW.knockoutRallies, "Knockout Tour")
      : tracks("mario-kart-world", "Grand Prix", MKW.cups ?? [], arg, 16)),
  },
  "mario-kart-64": {
    argHint: "a number of races or battle",
    roll: ({ arg }) => (words(arg).includes("battle") ? rally("mario-kart-64", MK64.battleCourses, "Battle course") : tracks("mario-kart-64", "Grand Prix", MK64.cups, arg, 16)),
  },
  [ULTIMATE.slug]: smashSetup,
  ...Object.fromEntries(Object.values(PARTY_GAMES).map((g) => [g.slug, partySetup(g)])),
  [OVERWATCH.slug]: heroSetup(OVERWATCH),
  [MARVEL_RIVALS.slug]: heroSetup(MARVEL_RIVALS),
  [SPLATOON3.slug]: splatoonSetup,
  [AIR_RIDERS.slug]: kirbySetup,
  "goldeneye-007": goldeneyeSetup,
  "perfect-dark": perfectDarkSetup,
  "pokemon-stadium": stadiumSetup("pokemon-stadium"),
  "pokemon-stadium-2": stadiumSetup("pokemon-stadium-2"),
};
