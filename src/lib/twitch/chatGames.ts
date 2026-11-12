/**
 * Chat rolls for every game: what `!gs-shuffle` (and the channel-points
 * reroll) gives a player in each game GameShuffle has a randomizer for. Each
 * game plugs in its own randomizer's roll, so chat gets what the site gives,
 * including the chatter's owned-DLC collection where the game has one.
 *
 * Keyed by randomizer slug, the same slug `twitch_game_categories` and
 * `chatGameCategories.ts` map a Twitch category to. Server-side: imports every
 * game's data. The stored shape and its readers are in `chatRoll.ts`.
 *
 * Decided 2026-10-06 (https://claude.ai/artifact/R81GbwwuV3uG7uJEKSYg28):
 * lobby sizes match each game's online room; hero shooters take an optional
 * role; only Mario Party keeps picks distinct across the lobby; Pokémon
 * Stadium rolls are the streamer's team only (no online play).
 */

import mk64Data from "@/data/mk64-data.json";
import mkwiiData from "@/data/mkwii-data.json";
import { vehicleNoteText } from "@/lib/randomizers/vehicleNote";
import { randomizeKartCombo } from "@/lib/randomizer";
import { applyToKartData, offSet, type GameCollection } from "@/lib/collection/core";
import { getImagePath } from "@/lib/images";
import { TWITCH_GAMES, type TwitchGameEntry } from "@/lib/twitch/games";
import { randomizerPublic } from "@/lib/games-visibility";
import type { GameData, KartCombo } from "@/data/types";
import type { ChatRoll, RollGlyph, RollSlot } from "@/lib/twitch/chatRoll";
import { pick } from "@/lib/party/roll";
import { ULTIMATE, fighterColor } from "@/data/smash/ultimate";
import { MELEE } from "@/data/smash/melee";
import { costumeArt, costumeLabel, drawFighters, fighterPool, stagePool } from "@/lib/smash/roll";
import { PARTY_GAMES } from "@/data/party";
import { drawCharacters } from "@/lib/party/roll";
import { characterArt, type PartyGame } from "@/lib/party/types";
import { OVERWATCH } from "@/data/heroes/overwatch";
import { MARVEL_RIVALS } from "@/data/heroes/marvel-rivals";
import { liveRoster } from "@/lib/heroes/live";
import { rollHeroes } from "@/lib/heroes/roll";
import type { HeroGame } from "@/lib/heroes/types";
import { heroArt } from "@/lib/heroes/art";
import { SPLATOON3 } from "@/data/splatoon/splatoon3";
import { drawWeapons, weaponPool } from "@/lib/splatoon/roll";
import { AIR_RIDERS } from "@/data/kirby/air-riders";
import { drawCombos, machinePool, riderPool } from "@/lib/kirby/roll";
import { CROSSWORLDS_GAME } from "@/data/sonic/crossworlds";
import { machinePool as sonicMachines, racerPool as sonicRacers, statColor as sonicColor, statLabel as sonicLabel } from "@/lib/sonic/roll";
import type { SonicStat } from "@/lib/sonic/types";
import { rollCharacters as rollGoldenEye } from "@/lib/goldeneye/roll";
import { rollCharacters as rollPerfectDark } from "@/lib/perfectdark/roll";
import { perfectDarkTile } from "@/data/game-art";
import { rollTeams, stadiumCup, stadiumGame } from "@/lib/pokemon/stadium";
import { CHAMPIONS_SEASON, randomTeam } from "@/lib/pokemon/champions";
import { WONDER } from "@/data/wonder/wonder";
import { DOUBLE_DASH } from "@/data/double-dash/double-dash";
import { characterArt as ddCharacterArt, characterColor as ddCharacterColor, kartArt as ddKartArt, pairClass, pairSpecials, rollPair, specialArt, specialLine } from "@/lib/double-dash/roll";
import type { DdClass } from "@/lib/double-dash/types";
import { MARIO_KART_DS } from "@/data/mario-kart-ds/mario-kart-ds";
import { DEFAULT_KART_LEVEL, characterArt as dsCharacterArt, characterColor as dsCharacterColor, kartArt as dsKartArt, kartNote as dsKartNote, rollRacer as dsRollRacer } from "@/lib/mario-kart-ds/roll";
import type { DsClass, DsKartLevel } from "@/lib/mario-kart-ds/types";
import { MARIO_KART_7 } from "@/data/mario-kart-7/mario-kart-7";
import { DEFAULT_PARTS as MK7_DEFAULT_PARTS, MK7_CLASSES, bodyArt as mk7BodyArt, characterArt as mk7CharacterArt, characterColor as mk7CharacterColor, gliderArt as mk7GliderArt, rollCombo as mk7RollCombo, tiresArt as mk7TiresArt } from "@/lib/mario-kart-7/roll";
import type { Mk7Class } from "@/lib/mario-kart-7/types";
import { SUPER_MARIO_KART } from "@/data/super-mario-kart/super-mario-kart";
import { characterArt as smkCharacterArt, characterColor as smkCharacterColor, classOf as smkClassOf, rollCharacter as smkRollCharacter } from "@/lib/super-mario-kart/roll";
import { BADGE_TYPE_COLOR, BADGE_TYPE_LABEL, badgePool, characterPool, drawPlayers } from "@/lib/wonder/roll";
import type { WonderBadgeType } from "@/lib/wonder/types";

