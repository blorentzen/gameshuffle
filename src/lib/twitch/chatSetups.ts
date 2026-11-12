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
import mkwiiData from "@/data/mkwii-data.json";
import { randomizeTrackList } from "@/lib/randomizer";
import { TWITCH_GAMES } from "@/lib/twitch/games";
import type { Cup, KnockoutRally } from "@/data/types";
import type { ChatRoll, RollSlot } from "@/lib/twitch/chatRoll";
import { pick } from "@/lib/party/roll";
import { ULTIMATE } from "@/data/smash/ultimate";
import { MELEE } from "@/data/smash/melee";
import { COMPETITIVE_RULES, competitiveRules, rollPartyRules, rollStage, stagePool, type SmashRules } from "@/lib/smash/roll";
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
import { CROSSWORLDS_GAME } from "@/data/sonic/crossworlds";
import { rollGrandPrix as rollSonicGrandPrix, rollRaces as rollSonicRaces } from "@/lib/sonic/roll";
import { rollMatch as rollGoldenEyeMatch } from "@/lib/goldeneye/roll";
import { rollMatch as rollPdMatch } from "@/lib/perfectdark/roll";
import { stadiumGame } from "@/lib/pokemon/stadium";
import { WONDER } from "@/data/wonder/wonder";
import { DOUBLE_DASH } from "@/data/double-dash/double-dash";
import { battleArt as ddBattleArt, courseArt as ddCourseArt, rollAllCupTour as ddTour, rollBattles as ddBattles, rollCup as ddCup, rollEngine as ddEngine, rollRaces as ddRaces } from "@/lib/double-dash/roll";
import type { DdCourse } from "@/lib/double-dash/types";
import { MARIO_KART_DS } from "@/data/mario-kart-ds/mario-kart-ds";
import { battleArt as dsBattleArt, characterArt as dsCharacterArt, characterColor as dsCharacterColor, courseArt as dsCourseArt, missionArt as dsMissionArt, missionPlace as dsMissionPlace, missionTitle as dsMissionTitle, rollBattles as dsBattles, rollCup as dsCup, rollEngine as dsEngine, rollMissions as dsMissions, rollRaces as dsRaces } from "@/lib/mario-kart-ds/roll";
import type { DsCourse } from "@/lib/mario-kart-ds/types";
import { MARIO_KART_7 } from "@/data/mario-kart-7/mario-kart-7";
import { battleArt as mk7BattleArt, courseArt as mk7CourseArt, courseNote as mk7CourseNote, rollBattles as mk7Battles, rollCup as mk7Cup, rollEngine as mk7Engine, rollRaces as mk7Races } from "@/lib/mario-kart-7/roll";
import type { Mk7Course } from "@/lib/mario-kart-7/types";
import { SUPER_MARIO_KART } from "@/data/super-mario-kart/super-mario-kart";
import { battleArt as smkBattleArt, courseArt as smkCourseArt, rollBattleCourses as smkBattles, rollCup as smkCup, rollEngine as smkEngine, rollRaces as smkRaces } from "@/lib/super-mario-kart/roll";
import type { SmkCourse } from "@/lib/super-mario-kart/types";
import { LASTS_LABEL, badgePool, levelPool, rollLevels, rollRules, ruleDetail, ruleOf, rulePool, worldLabel, worldOf, worldsFor } from "@/lib/wonder/roll";

export interface SetupContext {
  /** Whatever followed the command ("8", "party", "push", "top"). */
  arg: string;
  /** Players in the lobby (some setups depend on it: GoldenEye maps). */
  players: number;
}

