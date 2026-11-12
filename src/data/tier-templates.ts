/**
 * Tier List Maker templates — pre-loaded item sets seeded from our own game
 * data (no scraping; we already own the art). Each becomes an SEO landing page
 * at /tier-list-maker/[template].
 */

import mk8dx from "@/data/mk8dx-data.json";
import mkworld from "@/data/mkworld-data.json";
import mk64 from "@/data/mk64-data.json";
import mkwii from "@/data/mkwii-data.json";
import { FAVORITE_GAME_CATALOG } from "@/data/favorite-games";
import { ULTIMATE } from "@/data/smash/ultimate";
import { MELEE } from "@/data/smash/melee";
import { JAMBOREE } from "@/data/party/jamboree";
import { SUPERSTARS } from "@/data/party/superstars";
import { AIR_RIDERS } from "@/data/kirby/air-riders";
import { CROSSWORLDS_GAME } from "@/data/sonic/crossworlds";
import { WONDER } from "@/data/wonder/wonder";
import { DOUBLE_DASH } from "@/data/double-dash/double-dash";
import { MARIO_KART_DS } from "@/data/mario-kart-ds/mario-kart-ds";
import { MARIO_KART_7 } from "@/data/mario-kart-7/mario-kart-7";
import { SUPER_MARIO_KART } from "@/data/super-mario-kart/super-mario-kart";
import { SPLATOON3, splatStageArt } from "@/data/splatoon/splatoon3";
import { OVERWATCH } from "@/data/heroes/overwatch";
import { MARVEL_RIVALS } from "@/data/heroes/marvel-rivals";
import { heroArt } from "@/lib/heroes/art";
import { randomizerPublic } from "@/lib/games-visibility";
import type { PartyGame } from "@/lib/party/types";
import type { HeroGame } from "@/lib/heroes/types";

export interface TemplateItem {
  label: string;
  /** Left out for words-only templates. */
  image?: string;
}

export interface TierTemplate {
  slug: string;
  /** The game family it's listed under in the template picker. */
  group: string;
  title: string;
  description: string;
  items: TemplateItem[];
}

interface NamedImg {
  name: string;
  img: string;
}
interface Cup {
  name: string;
  courses?: NamedImg[];
}
interface GameData {
  characters?: NamedImg[];
  vehicles?: NamedImg[];
  cups?: Cup[];
}

const charsOf = (d: GameData): TemplateItem[] =>
  (d.characters ?? []).map((c) => ({ label: c.name, image: c.img }));
const vehiclesOf = (d: GameData): TemplateItem[] =>
  (d.vehicles ?? []).map((v) => ({ label: v.name, image: v.img }));
/** Retro tracks that share a name get their console in front, as the game shows them
 *  ("N64 Rainbow Road"): Tier Wars and break mode key items by name. */
const tracksOf = (d: GameData): TemplateItem[] => {
  const courses = (d.cups ?? []).flatMap((cup) => cup.courses ?? []);
  const uses = new Map<string, number>();
  for (const c of courses) uses.set(c.name, (uses.get(c.name) ?? 0) + 1);
  return courses.map((c) => {
    const type = (c as { type?: string }).type;
    const label = (uses.get(c.name) ?? 0) > 1 && type && type !== "Standard" ? `${type} ${c.name}` : c.name;
    return { label, image: c.img };
  });
};

const MK8DX = mk8dx as unknown as GameData;
const MKWORLD = mkworld as unknown as GameData;
const MK64 = mk64 as unknown as GameData;
const MKWII = mkwii as unknown as GameData;