export interface RollContext {
  /** The chatter's owned collection for this game (null = everything). */
  owned: GameCollection | null;
  /** Whatever followed the command ("tank", "prime"). */
  arg: string;
  /** Picks other lobby members hold right now (when `unique`), or picks already dealt in a viewer battle. */
  taken: string[];
}

export interface ChatGame {
  slug: string;
  title: string;
  /** Max simultaneous participants: the game's online room size. */
  lobbyCap: number;
  /** No two lobby members hold the same pick (the first part's name). */
  unique?: boolean;
  /** Only the streamer's pick is rolled (viewers can't play along). */
  streamerOnly?: boolean;
  /** What can follow `!gs-shuffle`, for help text ("tank, damage or support"). */
  argHint?: string;
  /** What the streamer's own roll is called on the stream page's button
   *  ("Roll my fighter"). Defaults to "pick". */
  noun?: string;
  /** Named versions of the roll the stream page offers (a role, a cup), each
   *  the same words chat would type after `!gs-shuffle`. */
  choices?: { label: string; arg: string }[];
  roll(ctx: RollContext): ChatRoll;
  /** Where a viewer battle is played, rolled once for everyone (a Smash stage). */
  battleSetting?(): string;
}

const done = (game: string, slots: RollSlot[], text: string): ChatRoll => ({ v: 2, game, slots, text });

// ── Mario Kart ───────────────────────────────────────────────────────────────

const KART_EMOJI = { character: "🧑", vehicle: "🏎️", wheels: "🛞", glider: "🪂" } as const;

/** Mario Kart 8 Deluxe / World. Keeps the old combo fields so older readers still work. */
function kartGame(entry: TwitchGameEntry): ChatGame {
  return {
    slug: entry.slug,
    title: entry.title,
    lobbyCap: entry.lobbyCap,
    noun: "combo",
    roll: ({ owned }) => {
      const combo: KartCombo = randomizeKartCombo(applyToKartData(entry.data, owned), [], [], []);
      const parts = [
        { key: "character", label: "Character", show: true },
        { key: "vehicle", label: "Vehicle", show: true },
        { key: "wheels", label: "Wheels", show: entry.hasWheels },
        { key: "glider", label: "Glider", show: entry.hasGlider },
      ] as const;
      const shown = parts.filter((p) => p.show && combo[p.key]?.name && combo[p.key].name !== "N/A");
      const slots = shown.map((p) => ({ label: p.label, name: combo[p.key].name, kind: "art" as const, img: combo[p.key].img || undefined }));
      const text = shown.map((p) => `${KART_EMOJI[p.key]} ${combo[p.key].name}`).join(" · ");
      return { ...combo, ...done(entry.slug, slots, text) };
    },
  };
}

const MK64_CHARACTERS = (mk64Data as { characters: { name: string; img: string }[] }).characters;

const mk64: ChatGame = {
  slug: "mario-kart-64",
  title: "Mario Kart 64",
  lobbyCap: 4,
  noun: "racer",
  roll: () => {
    const c = pick(MK64_CHARACTERS)!;
    return done("mario-kart-64", [{ label: "Racer", name: c.name, kind: "art", img: getImagePath(c.img) }], `🧑 ${c.name}`);
  },
};

const MKWII = mkwiiData as unknown as GameData;
/** What can follow `!gs-shuffle` in Mario Kart Wii: a size class and a kind of vehicle, in any order ("large bike"). */
const MKWII_SIZES: Record<string, string> = { small: "Small", medium: "Medium", large: "Large", light: "Small", heavy: "Large" };
const MKWII_KINDS: Record<string, string[]> = {
  kart: ["Kart"], karts: ["Kart"],
  bike: ["Outside-drift bike", "Inside-drift bike"], bikes: ["Outside-drift bike", "Inside-drift bike"],
  inside: ["Inside-drift bike"], outside: ["Outside-drift bike"],
};