export interface ChatSetup {
  /** What can follow `!gs setup`, for help text. */
  argHint?: string;
  /** Named versions the stream page offers, each the words chat would type
   *  after `!gs setup`. The first is the default. */
  choices?: { label: string; arg: string }[];
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
const MKWII = mkwiiData as unknown as { cups: Cup[]; battleCourses: KnockoutRally[] };

/** Mario Kart Wii: races (4 by default, 12 for a war), one cup's four tracks in order, or a battle arena. */
function mkwiiCup(): ChatRoll {
  const cup = pick(MKWII.cups)!;
  const title = `${cup.name} Cup`;
  return setup(
    "mario-kart-wii",
    title,
    cup.courses.map((c, i) => ({ label: `Race ${i + 1}`, name: c.name, kind: "art" as const, img: c.img || undefined })),
    "🏆",
    cup.courses.map((c, i) => `${i + 1}. ${c.name}`),
  );
}

/**
 * Mario Kart: Double Dash!! (Retro Mario Kart picks 2026-11-12): a cup in its order with the engine class (the
 * default), the All Cup Tour (`tour`: Luigi Circuit first, Rainbow Road last), races from every cup (a number), or a
 * battle course and mode (`battle`).
 */
function ddRaceList(title: string, courses: DdCourse[]): ChatRoll {
  return setup(
    DOUBLE_DASH.slug,
    title,
    courses.map((c, i) => ({ label: `Race ${i + 1}`, name: c.name, kind: "art" as const, img: ddCourseArt(DOUBLE_DASH, c.name) ?? undefined, ...(c.laps !== 3 ? { detail: `${c.laps} laps` } : {}) })),
    "🏆",
    courses.map((c, i) => `${i + 1}. ${c.name}`),
  );
}
const doubleDashSetup: ChatSetup = {
  argHint: "cup, tour, a number of races or battle",
  choices: [{ label: "A cup", arg: "" }, { label: "All Cup Tour", arg: "tour" }, { label: "8 races", arg: "8" }, { label: "Battle", arg: "battle" }],
  roll: ({ arg }) => {
    const w = words(arg);
    if (w.includes("battle")) {
      const [b] = ddBattles(DOUBLE_DASH, 1);
      return setup(DOUBLE_DASH.slug, b.mode, [{ label: "Battle course", name: b.course, kind: "art", img: ddBattleArt(DOUBLE_DASH, b.course) ?? undefined, detail: b.mode }], "🎈", [b.course]);
    }
    const engine = ddEngine(DOUBLE_DASH);
    if (w.includes("tour") || w.includes("all")) return ddRaceList(`All Cup Tour, ${engine}`, ddTour(DOUBLE_DASH));
    if (w.some((x) => /^\d+$/.test(x))) {
      const n = raceCount(arg, 4, 16);
      return ddRaceList(`${n} ${n === 1 ? "race" : "races"}, ${engine}`, ddRaces(DOUBLE_DASH, n));
    }
    const cup = ddCup(DOUBLE_DASH);
    return ddRaceList(`${cup.name}, ${engine}`, cup.courses);
  },
};

/**
 * Mario Kart DS (Retro Mario Kart picks 2026-11-12): a cup in its order with the engine class (the default; `nitro`
 * or `retro` for one kind of cup), races from every cup (a number, 4 to 32), a battle course and mode (`battle`), or
 * a Mission Mode mission from Levels 1 to 6 (`mission`), with the course and character the game gives.
 */
function dsRaceList(title: string, courses: DsCourse[]): ChatRoll {
  return setup(
    MARIO_KART_DS.slug,
    title,
    courses.map((c, i) => ({ label: `Race ${i + 1}`, name: c.name, kind: "art" as const, img: dsCourseArt(MARIO_KART_DS, c.name) ?? undefined, ...(c.laps !== 3 ? { detail: `${c.laps} laps` } : {}) })),
    "🏆",
    courses.map((c, i) => `${i + 1}. ${c.name}`),
  );
}
const marioKartDsSetup: ChatSetup = {
  argHint: "cup, nitro, retro, a number of races, battle or mission",
  choices: [{ label: "A cup", arg: "" }, { label: "8 races", arg: "8" }, { label: "Battle", arg: "battle" }, { label: "A mission", arg: "mission" }],
  roll: ({ arg }) => {
    const w = words(arg);
    if (w.includes("battle")) {
      const [b] = dsBattles(MARIO_KART_DS, 1);
      return setup(MARIO_KART_DS.slug, b.mode, [{ label: "Battle course", name: b.course, kind: "art", img: dsBattleArt(MARIO_KART_DS, b.course) ?? undefined, detail: b.mode }], "🎈", [b.course]);
    }
    if (w.includes("mission") || w.includes("missions")) {
      const [m] = dsMissions(MARIO_KART_DS, 1);
      const title = dsMissionTitle(m);
      return setup(MARIO_KART_DS.slug, title, [
        { label: m.boss ? "Boss" : "Mission", name: m.text, kind: "art", img: dsMissionArt(MARIO_KART_DS, m) ?? undefined, detail: dsMissionPlace(m) },
        { label: "Character", name: m.character, kind: "portrait", img: dsCharacterArt(MARIO_KART_DS, m.character) ?? undefined, color: dsCharacterColor(MARIO_KART_DS, m.character) ?? undefined },
      ], "🎯", [m.text, dsMissionPlace(m), `as ${m.character}`, m.time ? `${m.time} on the clock` : "a race to the finish"]);
    }
    const engine = dsEngine(MARIO_KART_DS);
    if (w.some((x) => /^\d+$/.test(x))) {
      const n = raceCount(arg, 4, 32);
      return dsRaceList(`${n} ${n === 1 ? "race" : "races"}, ${engine}`, dsRaces(MARIO_KART_DS, n));
    }
    const cup = dsCup(MARIO_KART_DS, w.includes("nitro") ? "nitro" : w.includes("retro") ? "retro" : "any");
    return dsRaceList(`${cup.name}, ${engine}`, cup.courses);
  },
};

/**
 * Mario Kart 7 (Retro Mario Kart picks 2026-11-12): a cup in its order with the engine class (the default; `new` or
 * `classic` for one kind of cup), races from every cup (a number, up to 32), or a battle course and mode (`battle`).
 */
function mk7RaceList(title: string, courses: Mk7Course[]): ChatRoll {
  return setup(
    MARIO_KART_7.slug,
    title,
    courses.map((c, i) => ({ label: `Race ${i + 1}`, name: c.name, kind: "art" as const, img: mk7CourseArt(MARIO_KART_7, c.name) ?? undefined, ...(mk7CourseNote(c) ? { detail: mk7CourseNote(c) } : {}) })),
    "🏆",
    courses.map((c, i) => `${i + 1}. ${c.name}`),
  );
}
const mario7Setup: ChatSetup = {
  argHint: "cup, new, classic, a number of races or battle",
  choices: [{ label: "A cup", arg: "" }, { label: "8 races", arg: "8" }, { label: "Battle", arg: "battle" }],
  roll: ({ arg }) => {
    const w = words(arg);
    if (w.includes("battle")) {
      const [b] = mk7Battles(MARIO_KART_7, 1);
      return setup(MARIO_KART_7.slug, b.mode, [{ label: "Battle course", name: b.course, kind: "art", img: mk7BattleArt(MARIO_KART_7, b.course) ?? undefined, detail: b.mode }], "🎈", [b.course]);
    }
    const engine = mk7Engine(MARIO_KART_7);
    if (w.some((x) => /^\d+$/.test(x))) {
      const n = raceCount(arg, 4, 32);
      return mk7RaceList(`${n} ${n === 1 ? "race" : "races"}, ${engine}`, mk7Races(MARIO_KART_7, n));
    }
    const cup = mk7Cup(MARIO_KART_7, w.includes("new") ? "new" : w.includes("classic") || w.includes("retro") ? "classic" : "any");
    return mk7RaceList(`${cup.name}, ${engine}`, cup.courses);
  },
};

/**
 * Super Mario Kart (Retro Mario Kart picks 2026-11-12): a cup's five courses in order with the engine class (the
 * default), races from every cup (a number, up to 20), or a battle course (`battle`, Balloon Battle).
 */
function smkRaceList(title: string, courses: SmkCourse[]): ChatRoll {
  return setup(
    SUPER_MARIO_KART.slug,
    title,
    courses.map((c, i) => ({ label: `Race ${i + 1}`, name: c.name, kind: "art" as const, img: smkCourseArt(SUPER_MARIO_KART, c.name) ?? undefined })),
    "🏆",
    courses.map((c, i) => `${i + 1}. ${c.name}`),
  );
}
const superMarioKartSetup: ChatSetup = {
  argHint: "cup, a number of races or battle",
  choices: [{ label: "A cup", arg: "" }, { label: "10 races", arg: "10" }, { label: "Battle course", arg: "battle" }],
  roll: ({ arg }) => {
    const w = words(arg);
    if (w.includes("battle")) {
      const [b] = smkBattles(SUPER_MARIO_KART, 1);
      return setup(SUPER_MARIO_KART.slug, "Battle Mode", [{ label: "Battle course", name: b.name, kind: "art", img: smkBattleArt(SUPER_MARIO_KART, b.name) ?? undefined, detail: "Balloon Battle" }], "🎈", [b.name]);
    }
    const engine = smkEngine(SUPER_MARIO_KART);
    if (w.some((x) => /^\d+$/.test(x))) {
      const n = raceCount(arg, 5, 20);
      return smkRaceList(`${n} ${n === 1 ? "race" : "races"}, ${engine}`, smkRaces(SUPER_MARIO_KART, n));
    }
    const cup = smkCup(SUPER_MARIO_KART);
    return smkRaceList(`${cup.name}, ${engine}`, cup.courses);
  },
};

// ── Smash ────────────────────────────────────────────────────────────────────

function smashRulesText(r: SmashRules): string {
  const how = r.kind === "time" ? `${r.minutes} minute time battle` : r.kind === "stamina" ? `stamina, ${r.stocks} ${r.stocks === 1 ? "stock" : "stocks"}` : `${r.stocks} ${r.stocks === 1 ? "stock" : "stocks"}, ${r.minutes} minutes`;
  return `${how}, items ${r.items}${r.finalSmashMeter ? ", Final Smash meter on" : ""}`;
}

const smashSetup: ChatSetup = {
  argHint: "party",
  choices: [{ label: "Competitive", arg: "" }, { label: "Party rules", arg: "party" }],
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

/**
 * Melee (space picks 2026-11-11): a stage from the legal list with the competitive rules (4 stocks, 8 minutes, items
 * off), the five starters game 1 is struck from (`starters`), or any of the 29 with party rules (`party`). Melee
 * stages have no forms or hazard switch.
 */
const meleeArt = (img: string) => (MELEE.artReady ? `${MELEE.assetBase}${img}` : undefined);
const meleeSetup: ChatSetup = {
  argHint: "starters or party",
  choices: [{ label: "Legal stage", arg: "" }, { label: "Starters to strike", arg: "starters" }, { label: "Party battle", arg: "party" }],
  roll: ({ arg }) => {
    const w = words(arg);
    if (w.some((x) => x.startsWith("starter") || x.startsWith("strike"))) {
      const starters = MELEE.stages.filter((x) => x.status === "starter");
      const counter = MELEE.stages.filter((x) => x.status === "counterpick").map((x) => x.name);
      const counterLine = `${counter.join(" and ")} ${counter.length === 1 ? "is the counterpick" : "are counterpicks"}`;
      return setup(
        MELEE.slug,
        "Stage strikes, game 1",
        [...starters.map((x): RollSlot => ({ label: "Starter", name: x.name, kind: "art", img: meleeArt(x.img) })), text(counterLine, "#3a3f4b", "Counterpick")],
        "🏟️",
        [...starters.map((x) => x.name), counterLine],
      );
    }
    const party = w.includes("party");
    const s = rollStage(stagePool(MELEE, { list: party ? "all" : "competitive", sometimes: false }), !party, Math.random, false);
    const stage = MELEE.stages.find((x) => x.id === s.stageId)!;
    const rulesLine = smashRulesText(party ? rollPartyRules(Math.random, MELEE) : competitiveRules(MELEE));
    return setup(
      MELEE.slug,
      party ? "Party battle" : "Match setup",
      [
        { label: "Stage", name: stage.name, kind: "art", img: meleeArt(stage.img) },
        text(rulesLine.charAt(0).toUpperCase() + rulesLine.slice(1), "#3a3f4b", "Rules"),
      ],
      "🏟️",
      [stage.name, rulesLine],
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
      // One tile each (board art, then turns, rules and Bonus Stars as name tiles), so nothing wraps under a narrow tile.
      return setup(
        game.slug,
        "Party setup",
        [
          { label: "Board", name: board.name, kind: board.img && game.artReady ? "art" : "text", img: board.img && game.artReady ? `${game.assetBase}${board.img}` : undefined, color: board.color },
          text(`${s.turns} turns`, "#2f4f6f", "Turns"),
          text(ruleset.label, "#5a3f8a", "Rules"),
          ...(bonus ? [text(bonus.label, "#8a6a1c", "Bonus Stars")] : []),
        ],
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
    choices: [{ label: "Any mode", arg: "" }, ...modes.map((m) => ({ label: m, arg: m.toLowerCase() }))],
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
  choices: [{ label: "One battle", arg: "" }, { label: "A set of 3", arg: "3" }, { label: "A set of 5", arg: "5" }, { label: "Salmon Run", arg: "salmon" }],
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
  choices: [{ label: "Air Ride course", arg: "" }, { label: "Top Ride course", arg: "top" }, { label: "City Trial stadium", arg: "city" }],
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

// ── Sonic Racing: CrossWorlds ─────────────────────────────────────────────────

/** Races with the CrossWorld for lap 2 (4 by default, a number up to 12), or `gp` for a Grand Prix. Base tracks only:
 *  chat can't know who owns which pack. */
const sonicSetup: ChatSetup = {
  argHint: "a number of races or gp",
  choices: [{ label: "4 races", arg: "" }, { label: "8 races", arg: "8" }, { label: "Grand Prix", arg: "gp" }],
  roll: ({ arg }) => {
    const g = CROSSWORLDS_GAME;
    const w = words(arg);
    if (w.some((x) => x === "gp" || x.startsWith("grand"))) {
      const cup = rollSonicGrandPrix(g);
      return setup(g.slug, cup.name, [...cup.tracks.map((t, i) => text(t, "#173a8a", `Race ${i + 1}`)), text("A lap of each", "#0b2a6f", "Final race")], "🏁",
        [...cup.tracks.map((t, i) => `${i + 1}. ${t}`), "4. A lap of each"]);
    }
    const count = raceCount(arg, 4, 12);
    const races = rollSonicRaces(g, { count });
    return setup(g.slug, `${count} ${count === 1 ? "race" : "races"}`,
      races.map((r, i) => text(r.track, "#173a8a", `Race ${i + 1}`, r.crossWorld ? `CrossWorld: ${r.crossWorld}` : undefined)), "🏁",
      races.map((r, i) => `${i + 1}. ${r.track}${r.crossWorld ? ` (${r.crossWorld})` : ""}`));
  },
};

// ── Super Mario Bros. Wonder ─────────────────────────────────────────────────

/** A world named in the args by any of its words ("desert", "magma", "petal"), or null. */
function wonderWorldIn(w: string[]) {
  return worldsFor(WONDER, false).find((x) => x.name.toLowerCase().split(/[^a-z]+/).some((part) => part.length > 3 && part !== "world" && w.includes(part))) ?? null;
}

/**
 * Super Mario Bros. Wonder (game space picks 2026-11-11): the next level (a world's name keeps it to that world, a number
 * rolls that many up to 8), `world` for a world, or `rule` for a challenge rule. Courses, palaces, battleships and
 * Bowser, from the original game (chat can't know which version a streamer plays).
 */
const wonderSetup: ChatSetup = {
  argHint: "a world, a number of levels, world or rule",
  choices: [{ label: "A level", arg: "" }, { label: "Three levels", arg: "3" }, { label: "A world", arg: "world" }, { label: "A challenge rule", arg: "rule" }],
  roll: ({ arg }) => {
    const w = words(arg);
    if (w.some((x) => x === "rule" || x === "rules" || x === "challenge")) {
      const [r] = rollRules(rulePool(WONDER), 1, badgePool(WONDER));
      const rule = r && ruleOf(WONDER, r);
      if (!rule) return failed(WONDER.slug, "Challenge rule", "No rule to roll.");
      return setup(WONDER.slug, "Challenge rule", [text(rule.title, "#5b3fc4", "Rule", LASTS_LABEL[rule.lasts])], "📜",
        [`${rule.title}. ${ruleDetail(rule, r)} (${LASTS_LABEL[rule.lasts]})`]);
    }
    const world = wonderWorldIn(w);
    if (w.includes("world") && !world) {
      const pickWorld = pick(worldsFor(WONDER, false))!;
      return setup(WONDER.slug, "Next world", [text(worldLabel(pickWorld), pickWorld.color, "World")], "🗺️", [worldLabel(pickWorld)]);
    }
    const count = raceCount(arg, 1, 8);
    const list = rollLevels(levelPool(WONDER, { world: world?.id ?? null }), count);
    if (!list.length) return failed(WONDER.slug, "Level to play", "No level to roll.");
    const title = `${count === 1 ? "Level to play" : `${count} levels to play`}${world ? ` in ${world.name}` : ""}`;
    return setup(WONDER.slug, title,
      list.map((l, i) => text(l.name, worldOf(WONDER, l.world).color, count === 1 ? "Level" : `Level ${i + 1}`, worldOf(WONDER, l.world).name)), "🌼",
      list.map((l, i) => `${count === 1 ? "" : `${i + 1}. `}${l.name} (${worldOf(WONDER, l.world).name})`));
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
  "mario-kart-8-deluxe": { argHint: "a number of races (4 by default)", choices: [{ label: "4 races", arg: "" }, { label: "8 races", arg: "8" }, { label: "16 races", arg: "16" }], roll: ({ arg }) => tracks("mario-kart-8-deluxe", "Grand Prix", MK8.cups ?? [], arg, 16) },
  "mario-kart-world": {
    argHint: "a number of races or rally",
    choices: [{ label: "4 races", arg: "" }, { label: "8 races", arg: "8" }, { label: "Knockout rally", arg: "rally" }],
    roll: ({ arg }) => (words(arg).some((w) => w.startsWith("rally") || w === "knockout") && MKW.knockoutRallies?.length
      ? rally("mario-kart-world", MKW.knockoutRallies, "Knockout Tour")
      : tracks("mario-kart-world", "Grand Prix", MKW.cups ?? [], arg, 16)),
  },
  "mario-kart-64": {
    argHint: "a number of races or battle",
    choices: [{ label: "4 races", arg: "" }, { label: "8 races", arg: "8" }, { label: "Battle course", arg: "battle" }],
    roll: ({ arg }) => (words(arg).includes("battle") ? rally("mario-kart-64", MK64.battleCourses, "Battle course") : tracks("mario-kart-64", "Grand Prix", MK64.cups, arg, 16)),
  },
  "mario-kart-wii": {
    argHint: "a number of races, cup or battle",
    choices: [{ label: "4 races", arg: "" }, { label: "12 races", arg: "12" }, { label: "A cup", arg: "cup" }, { label: "Battle arena", arg: "battle" }],
    roll: ({ arg }) => {
      const w = words(arg);
      if (w.includes("battle") || w.includes("arena")) return rally("mario-kart-wii", MKWII.battleCourses, "Battle arena");
      if (w.includes("cup")) return mkwiiCup();
      return tracks("mario-kart-wii", "Grand Prix", MKWII.cups, arg, 32);
    },
  },
  [DOUBLE_DASH.slug]: doubleDashSetup,
  [MARIO_KART_DS.slug]: marioKartDsSetup,
  [MARIO_KART_7.slug]: mario7Setup,
  [SUPER_MARIO_KART.slug]: superMarioKartSetup,
  [ULTIMATE.slug]: smashSetup,
  [MELEE.slug]: meleeSetup,
  ...Object.fromEntries(Object.values(PARTY_GAMES).map((g) => [g.slug, partySetup(g)])),
  [OVERWATCH.slug]: heroSetup(OVERWATCH),
  [MARVEL_RIVALS.slug]: heroSetup(MARVEL_RIVALS),
  [SPLATOON3.slug]: splatoonSetup,
  [AIR_RIDERS.slug]: kirbySetup,
  [CROSSWORLDS_GAME.slug]: sonicSetup,
  [WONDER.slug]: wonderSetup,
  "goldeneye-007": goldeneyeSetup,
  "perfect-dark": perfectDarkSetup,
  "pokemon-stadium": stadiumSetup("pokemon-stadium"),
  "pokemon-stadium-2": stadiumSetup("pokemon-stadium-2"),
};
