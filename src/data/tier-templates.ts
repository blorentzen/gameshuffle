/**
 * Tier List Maker templates — pre-loaded item sets seeded from our own game
 * data (no scraping; we already own the art). Each becomes an SEO landing page
 * at /tier-list-maker/[template].
 */

import mk8dx from "@/data/mk8dx-data.json";
import mkworld from "@/data/mkworld-data.json";
import mk64 from "@/data/mk64-data.json";
import { FAVORITE_GAME_CATALOG } from "@/data/favorite-games";
import { ULTIMATE } from "@/data/smash/ultimate";
import { JAMBOREE } from "@/data/party/jamboree";
import { SUPERSTARS } from "@/data/party/superstars";
import { AIR_RIDERS } from "@/data/kirby/air-riders";
import { SPLATOON3, splatStageArt } from "@/data/splatoon/splatoon3";
import { OVERWATCH } from "@/data/heroes/overwatch";
import { MARVEL_RIVALS } from "@/data/heroes/marvel-rivals";
import { heroArt } from "@/lib/heroes/art";
import { randomizerPublic } from "@/lib/games-visibility";
import type { PartyGame } from "@/lib/party/types";
import type { HeroGame } from "@/lib/heroes/types";

export interface TemplateItem {
  label: string;
  image: string;
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
const tracksOf = (d: GameData): TemplateItem[] =>
  (d.cups ?? []).flatMap((cup) => (cup.courses ?? []).map((c) => ({ label: c.name, image: c.img })));

const MK8DX = mk8dx as unknown as GameData;
const MKWORLD = mkworld as unknown as GameData;
const MK64 = mk64 as unknown as GameData;

/** Items only when the game's art is up: a picture template without pictures isn't one. */
const partyBoards = (g: PartyGame): TemplateItem[] => (g.artReady ? g.boards.filter((b) => b.img).map((b) => ({ label: b.name, image: `${g.assetBase}${b.img}` })) : []);
const partyCharacters = (g: PartyGame): TemplateItem[] => (g.artReady ? g.characters.map((c) => ({ label: c.name, image: `${g.assetBase}${c.img}` })) : []);
const heroesOf = (g: HeroGame): TemplateItem[] => (g.artReady ? g.heroes.map((h) => ({ label: h.name, image: heroArt(g.slug, h.name) })) : []);
const shown = (slug: string, items: TemplateItem[]) => (randomizerPublic(slug) ? items : []);

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
].filter((t) => t.items.length > 0);

export function getTierTemplate(slug: string): TierTemplate | undefined {
  return TIER_TEMPLATES.find((t) => t.slug === slug);
}