/** Mario Kart Wii (built 2026-11-11): a character and a vehicle from that character's size class, as in the game. */
const mkwii: ChatGame = {
  slug: "mario-kart-wii",
  title: "Mario Kart Wii",
  lobbyCap: 12,
  noun: "combo",
  argHint: "small, medium or large, and kart, bike, inside or outside",
  choices: [{ label: "Any", arg: "" }, { label: "Karts", arg: "kart" }, { label: "Bikes", arg: "bike" }, { label: "Inside-drift bikes", arg: "inside" }],
  roll: ({ arg }) => {
    const words = arg.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const sizes = [...new Set(words.map((w) => MKWII_SIZES[w]).filter(Boolean))];
    const kinds = [...new Set(words.flatMap((w) => MKWII_KINDS[w] ?? []))];
    const combo = randomizeKartCombo(MKWII, sizes, kinds);
    const note = vehicleNoteText(combo.vehicle);
    const bike = combo.vehicle.type === "Bike";
    return done("mario-kart-wii", [
      { label: "Character", name: combo.character.name, kind: "art", img: getImagePath(combo.character.img) },
      { label: "Vehicle", name: combo.vehicle.name, kind: "art", img: getImagePath(combo.vehicle.img), ...(note ? { detail: note } : {}) },
    ], `🧑 ${combo.character.name} · ${bike ? "🏍️" : "🏎️"} ${combo.vehicle.name}${note ? ` (${note})` : ""}`);
  },
};

const DD_CLASS_WORDS: Record<string, DdClass> = { light: "Light", medium: "Medium", heavy: "Heavy" };

/**
 * Mario Kart: Double Dash!! (Retro Mario Kart picks 2026-11-12): who drives, who throws and a kart that fits the
 * heavier of the two, with the pair's special items. `!gs-shuffle heavy` keeps the kart to one class; `teams` keeps to
 * the game's own pairs (Mario and Luigi...).
 */
const doubleDash: ChatGame = {
  slug: DOUBLE_DASH.slug,
  title: DOUBLE_DASH.name,
  lobbyCap: 4,
  noun: "pair and kart",
  argHint: "light, medium or heavy, and teams",
  choices: [{ label: "Any", arg: "" }, { label: "Light kart", arg: "light" }, { label: "Medium kart", arg: "medium" }, { label: "Heavy kart", arg: "heavy" }],
  roll: ({ arg }) => {
    const ws = arg.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const classes = [...new Set(ws.map((w) => DD_CLASS_WORDS[w]).filter((c): c is DdClass => !!c))];
    const p = rollPair(DOUBLE_DASH, { classes, teams: ws.some((w) => w === "team" || w === "teams") });
    const cls = pairClass(DOUBLE_DASH, p)!;
    const specials = pairSpecials(DOUBLE_DASH, p);
    const line = specialLine(DOUBLE_DASH, p);
    const one = specials.length === 1 ? specials[0] : null;
    const oneArt = one ? specialArt(DOUBLE_DASH, one) : null;
    return done(DOUBLE_DASH.slug, [
      { label: "Drives", name: p.driver, kind: "portrait", img: ddCharacterArt(DOUBLE_DASH, p.driver) ?? undefined, color: ddCharacterColor(DOUBLE_DASH, p.driver) ?? undefined },
      { label: "Throws", name: p.thrower, kind: "portrait", img: ddCharacterArt(DOUBLE_DASH, p.thrower) ?? undefined, color: ddCharacterColor(DOUBLE_DASH, p.thrower) ?? undefined },
      { label: "Kart", name: p.kart, kind: "art", img: ddKartArt(DOUBLE_DASH, p.kart) ?? undefined, detail: `${cls} kart` },
      oneArt ? { label: "Special", name: line, kind: "art" as const, img: oneArt } : { label: "Special", name: line, kind: "text" as const, color: "#7b3fbf" },
    ], `🧑 Drives ${p.driver}, throws ${p.thrower} · 🏎️ ${p.kart} (${cls.toLowerCase()}) · Special: ${line}`);
  },
};

