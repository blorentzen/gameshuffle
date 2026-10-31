import "server-only";

/**
 * What Trainer Road's pages show from the roster (no database: the trainers, their teams, pictures
 * and bios come from the Duel's data files). The duels themselves are the store's (roadStore.ts).
 */

import { DUEL_DATA } from "./data";
import { bioFor } from "@/data/originals/duel/bios";
import { trainerPicture } from "./pictures";
import { ROAD_REGIONS, holdsRole, regionSections, roadPath, roadPeople, roadRegion, sectionLabel, sectionOf, teamLabel, teamRole, type RoadPerson, type RoadRegion } from "./road";
import type { DuelTier, DuelTrainer } from "./types";
import type { DuelPicture } from "./view";

let road: Map<string, RoadPerson[]> | null = null;
/** Each region's people (worked out once per server). */
export const roadMap = () => (road ??= roadPeople(DUEL_DATA.trainers));

const ace = (t: DuelTrainer) => DUEL_DATA.cards[t.team[t.team.length - 1]] ?? null;
/** A person's picture: their own card, else the ace of their first team. */
export const personPicture = (p: RoadPerson): DuelPicture | null => trainerPicture(p.teams[0], ace(p.teams[0]));

/** The species of a team ("Geodude", "Onix"): the card's name without its owner or its card rule ("Brock's Onix" → "Onix", "Lapras ex" → "Lapras"; no Pokémon has "'s " in its name). */
export const teamSpecies = (t: DuelTrainer) => t.team.map((id) => (DUEL_DATA.cards[id]?.short ?? DUEL_DATA.cards[id]?.name ?? "").replace(/^.*?'s\s+/, "").replace(/\s+(ex|EX|GX|V|VMAX|VSTAR)$/, "")).filter(Boolean);

export interface RoadTileView {
  slug: string;
  name: string;
  href: string;
  title: string;
  picture: DuelPicture | null;
  /** The team shown on the tile (their first in this section). */
  species: string[];
  /** Every team of theirs in this section (stars read the best of them). */
  teamIds: string[];
  games: number;
}

export function tileOf(p: RoadPerson, tier: DuelTier): RoadTileView {
  const teams = p.teams.filter((t) => sectionOf(t.tier) === tier);
  return { slug: p.slug, name: p.name, href: roadPath(p.region, p.slug), title: teams[0].title, picture: personPicture(p), species: teamSpecies(teams[0]), teamIds: teams.map((t) => t.id), games: teams.length };
}

export interface RoadSectionView { tier: DuelTier; label: string; /** False when no one here held the tier's role (Alola's final battles). */ real: boolean; tiles: RoadTileView[] }

export function regionView(slug: string): { region: RoadRegion; sections: RoadSectionView[]; people: RoadPerson[] } | null {
  const region = roadRegion(slug);
  if (!region) return null;
  const people = roadMap().get(slug) ?? [];
  const sections = regionSections(people).map((s) => {
    const real = s.people.some((p) => p.teams.some((t) => sectionOf(t.tier) === s.tier && holdsRole(t)));
    return { tier: s.tier, label: sectionLabel(s.tier, region, s.people.length, real), real, tiles: s.people.map((p) => tileOf(p, s.tier)) };
  });
  return { region, sections, people };
}

/** "Kanto Gym Leaders, Elite Four and Champions" (from the sections the region has). */
export function regionHeading(region: RoadRegion, sections: RoadSectionView[]): string {
  const parts = sections.filter((s) => s.real && (s.tier === "gym" || s.tier === "elite" || s.tier === "champion")).map((s) => s.label);
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}` : parts[0] ?? "Trainers";
  return region.slug === "alola" ? `Alola's ${list.charAt(0).toLowerCase()}${list.slice(1)}` : `${region.name} ${list}`;
}

/** The people in a region in road order (each once, in the order their first section lists them). */
export function roadOrder(slug: string): RoadPerson[] {
  const v = regionView(slug);
  if (!v) return [];
  const seen = new Set<string>();
  const out: RoadPerson[] = [];
  for (const s of v.sections) for (const t of s.tiles) {
    if (seen.has(t.slug)) continue;
    seen.add(t.slug);
    out.push(v.people.find((p) => p.slug === t.slug)!);
  }
  return out;
}

/** The trainer after this one on the road (the next region's first after the last). */
export function nextOnRoad(region: string, slug: string): { href: string; name: string } | null {
  const order = roadOrder(region);
  const i = order.findIndex((p) => p.slug === slug);
  if (i >= 0 && i + 1 < order.length) return { href: roadPath(region, order[i + 1].slug), name: order[i + 1].name };
  const r = ROAD_REGIONS.findIndex((x) => x.slug === region);
  const nextRegion = ROAD_REGIONS[(r + 1) % ROAD_REGIONS.length];
  const first = roadOrder(nextRegion.slug)[0];
  return first ? { href: roadPath(nextRegion.slug, first.slug), name: first.name } : null;
}

export interface RoadPersonView {
  person: RoadPerson;
  region: RoadRegion;
  picture: DuelPicture | null;
  bio: string | null;
  /** Their main role here, from their first team's title ("Pewter City Gym Leader"). */
  role: string;
  /** A short label for the header ("Kanto Gym Leader", "Johto Elite Four", "Alola kahuna"). */
  eyebrow: string;
  teams: { id: string; gameLabel: string; title: string; tierLabel: string; species: string[] }[];
  next: { href: string; name: string } | null;
}

export function personView(regionSlug: string, slug: string): RoadPersonView | null {
  const region = roadRegion(regionSlug);
  const person = roadMap().get(regionSlug)?.find((p) => p.slug === slug);
  if (!region || !person) return null;
  const first = person.teams.find((t) => t.tier === person.tiers[0]) ?? person.teams[0];
  const role = first.title;
  const tier = person.tiers[0];
  const holds = person.teams.some((t) => t.tier === tier && holdsRole(t));
  const eyebrow = tier === "gym" ? (region.slug === "alola" ? "Alola kahuna" : `${region.name} Gym Leader`)
    : tier === "elite" ? (holds ? `${region.name} Elite Four` : first.title)
    : tier === "champion" ? (holds ? `${region.name} Champion` : `${region.name} final battle`)
    : tier === "rival" ? `${region.name} rival`
    : tier === "grunt" || tier === "admin" ? `${region.name} villain team` : `${region.name} villain boss`;
  return {
    person, region, picture: personPicture(person), bio: bioFor(slug), role, eyebrow,
    teams: person.tiers.flatMap((tier) => person.teams.filter((t) => t.tier === tier)).map((t) => ({ id: t.id, gameLabel: teamLabel(t), title: t.title, tierLabel: teamRole(t), species: teamSpecies(t) })),
    next: nextOnRoad(regionSlug, slug),
  };
}

/** Every trainer page (the sitemap, generateStaticParams). */
export function allRoadPeople(): { region: string; slug: string }[] {
  return ROAD_REGIONS.flatMap((r) => (roadMap().get(r.slug) ?? []).map((p) => ({ region: r.slug, slug: p.slug })));
}

let totals: { trainers: number; teams: number; regions: number } | null = null;
/** How big the road is: different trainers (Koga, Bruno and Lance count once), teams and regions. */
export function roadTotals(): { trainers: number; teams: number; regions: number } {
  if (totals) return totals;
  const people = new Set<string>();
  let teams = 0;
  for (const r of ROAD_REGIONS) {
    for (const p of regionView(r.slug)?.people ?? []) { people.add(p.slug); teams += p.teams.length; }
  }
  totals = { trainers: people.size, teams, regions: ROAD_REGIONS.length };
  return totals;
}

/** A region's Gym Leaders as faces, in badge order (the Daily Duel page's road module). */
export function regionGymFaces(slug: string): { name: string; picture: DuelPicture | null }[] {
  const gym = regionView(slug)?.sections.find((s) => s.tier === "gym");
  return (gym?.tiles ?? []).slice(0, 8).map((t) => ({ name: t.name, picture: t.picture }));
}
