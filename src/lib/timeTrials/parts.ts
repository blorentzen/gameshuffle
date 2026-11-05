/**
 * The vehicle parts a time trial screenshot names (picks 2026-11-04, all as recommended): the ghost data screen lists
 * the body, wheels and glider in words. We keep them with the time and use the body to start the add form on its
 * vehicle board: an inward drift bike → Inside drift, Teddy Buggy, Biddybuggy, Mr. Scooty, and World's Swoop or
 * R.O.B.-HOG. Names are matched to our own game data, so only real parts are kept. Pure.
 */

import mk8dx from "@/data/mk8dx-data.json";
import mkworld from "@/data/mkworld-data.json";
import { vehicleFor, type TtVehicle } from "./categories";
import type { TtGame } from "./tracks";

export interface TtParts { body: string; wheels: string | null; glider: string | null }

type Named = { name: string; drift?: string; alt?: string };
const norm = (s: string) => s.normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g, "");

// Our data shortens a few names the game writes in full; keep the game's spelling, match either.
const GAME_NAME: Record<string, string> = {
  "wheels:Gold": "Gold Tires", "wheels:GLA": "GLA Tires", "wheels:Triforce": "Triforce Tires", "wheels:Ancient": "Ancient Tires", "wheels:Leaf": "Leaf Tires",
  "gliders:Super": "Super Glider", "gliders:Cloud": "Cloud Glider", "gliders:Flower": "Flower Glider", "gliders:Plane": "Plane Glider", "gliders:Gold": "Gold Glider", "gliders:Paper": "Paper Glider",
};
const named = (kind: "wheels" | "gliders", list: Named[]): Named[] => list.map((p) => (GAME_NAME[`${kind}:${p.name}`] ? { name: GAME_NAME[`${kind}:${p.name}`], alt: p.name } : p));
const WHEELS = named("wheels", mk8dx.wheels as Named[]);
const GLIDERS = named("gliders", mk8dx.gliders as Named[]);

// World's data is from before Swoop arrived; it shares a board with the R.O.B.-HOG.
const WORLD_BODIES: Named[] = [...(mkworld.vehicles as Named[]), { name: "Swoop" }];
const BODIES: Record<TtGame, Named[]> = { mk8dx: mk8dx.vehicles as Named[], mkworld: WORLD_BODIES };

function find(list: Named[], raw: string | null | undefined): Named | null {
  const n = raw ? norm(raw) : "";
  if (n.length < 3) return null;
  return list.find((p) => norm(p.name) === n || (!!p.alt && norm(p.alt) === n))
    // The screen can shorten a name ("R.O.B.-HOG" for "R.O.B.-HOG Famicom").
    ?? list.find((p) => norm(p.name).startsWith(n) && n.length >= 6)
    ?? null;
}

/** The parts as our data names them, or null when the body isn't one we know. World has no wheels or gliders. */
export function partsFor(game: TtGame, raw: { vehicle?: string | null; wheels?: string | null; glider?: string | null }): TtParts | null {
  const body = find(BODIES[game], raw.vehicle);
  if (!body) return null;
  if (game === "mkworld") return { body: body.name, wheels: null, glider: null };
  return { body: body.name, wheels: find(WHEELS, raw.wheels)?.name ?? null, glider: find(GLIDERS, raw.glider)?.name ?? null };
}

/** The vehicle board a body belongs to, or "any" when it has none of its own. */
export function boardForBody(game: TtGame, body: string): TtVehicle {
  const b = find(BODIES[game], body);
  if (!b) return "any";
  if (game === "mkworld") return /^(swoop|robhog)/.test(norm(b.name)) ? vehicleFor(game, "rob_hog") : "any";
  if (b.drift === "Inward") return "inside_drift";
  const n = norm(b.name);
  return n === "teddybuggy" ? "teddy" : n === "biddybuggy" ? "biddybuggy" : n === "mrscooty" ? "scooty" : "any";
}

/** "Yoshi Bike · Azure Roller · Paper Glider". */
export const partsText = (p: TtParts): string => [p.body, p.wheels, p.glider].filter(Boolean).join(" · ");