const DS_CLASS_WORDS: Record<string, DsClass> = { light: "Light", medium: "Medium", heavy: "Heavy" };
const DS_LEVEL_WORDS: Record<string, DsKartLevel> = {
  start: "start", starting: "start", new: "start", own: "own", borrowed: "borrowed", borrow: "borrowed", all: "all", any: "all", every: "all", mirror: "all",
};

/**
 * Mario Kart DS (Retro Mario Kart picks 2026-11-12): a character and a kart that character can take, with the kart
 * setting's default (each character's own karts). `!gs-shuffle start` keeps to the starting karts, `borrowed` adds the
 * four borrowed karts, `all` opens every kart; `light`, `medium` or `heavy` keeps to one weight class. Characters can
 * repeat across the lobby, as in the game.
 */
const marioKartDs: ChatGame = {
  slug: MARIO_KART_DS.slug,
  title: MARIO_KART_DS.name,
  lobbyCap: 8,
  noun: "racer and kart",
  argHint: "light, medium or heavy, and start, own, borrowed or all for the karts",
  choices: [{ label: "Own karts", arg: "" }, { label: "Starting karts", arg: "start" }, { label: "Every kart", arg: "all" }, { label: "Heavy", arg: "heavy" }],
  roll: ({ arg }) => {
    const ws = arg.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const classes = [...new Set(ws.map((w) => DS_CLASS_WORDS[w]).filter((c): c is DsClass => !!c))];
    const level = ws.map((w) => DS_LEVEL_WORDS[w]).find(Boolean) ?? DEFAULT_KART_LEVEL;
    const r = dsRollRacer(MARIO_KART_DS, { classes, level });
    const note = dsKartNote(MARIO_KART_DS, r);
    // "signature kart" in the line, but "Peach's signature kart" keeps her name's capital.
    const inLine = MARIO_KART_DS.karts.find((k) => k.name === r.kart)?.owner === r.character ? note.toLowerCase() : note;
    return done(MARIO_KART_DS.slug, [
      { label: "Character", name: r.character, kind: "portrait", img: dsCharacterArt(MARIO_KART_DS, r.character) ?? undefined, color: dsCharacterColor(MARIO_KART_DS, r.character) ?? undefined },
      { label: "Kart", name: r.kart, kind: "art", img: dsKartArt(MARIO_KART_DS, r.kart) ?? undefined, detail: note },
    ], `🧑 ${r.character} · 🏎️ ${r.kart} (${inLine})`);
  },
};

/**
 * Mario Kart 7 (Retro Mario Kart picks 2026-11-12): a character and a body, tires and glider from every part (the
 * kart setting's default). `!gs-shuffle start` keeps to the seven starting parts; a weight class word (feather,
 * light, medium, cruiser, heavy) keeps to that class. Characters can repeat across the lobby.
 */
const mario7: ChatGame = {
  slug: MARIO_KART_7.slug,
  title: MARIO_KART_7.name,
  lobbyCap: 8,
  noun: "combo",
  argHint: "start for the starting parts, and feather, light, medium, cruiser or heavy",
  choices: [{ label: "Every part", arg: "" }, { label: "Starting parts", arg: "start" }, { label: "Feather", arg: "feather" }, { label: "Heavy", arg: "heavy" }],
  roll: ({ arg }) => {
    const ws = arg.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const classes = MK7_CLASSES.filter((c) => ws.includes(c.toLowerCase())) as Mk7Class[];
    const parts = ws.includes("start") || ws.includes("starting") || ws.includes("new") ? "start" : MK7_DEFAULT_PARTS;
    const c = mk7RollCombo(MARIO_KART_7, { classes, parts });
    return done(MARIO_KART_7.slug, [
      { label: "Character", name: c.character, kind: "portrait", img: mk7CharacterArt(MARIO_KART_7, c.character) ?? undefined, color: mk7CharacterColor(MARIO_KART_7, c.character) ?? undefined },
      { label: "Body", name: c.body, kind: "art", img: mk7BodyArt(MARIO_KART_7, c.body) ?? undefined },
      { label: "Tires", name: c.tires, kind: "art", img: mk7TiresArt(MARIO_KART_7, c.tires) ?? undefined },
      { label: "Glider", name: c.glider, kind: "art", img: mk7GliderArt(MARIO_KART_7, c.glider) ?? undefined },
    ], `🧑 ${c.character} · 🏎️ ${c.body} · 🛞 ${c.tires} · 🪂 ${c.glider}`);
  },
};

/**
 * Super Mario Kart (Retro Mario Kart picks 2026-11-12): a racer with the manual's class. Two players at most, never
 * the same character (`unique`).
 */
