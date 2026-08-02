/**
 * Tier List Maker templates — pre-loaded item sets seeded from our own game
 * data (no scraping; we already own the art). Each becomes an SEO landing page
 * at /tier-list-maker/[template].
 */

import mk8dx from "@/data/mk8dx-data.json";
import mkworld from "@/data/mkworld-data.json";
import { FAVORITE_GAME_CATALOG } from "@/data/favorite-games";

export interface TemplateItem {
  label: string;
  image: string;
}

export interface TierTemplate {
  slug: string;
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

export const TIER_TEMPLATES: TierTemplate[] = [
  {
    slug: "mario-kart-8-deluxe-characters",
    title: "Mario Kart 8 Deluxe Characters",
    description: "Rank every Mario Kart 8 Deluxe racer from S tier to D tier.",
    items: charsOf(MK8DX),
  },
  {
    slug: "mario-kart-8-deluxe-tracks",
    title: "Mario Kart 8 Deluxe Tracks",
    description: "Rank every Mario Kart 8 Deluxe course, from best to worst.",
    items: tracksOf(MK8DX),
  },
  {
    slug: "mario-kart-8-deluxe-karts",
    title: "Mario Kart 8 Deluxe Karts",
    description: "Rank the Mario Kart 8 Deluxe karts, bikes, and ATVs.",
    items: vehiclesOf(MK8DX),
  },
  {
    slug: "mario-kart-world-vehicles",
    title: "Mario Kart World Vehicles",
    description: "Rank the Mario Kart World vehicles.",
    items: vehiclesOf(MKWORLD),
  },
  {
    slug: "mario-kart-world-characters",
    title: "Mario Kart World Characters",
    description: "Rank the Mario Kart World roster.",
    items: charsOf(MKWORLD),
  },
  {
    slug: "mario-kart-world-tracks",
    title: "Mario Kart World Tracks",
    description: "Rank the Mario Kart World courses.",
    items: tracksOf(MKWORLD),
  },
  {
    slug: "best-party-games",
    title: "Best Party Games",
    description: "Rank the best local-multiplayer and party games for game night.",
    items: FAVORITE_GAME_CATALOG.map((g) => ({ label: g.name, image: g.image })),
  },
].filter((t) => t.items.length > 0);

export function getTierTemplate(slug: string): TierTemplate | undefined {
  return TIER_TEMPLATES.find((t) => t.slug === slug);
}
