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
import { randomizeKartCombo } from "@/lib/randomizer";
import { applyToKartData, offSet, type GameCollection } from "@/lib/collection/core";
import { getImagePath } from "@/lib/images";
import { TWITCH_GAMES, type TwitchGameEntry } from "@/lib/twitch/games";
import { randomizerPublic } from "@/lib/games-visibility";
import type { KartCombo } from "@/data/types";
import type { ChatRoll, RollGlyph, RollSlot } from "@/lib/twitch/chatRoll";
import { pick } from "@/lib/party/roll";
import { ULTIMATE, fighterColor } from "@/data/smash/ultimate";
import { drawFighters, fighterPool, stagePool } from "@/lib/smash/roll";
import { PARTY_GAMES } from "@/data/party";
import { drawCharacters } from "@/lib/party/roll";
import { characterArt, type PartyGame } from "@/lib/party/types";
import { OVERWATCH } from "@/data/heroes/overwatch";
import { MARVEL_RIVALS } from "@/data/heroes/marvel-rivals";
import { liveRoster } from "@/lib/heroes/live";
import { rollHeroes } from "@/lib/heroes/roll";
import type { HeroGame } from "@/lib/heroes/types";
import { SPLATOON3 } from "@/data/splatoon/splatoon3";
import { drawWeapons, weaponPool } from "@/lib/splatoon/roll";
import { AIR_RIDERS } from "@/data/kirby/air-riders";
import { drawCombos, machinePool, riderPool } from "@/lib/kirby/roll";
import { rollCharacters as rollGoldenEye } from "@/lib/goldeneye/roll";
import { rollCharacters as rollPerfectDark } from "@/lib/perfectdark/roll";
import { perfectDarkTile } from "@/data/game-art";
import { rollTeams, stadiumCup, stadiumGame } from "@/lib/pokemon/stadium";

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
  roll: () => {
    const c = pick(MK64_CHARACTERS)!;
    return done("mario-kart-64", [{ label: "Racer", name: c.name, kind: "art", img: getImagePath(c.img) }], `🧑 ${c.name}`);
  },
};

// ── Smash ────────────────────────────────────────────────────────────────────

const smash: ChatGame = {
  slug: ULTIMATE.slug,
  title: "Super Smash Bros. Ultimate",
  lobbyCap: 8,
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

// ── Mario Party ──────────────────────────────────────────────────────────────

/** A character nobody else in the lobby has, like a room in the game itself. */
function partyGame(game: PartyGame, title: string): ChatGame {
  return {
    slug: game.slug,
    title,
    lobbyCap: 4,
    unique: true,
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
        [{ label: "Hero", name: hero.name, kind: "glyph", glyph, color: role?.color ?? "#6b5ccf", detail: roleLabel }],
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

// ── N64 shooters ─────────────────────────────────────────────────────────────

const goldeneye: ChatGame = {
  slug: "goldeneye-007",
  title: "GoldenEye 007",
  lobbyCap: 4,
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
    smash,
    ...Object.values(PARTY_GAMES).map((g) => partyGame(g, PARTY_TITLES[g.slug] ?? g.label)),
    heroGame(OVERWATCH, "Overwatch", 10),
    heroGame(MARVEL_RIVALS, "Marvel Rivals", 12),
    splatoon,
    kirby,
    goldeneye,
    perfectDark,
    stadium("pokemon-stadium", "Pokémon Stadium"),
    stadium("pokemon-stadium-2", "Pokémon Stadium 2"),
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