const superMarioKart: ChatGame = {
  slug: SUPER_MARIO_KART.slug,
  title: SUPER_MARIO_KART.name,
  lobbyCap: 2,
  unique: true,
  noun: "racer",
  roll: ({ taken }) => {
    const name = smkRollCharacter(SUPER_MARIO_KART, [], taken);
    const cls = smkClassOf(SUPER_MARIO_KART, name);
    return done(SUPER_MARIO_KART.slug, [
      { label: "Racer", name, kind: "portrait", img: smkCharacterArt(SUPER_MARIO_KART, name) ?? undefined, color: smkCharacterColor(SUPER_MARIO_KART, name) ?? undefined, ...(cls ? { detail: cls.name } : {}) },
    ], `🧑 ${name}${cls ? ` (${cls.name})` : ""}`);
  },
};

// ── Smash ────────────────────────────────────────────────────────────────────

const smash: ChatGame = {
  slug: ULTIMATE.slug,
  title: "Super Smash Bros. Ultimate",
  lobbyCap: 8,
  noun: "fighter",
  // `taken` is only filled for a viewer battle (everyone different); a single roll can repeat, like the game.
  roll: ({ owned, taken }) => {
    const pool = fighterPool(ULTIMATE, { echoes: "separate", miis: false, exclude: [...offSet(owned, "fighters")] });
    const [r] = drawFighters(pool, 1, { used: taken });
    const f = ULTIMATE.fighters.find((x) => x.name === r.name)!;
    return done(
      ULTIMATE.slug,
      [{ label: "Fighter", name: f.name, kind: "portrait", img: ULTIMATE.artReady ? `${ULTIMATE.assetBase}${f.img}` : undefined, color: fighterColor(f.series), detail: `Costume ${r.costume}` }],
      `🥊 ${f.name} (costume ${r.costume})`,
    );
  },
  // A stage from the competitive list (starters and counterpicks), as most events play.
  battleSetting: () => pick(stagePool(ULTIMATE, { list: "competitive", sometimes: false }))!.name,
};

/** Super Smash Bros. Melee (space picks 2026-11-11): a fighter in one of their costumes, Sheik on her own, a legal
 *  stage for a viewer battle. Four to a room, like the game. */
const melee: ChatGame = {
  slug: MELEE.slug,
  title: "Super Smash Bros. Melee",
  lobbyCap: 4,
  noun: "fighter",
  roll: ({ taken }) => {
    const [r] = drawFighters(fighterPool(MELEE, { echoes: "separate", miis: false }), 1, { used: taken });
    const f = MELEE.fighters.find((x) => x.name === r.name)!;
    const color = f.costumes?.[r.costume - 1];
    return done(
      MELEE.slug,
      [{ label: "Fighter", name: f.name, kind: "portrait", img: costumeArt(MELEE, f, r.costume) || undefined, color: fighterColor(f.series), detail: costumeLabel(f, r.costume) }],
      `🥊 ${f.name} (costume ${r.costume}${color ? `, ${color.toLowerCase()}` : ""})`,
    );
  },
  battleSetting: () => pick(stagePool(MELEE, { list: "competitive", sometimes: false }))!.name,
};

// ── Mario Party ──────────────────────────────────────────────────────────────

/** A character nobody else in the lobby has, like a room in the game itself. */
function partyGame(game: PartyGame, title: string): ChatGame {
  return {
    slug: game.slug,
    title,
    lobbyCap: 4,
    unique: true,
    noun: "character",
    roll: ({ owned, taken }) => {
      const [name] = drawCharacters(game, 1, { unlockables: true, exclude: [...offSet(owned, "characters"), ...taken] });
      const c = game.characters.find((x) => x.name === name)!;
      return done(game.slug, [{ label: "Character", name: c.name, kind: "portrait", img: characterArt(game, c), color: c.color }], `🎉 ${c.name}`);
    },
  };
}

// ── Hero shooters ────────────────────────────────────────────────────────────

const ROLE_EMOJI: Record<RollGlyph, string> = { shield: "🛡️", sword: "⚔️", heart: "💚", star: "⭐" };

/** Words chat might use for each role, by the role's icon (tank/damage/support in both games). */
const ROLE_WORDS: Record<string, string[]> = {
  shield: ["tank", "vanguard", "vang"],
  sword: ["damage", "dps", "dmg", "duelist", "duel"],
  heart: ["support", "supp", "sup", "heal", "healer", "strategist", "strat"],
};