/** Items only when the game's art is up: a picture template without pictures isn't one. */
const partyBoards = (g: PartyGame): TemplateItem[] => (g.artReady ? g.boards.filter((b) => b.img).map((b) => ({ label: b.name, image: `${g.assetBase}${b.img}` })) : []);
const partyCharacters = (g: PartyGame): TemplateItem[] => (g.artReady ? g.characters.map((c) => ({ label: c.name, image: `${g.assetBase}${c.img}` })) : []);
const heroesOf = (g: HeroGame): TemplateItem[] => (g.artReady ? g.heroes.map((h) => ({ label: h.name, image: heroArt(g.slug, h.name) })) : []);
const shown = (slug: string, items: TemplateItem[]) => (randomizerPublic(slug) ? items : []);
/** Like `shown`, but development keeps it too, for a game whose space is still staff only (Mario Kart Wii links its tier list). */
const shownOrDev = (slug: string, items: TemplateItem[]) => (randomizerPublic(slug) || process.env.NODE_ENV !== "production" ? items : []);

export const TIER_TEMPLATES: TierTemplate[] = [
  {
    slug: "mario-kart-8-deluxe-characters",
    group: "Mario Kart",
    title: "Mario Kart 8 Deluxe Characters",
    description: "Rank every Mario Kart 8 Deluxe racer from S tier to D tier.",
    items: charsOf(MK8DX),
  },
  {
    slug: "mario-kart-8-deluxe-tracks",
    group: "Mario Kart",
    title: "Mario Kart 8 Deluxe Tracks",
    description: "Rank every Mario Kart 8 Deluxe course, from best to worst.",
    items: tracksOf(MK8DX),
  },
  {
    slug: "mario-kart-8-deluxe-karts",
    group: "Mario Kart",
    title: "Mario Kart 8 Deluxe Karts",
    description: "Rank the Mario Kart 8 Deluxe karts, bikes, and ATVs.",
    items: vehiclesOf(MK8DX),
  },
  {
    slug: "mario-kart-world-vehicles",
    group: "Mario Kart",
    title: "Mario Kart World Vehicles",
    description: "Rank the Mario Kart World vehicles.",
    items: vehiclesOf(MKWORLD),
  },
  {
    slug: "mario-kart-world-characters",
    group: "Mario Kart",
    title: "Mario Kart World Characters",
    description: "Rank the Mario Kart World roster.",
    items: charsOf(MKWORLD),
  },
  {
    slug: "mario-kart-world-tracks",
    group: "Mario Kart",
    title: "Mario Kart World Tracks",
    description: "Rank the Mario Kart World courses.",
    items: tracksOf(MKWORLD),
  },
  {
    slug: "mario-kart-64-tracks",
    group: "Mario Kart",
    title: "Mario Kart 64 Tracks",
    description: "Rank all 16 Mario Kart 64 courses, Luigi Raceway to Rainbow Road.",
    items: shown("mario-kart-64", tracksOf(MK64)),
  },
  {
    slug: "mario-kart-wii-tracks",
    group: "Mario Kart",
    title: "Mario Kart Wii Tracks",
    description: "Rank all 32 Mario Kart Wii courses, Luigi Circuit to N64 Bowser's Castle.",
    items: shownOrDev("mario-kart-wii", tracksOf(MKWII)),
  },
  {
    slug: "mario-kart-wii-characters",
    group: "Mario Kart",
    title: "Mario Kart Wii Characters",
    description: "Rank the 24 Mario Kart Wii racers, Baby Mario to Dry Bowser.",
    // The randomizer's Mii comes in three sizes; a tier list ranks the 24 characters.
    items: shownOrDev("mario-kart-wii", charsOf(MKWII).filter((c) => !c.label.startsWith("Mii"))),
  },
  {
    slug: "mario-kart-wii-vehicles",
    group: "Mario Kart",
    title: "Mario Kart Wii Karts and Bikes",
    description: "Rank all 36 Mario Kart Wii karts and bikes, from the Standard Kart S to the Phantom.",
    items: shownOrDev("mario-kart-wii", vehiclesOf(MKWII)),
  },
  {
    slug: "mario-kart-double-dash-tracks",
    group: "Mario Kart",
    title: "Mario Kart: Double Dash!! Tracks",
    description: "Rank all 16 Double Dash courses, Luigi Circuit to Rainbow Road.",
    items: shownOrDev(DOUBLE_DASH.slug, DOUBLE_DASH.cups.flatMap((c) => c.courses).map((c) => ({ label: c.name, image: `${DOUBLE_DASH.assetBase}tracks/${c.slug}.webp` }))),
  },
  {
    slug: "mario-kart-double-dash-characters",
    group: "Mario Kart",
    title: "Mario Kart: Double Dash!! Characters",
    description: "Rank the 20 Double Dash racers, Baby Mario to King Boo.",
    items: shownOrDev(DOUBLE_DASH.slug, DOUBLE_DASH.characters.map((c) => ({ label: c.name, image: `${DOUBLE_DASH.assetBase}characters/${c.slug}.webp` }))),
  },
  {
    slug: "mario-kart-double-dash-karts",
    group: "Mario Kart",
    title: "Mario Kart: Double Dash!! Karts",
    description: "Rank all 21 Double Dash karts, from the Goo-Goo Buggy to the Parade Kart.",
    items: shownOrDev(DOUBLE_DASH.slug, DOUBLE_DASH.karts.map((k) => ({ label: k.name, image: `${DOUBLE_DASH.assetBase}karts/${k.slug}.webp` }))),
  },
  {
    slug: "mario-kart-ds-tracks",
    group: "Mario Kart",
    title: "Mario Kart DS Tracks",
    description: "Rank all 32 Mario Kart DS courses, the 16 Nitro courses and the 16 Retro courses.",
    items: shownOrDev(MARIO_KART_DS.slug, MARIO_KART_DS.cups.flatMap((c) => c.courses).map((c) => ({ label: c.name, image: `${MARIO_KART_DS.assetBase}tracks/${c.slug}.webp` }))),
  },
  {
    slug: "mario-kart-ds-characters",
    group: "Mario Kart",
    title: "Mario Kart DS Characters",
    description: "Rank the 12 Mario Kart DS racers, Mario to R.O.B.",
    items: shownOrDev(MARIO_KART_DS.slug, MARIO_KART_DS.characters.map((c) => ({ label: c.name, image: `${MARIO_KART_DS.assetBase}characters/${c.slug}.webp` }))),
  },
  {
    slug: "mario-kart-ds-karts",
    group: "Mario Kart",
    title: "Mario Kart DS Karts",
    description: "Rank all 36 Mario Kart DS karts, from the B Dasher to the ROB-LGS.",
    items: shownOrDev(MARIO_KART_DS.slug, MARIO_KART_DS.karts.map((k) => ({ label: k.name, image: `${MARIO_KART_DS.assetBase}karts/${k.slug}.webp` }))),
  },
  {
    slug: "mario-kart-7-tracks",
    group: "Mario Kart",
    title: "Mario Kart 7 Tracks",
    description: "Rank all 32 Mario Kart 7 courses, the 16 new courses and the 16 classics.",
    items: shownOrDev(MARIO_KART_7.slug, MARIO_KART_7.cups.flatMap((c) => c.courses).map((c) => ({ label: c.name, image: `${MARIO_KART_7.assetBase}tracks/${c.slug}.webp` }))),
  },
  {
    slug: "mario-kart-7-characters",
    group: "Mario Kart",
    title: "Mario Kart 7 Characters",
    description: "Rank the 17 Mario Kart 7 racers, Mario to your Mii.",
    items: shownOrDev(MARIO_KART_7.slug, MARIO_KART_7.characters.map((c) => ({ label: c.name, image: `${MARIO_KART_7.assetBase}characters/${c.slug}.webp` }))),
  },
  {
    slug: "super-mario-kart-tracks",
    group: "Mario Kart",
    title: "Super Mario Kart Tracks",
    description: "Rank all 20 Super Mario Kart courses, Mario Circuit 1 to Rainbow Road.",
    items: shownOrDev(SUPER_MARIO_KART.slug, SUPER_MARIO_KART.cups.flatMap((c) => c.courses).map((c) => ({ label: c.name, image: `${SUPER_MARIO_KART.assetBase}tracks/${c.slug}.webp` }))),
  },
  {
    slug: "super-mario-kart-characters",
    group: "Mario Kart",
    title: "Super Mario Kart Characters",
    description: "Rank the 8 Super Mario Kart drivers, Mario to Toad.",
    items: shownOrDev(SUPER_MARIO_KART.slug, SUPER_MARIO_KART.characters.map((c) => ({ label: c.name, image: `${SUPER_MARIO_KART.assetBase}characters/${c.slug}.webp` }))),
  },
  {
    slug: "smash-ultimate-fighters",
    group: "Smash Ultimate",
    title: "Smash Ultimate Fighters",
    description: "Rank the whole Super Smash Bros. Ultimate roster, DLC included.",
    items: shown(ULTIMATE.slug, ULTIMATE.artReady ? ULTIMATE.fighters.map((f) => ({ label: f.name, image: `${ULTIMATE.assetBase}${f.img}` })) : []),
  },
  {
    slug: "smash-ultimate-competitive-stages",
    group: "Smash Ultimate",
    title: "Smash Ultimate Competitive Stages",
    description: "Rank the starter and counterpick stages most Smash Ultimate events play on.",
    items: shown(ULTIMATE.slug, ULTIMATE.artReady ? ULTIMATE.stages.filter((s) => s.status === "starter" || s.status === "counterpick").map((s) => ({ label: s.name, image: `${ULTIMATE.assetBase}${s.img}` })) : []),
  },
  {
    slug: "smash-melee-fighters",
    group: "Smash Melee",
    title: "Super Smash Bros. Melee Fighters",
    description: "Rank all 26 Melee fighters, Sheik included, from Fox to Pichu.",
    // Sheik has no select screen portrait in the game, so her tile is her name.
    items: shownOrDev(MELEE.slug, MELEE.fighters.map((f) => (f.img ? { label: f.name, image: `${MELEE.assetBase}${f.img}` } : { label: f.name }))),
  },
  {
    slug: "smash-melee-stages",
    group: "Smash Melee",
    title: "Super Smash Bros. Melee Stages",
    description: "Rank all 29 Melee stages, the legal six and every casual one.",
    items: shownOrDev(MELEE.slug, MELEE.stages.map((x) => ({ label: x.name, image: `${MELEE.assetBase}${x.img}` }))),
  },
  {
    slug: "mario-party-jamboree-boards",
    group: "Mario Party",
    title: "Super Mario Party Jamboree Boards",
    description: "Rank every Super Mario Party Jamboree board, from Mega Wiggler's Tree Party up.",
    items: shown(JAMBOREE.slug, partyBoards(JAMBOREE)),
  },
  {
    slug: "mario-party-jamboree-characters",
    group: "Mario Party",
    title: "Super Mario Party Jamboree Characters",
    description: "Rank the Super Mario Party Jamboree roster.",
    items: shown(JAMBOREE.slug, partyCharacters(JAMBOREE)),
  },
  {
    slug: "mario-party-superstars-boards",
    group: "Mario Party",
    title: "Mario Party Superstars Boards",
    description: "Rank the five classic boards in Mario Party Superstars.",
    items: shown(SUPERSTARS.slug, partyBoards(SUPERSTARS)),
  },
  {
    slug: "kirby-air-riders-riders",
    group: "Kirby Air Riders",
    title: "Kirby Air Riders Riders",
    description: "Rank every rider in Kirby Air Riders.",
    items: shown(AIR_RIDERS.slug, AIR_RIDERS.artReady ? AIR_RIDERS.riders.map((r) => ({ label: r.name, image: `${AIR_RIDERS.assetBase}${r.img}` })) : []),
  },
  {
    slug: "kirby-air-riders-machines",
    group: "Kirby Air Riders",
    title: "Kirby Air Riders Machines",
    description: "Rank the Kirby Air Riders machines, Warp Star to the Legendaries.",
    items: shown(AIR_RIDERS.slug, AIR_RIDERS.artReady ? AIR_RIDERS.machines.map((m) => ({ label: m.name, image: `${AIR_RIDERS.assetBase}${m.img}` })) : []),
  },
  {
    slug: "sonic-racing-crossworlds-racers",
    group: "Sonic Racing: CrossWorlds",
    title: "Sonic Racing: CrossWorlds Racers",
    description: "Rank every racer in Sonic Racing: CrossWorlds, from Sonic and Shadow to the guest racers.",
    // Words only until the racers' art is cleared.
    items: shown(CROSSWORLDS_GAME.slug, CROSSWORLDS_GAME.racers.map((r) => ({ label: r.name }))),
  },
  {
    slug: "super-mario-bros-wonder-badges",
    group: "Super Mario Bros. Wonder",
    title: "Super Mario Bros. Wonder Badges",
    description: "Rank every Super Mario Bros. Wonder badge, from Parachute Cap to Sound Off?",
    // The single badges (Dual Badges are two of these at once). Staff only until the Wonder space opens.
    items: shownOrDev(WONDER.slug, WONDER.badges.filter((b) => b.type !== "dual").map((b) => ({ label: b.name, image: `${WONDER.assetBase}badges/${b.slug}.webp` }))),
  },
  {
    slug: "splatoon-3-stages",
    group: "Splatoon 3",
    title: "Splatoon 3 Stages",
    description: "Rank every Splatoon 3 battle stage.",
    items: shown(SPLATOON3.slug, SPLATOON3.artReady ? SPLATOON3.stages.map((s) => ({ label: s.name, image: `${SPLATOON3.assetBase}${splatStageArt(s.name)}` })) : []),
  },
  {
    slug: "overwatch-heroes",
    group: "Hero shooters",
    title: "Overwatch Heroes",
    description: "Rank every Overwatch hero, tank, damage and support.",
    items: shown(OVERWATCH.slug, heroesOf(OVERWATCH)),
  },
  {
    slug: "marvel-rivals-heroes",
    group: "Hero shooters",
    title: "Marvel Rivals Heroes",
    description: "Rank every Marvel Rivals hero, Vanguards, Duelists and Strategists.",
    items: shown(MARVEL_RIVALS.slug, heroesOf(MARVEL_RIVALS)),
  },
  {
    slug: "best-party-games",
    group: "Game night",
    title: "Best Party Games",
    description: "Rank the best local-multiplayer and party games for game night.",
    items: FAVORITE_GAME_CATALOG.map((g) => ({ label: g.name, image: g.image })),
  },
  {
    slug: "halloween-treats",
    group: "Game night",
    title: "Halloween Treats",
    description: "Rank every trick-or-treat haul staple, from full-size bars to the house that gives out toothbrushes.",
    // Words only, and kinds of treat rather than brands.
    items: [
      "Full-size candy bars", "Fun-size candy bars", "Peanut butter cups", "Candy corn", "Gummy worms", "Lollipops",
      "Caramel apples", "Sour candy", "Jelly beans", "Licorice", "Taffy", "Candy necklaces", "Popcorn balls",
      "Chocolate coins", "Malted milk balls", "Peppermints", "Bubble gum", "Caramels", "Candy straws", "Raisins",
      "Toothbrushes", "Pennies",
    ].map((label) => ({ label })),
  },
  {
    slug: "christmas-movies",
    group: "Game night",
    title: "Christmas Movies",
    description: "Rank the holiday classics, from Home Alone to the one your family watches every year.",
    // Words only: the movie titles, no posters.
    items: [
      "Home Alone", "Elf", "A Christmas Story", "It's a Wonderful Life", "The Polar Express", "How the Grinch Stole Christmas",
      "The Muppet Christmas Carol", "Miracle on 34th Street", "National Lampoon's Christmas Vacation", "The Santa Clause",
      "Rudolph the Red-Nosed Reindeer", "A Charlie Brown Christmas", "The Nightmare Before Christmas", "Klaus", "Arthur Christmas",
      "Frosty the Snowman", "Jingle All the Way", "White Christmas", "Scrooged", "The Holiday",
    ].map((label) => ({ label })),
  },
].filter((t) => t.items.length > 0);

export function getTierTemplate(slug: string): TierTemplate | undefined {
  return TIER_TEMPLATES.find((t) => t.slug === slug);
}