function heroGame(base: HeroGame, title: string, lobbyCap: number): ChatGame {
  return {
    slug: base.slug,
    title,
    lobbyCap,
    argHint: base.roles.map((r) => r.label.toLowerCase()).join(", ").replace(/, ([^,]*)$/, " or $1"),
    noun: "hero",
    choices: [{ label: "Any role", arg: "" }, ...base.roles.map((r) => ({ label: r.label, arg: r.id }))],
    roll: ({ arg }) => {
      const game = liveRoster(base);
      const word = arg.trim().toLowerCase().split(/\s+/)[0] ?? "";
      const asked = word ? game.roles.find((r) => r.id === word || r.label.toLowerCase() === word || ROLE_WORDS[r.icon]?.includes(word)) : undefined;
      const [hero] = rollHeroes(game, 1, { roles: asked ? [asked.id] : [], roleQueue: false });
      const role = game.roles.find((r) => r.id === hero.role);
      const glyph = (role?.icon ?? "star") as RollGlyph;
      const roleLabel = role?.label ?? "Any role";
      return done(
        base.slug,
        [base.artReady
          ? { label: "Hero", name: hero.name, kind: "portrait", img: heroArt(base.slug, hero.name), color: role?.color ?? "#6b5ccf", detail: roleLabel }
          : { label: "Hero", name: hero.name, kind: "glyph", glyph, color: role?.color ?? "#6b5ccf", detail: roleLabel }],
        `${ROLE_EMOJI[glyph]} ${hero.name} (${roleLabel})`,
      );
    },
  };
}

// ── Splatoon ─────────────────────────────────────────────────────────────────

const splatoon: ChatGame = {
  slug: SPLATOON3.slug,
  title: "Splatoon 3",
  lobbyCap: 8,
  noun: "weapon kit",
  roll: () => {
    const [w] = drawWeapons(weaponPool(SPLATOON3), 1);
    const color = SPLATOON3.classes.find((c) => c.id === w.cls)?.color;
    return done(
      SPLATOON3.slug,
      [{ label: "Weapon", name: w.name, kind: "art", img: SPLATOON3.artReady ? `${SPLATOON3.assetBase}${w.img}` : undefined, color, detail: `${w.sub} · ${w.special}` }],
      `🦑 ${w.name} (${w.sub}, ${w.special})`,
    );
  },
};

// ── Kirby ────────────────────────────────────────────────────────────────────

const kirby: ChatGame = {
  slug: AIR_RIDERS.slug,
  title: "Kirby Air Riders",
  lobbyCap: 16,
  noun: "rider and machine",
  roll: () => {
    const [r] = drawCombos(riderPool(AIR_RIDERS), machinePool(AIR_RIDERS), 1);
    const rider = AIR_RIDERS.riders.find((x) => x.name === r.rider)!;
    const machine = AIR_RIDERS.machines.find((x) => x.name === r.machine)!;
    const art = (p: string) => (AIR_RIDERS.artReady ? `${AIR_RIDERS.assetBase}${p}` : undefined);
    return done(
      AIR_RIDERS.slug,
      [
        { label: "Rider", name: rider.name, kind: "portrait", img: art(rider.img), color: "#f08bb4" },
        { label: "Machine", name: machine.name, kind: "portrait", img: art(machine.img), color: AIR_RIDERS.machineTypes.find((t) => t.id === machine.type)?.color },
      ],
      `⭐ ${rider.name} on the ${machine.name}`,
    );
  },
};

// ── Sonic Racing: CrossWorlds ─────────────────────────────────────────────────

const SONIC_TYPES: SonicStat[] = ["speed", "acceleration", "handling", "power", "boost"];

/** A racer and machine (names only, no art yet). Free racers and machines only: chat can't know who owns which pack.
 *  `!gs-shuffle speed` keeps the racer to one type. The site's randomizer adds the Gadget Plate. */
const sonic: ChatGame = {
  slug: CROSSWORLDS_GAME.slug,
  title: "Sonic Racing: CrossWorlds",
  lobbyCap: 12,
  argHint: "speed, acceleration, handling, power or boost",
  noun: "racer and machine",
  roll: ({ arg }) => {
    const word = arg.trim().toLowerCase().split(/\s+/)[0] ?? "";
    const type = SONIC_TYPES.find((t) => word && t.startsWith(word));
    const g = CROSSWORLDS_GAME;
    const racer = pick(sonicRacers(g, { racerTypes: type ? [type] : [] }))!;
    const machine = pick(sonicMachines(g))!;
    return done(
      g.slug,
      [
        { label: "Racer", name: racer.name, kind: "text", color: sonicColor(g, racer.type), detail: `${sonicLabel(g, racer.type)} type` },
        { label: "Machine", name: machine.name, kind: "text", color: sonicColor(g, machine.type), detail: `${sonicLabel(g, machine.type)} type` },
      ],
      `💨 ${racer.name} on the ${machine.name}`,
    );
  },
};

// ── N64 shooters ─────────────────────────────────────────────────────────────

const goldeneye: ChatGame = {
  slug: "goldeneye-007",
  title: "GoldenEye 007",
  lobbyCap: 4,
  noun: "character",
  roll: () => {
    // Names only: no Bond art (trademark), same as the randomizer.
    const [name] = rollGoldenEye(1, { freshSave: false, noOddjob: true, cast: "main" });
    return done("goldeneye-007", [{ label: "Character", name, kind: "text", color: "#3a3f4b" }], `🕶️ ${name}`);
  },
};

const perfectDark: ChatGame = {
  slug: "perfect-dark",
  title: "Perfect Dark",
  lobbyCap: 4,
  noun: "character",
  roll: () => {
    const [name] = rollPerfectDark(1, { freshSave: false, cast: "main" });
    return done("perfect-dark", [{ label: "Character", name, kind: "icon", img: perfectDarkTile(name), color: "#8a1c2b" }], `🕶️ ${name}`);
  },
};

// ── Pokémon Stadium ──────────────────────────────────────────────────────────

const TYPE_COLORS: Record<string, string> = {
  Normal: "#8f8f6f", Fire: "#d9502a", Water: "#2f72d6", Grass: "#3a8f45", Electric: "#e3b000", Ice: "#3aa9bb",
  Fighting: "#a8362b", Poison: "#8a3fa4", Ground: "#a87b33", Flying: "#6f82d6", Psychic: "#c8447a", Bug: "#7d9419",
  Rock: "#8f7a3a", Ghost: "#574a88", Dragon: "#5439c4", Dark: "#4a3b33", Steel: "#71808f",
  // Generation 6 on (Pokémon Champions): TypeCard's Fairy.
  Fairy: "#b34a8c",
};

/** A rental team for the streamer; `!gs-shuffle prime` picks the cup (Poké Cup by default). */
function stadium(slug: string, title: string): ChatGame {
  const game = stadiumGame(slug);
  return {
    slug,
    title,
    lobbyCap: 4,
    streamerOnly: true,
    argHint: game.cups.map((c) => c.id).join(", ").replace(/, ([^,]*)$/, " or $1"),
    noun: "team",
    // Poké Cup first: it's what a bare `!gs-shuffle` rolls.
    choices: [...game.cups].sort((a, b) => Number(b.id === "poke") - Number(a.id === "poke")).map((c) => ({ label: c.name, arg: c.id })),
    roll: ({ arg }) => {
      const word = arg.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").split(/\s+/)[0] ?? "";
      const cup = stadiumCup(game, game.cups.some((c) => c.id === word) ? word : "poke");
      const [team] = rollTeams(cup, { players: 1, noRepeat: false, round2: false });
      return done(
        slug,
        team.map((r) => ({ label: "Rental", name: r.name, kind: "text" as const, color: TYPE_COLORS[r.types[0]] ?? "#6b6f80", detail: `Lv ${r.level}` })),
        `${cup.name} team: ${team.map((r) => r.name).join(", ")}`,
      );
    },
  };
}

// ── Pokémon Champions ────────────────────────────────────────────────────────

/**
 * The streamer's team of six from this season's list (game space picks 2026-11-11, pick 17): six different species,
 * filled to cover the team's weak spots the way the team builder's "Fill the rest" does. Streamer only: a team is
 * the streamer's to bring, and Chat Draft already lets chat build one pick by pick.
 */
const champions: ChatGame = {
  slug: "pokemon-champions",
  title: "Pokémon Champions",
  lobbyCap: 2,
  streamerOnly: true,
  noun: "team",
  roll: () => {
    const team = randomTeam();
    return done(
      "pokemon-champions",
      team.map((m) => ({ label: "Pokémon", name: m.name, kind: "text" as const, color: TYPE_COLORS[m.types[0]] ?? "#6b6f80", detail: m.types.join(" / ") })),
      `Regulation ${CHAMPIONS_SEASON.regulation} team: ${team.map((m) => m.name).join(", ")}`,
    );
  },
};

// ── Super Mario Bros. Wonder ─────────────────────────────────────────────────

const WONDER_BADGE_WORDS: Record<string, WonderBadgeType> = {
  action: "action", boost: "boost", expert: "expert", dual: "dual",
};

/**
 * Super Mario Bros. Wonder (game space picks 2026-11-11): a character and a badge, as the randomizer's cards give them.
 * Characters stay different across the lobby, as in the game. `!gs-shuffle expert` keeps the badge to one group;
 * `switch2` adds Rosalina and the Switch 2 Edition's badges (chat can't know which version a streamer plays).
 */
const wonder: ChatGame = {
  slug: WONDER.slug,
  title: WONDER.name,
  lobbyCap: 4,
  unique: true,
  noun: "character and badge",
  argHint: "action, boost or expert, and switch2",
  choices: [{ label: "Any badge", arg: "" }, { label: "Action Badge", arg: "action" }, { label: "Boost Badge", arg: "boost" }, { label: "Expert Badge", arg: "expert" }],
  roll: ({ arg, taken }) => {
    const ws = arg.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const switch2 = ws.some((w) => w === "switch2" || w === "s2");
    const types = [...new Set(ws.map((w) => WONDER_BADGE_WORDS[w] ?? WONDER_BADGE_WORDS[w.replace(/s$/, "")]).filter((t): t is WonderBadgeType => !!t))];
    const chars = characterPool(WONDER, { switch2 });
    const free = chars.filter((c) => !taken.includes(c.name));
    const badges = badgePool(WONDER, { switch2, types: types.filter((t) => switch2 || t !== "dual") });
    const [p] = drawPlayers(free.length ? free : chars, badges.length ? badges : badgePool(WONDER, { switch2 }), 1);
    const c = WONDER.characters.find((x) => x.name === p.character)!;
    const b = WONDER.badges.find((x) => x.name === p.badge);
    return done(WONDER.slug, [
      { label: "Character", name: c.name, kind: "portrait", img: `${WONDER.assetBase}characters/${c.slug}.webp`, color: c.color, ...(c.noDamage ? { detail: "Takes no damage" } : {}) },
      ...(b ? [{ label: "Badge", name: b.name, kind: "art" as const, img: `${WONDER.assetBase}badges/${b.slug}.webp`, color: BADGE_TYPE_COLOR[b.type], detail: BADGE_TYPE_LABEL[b.type] }] : []),
    ], `🍄 ${c.name}${b ? ` · 🏅 ${b.name}` : ""}`);
  },
};

// ── Registry ─────────────────────────────────────────────────────────────────

const PARTY_TITLES: Record<string, string> = {
  "super-mario-party-jamboree": "Super Mario Party Jamboree",
  "mario-party-superstars": "Mario Party Superstars",
  "mario-party": "Mario Party",
  "mario-party-2": "Mario Party 2",
  "mario-party-3": "Mario Party 3",
};

export const CHAT_GAMES: Record<string, ChatGame> = Object.fromEntries(
  [
    kartGame(TWITCH_GAMES["mario-kart-8-deluxe"]),
    kartGame(TWITCH_GAMES["mario-kart-world"]),
    mk64,
    mkwii,
    doubleDash,
    marioKartDs,
    mario7,
    superMarioKart,
    smash,
    melee,
    ...Object.values(PARTY_GAMES).map((g) => partyGame(g, PARTY_TITLES[g.slug] ?? g.label)),
    heroGame(OVERWATCH, "Overwatch", 10),
    heroGame(MARVEL_RIVALS, "Marvel Rivals", 12),
    splatoon,
    kirby,
    sonic,
    wonder,
    goldeneye,
    perfectDark,
    stadium("pokemon-stadium", "Pokémon Stadium"),
    stadium("pokemon-stadium-2", "Pokémon Stadium 2"),
    champions,
  ].map((g) => [g.slug, g]),
);

/** Pokémon Stadium 2 rides on the Stadium randomizer page, so it follows that page's flag. */
const PAGE_FOR: Record<string, string> = { "pokemon-stadium-2": "pokemon-stadium" };

/**
 * The chat game for a session's slug, or null (queue mode: no rolls). Games
 * still hidden on the site stay out of chat in production, like their pages.
 */
export function getChatGame(slug: string | null | undefined): ChatGame | null {
  if (!slug) return null;
  const game = CHAT_GAMES[slug];
  if (!game) return null;
  if (!randomizerPublic(PAGE_FOR[slug] ?? slug) && process.env.NODE_ENV === "production") return null;
  return game;
}
