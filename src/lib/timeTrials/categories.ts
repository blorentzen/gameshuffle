/**
 * Time trial categories (round 2, players' feedback 2026-10-29; supabase/time-trials-m2.sql).
 * Client-safe.
 *
 * Every time is with mushrooms or no mushrooms (the split time trialers care about), at one speed,
 * and may be set with a restricted vehicle. The open board ("any") counts every time, so a Mr. Scooty
 * run also shows there; a vehicle board shows only times set with that vehicle, except Inside drift, which
 * also counts Yoshi Bike times (it's an inside-drift bike; round 3 pick 4A). Mario Kart World has a
 * R.O.B.-HOG board (round 3 pick 5A, the "meta combo"); its other vehicles open once players ask.
 *
 * Kirby Air Riders (2026-11-09): the game keeps its records per course by machine, so every Kirby time is saved with
 * its machine (`kar_<name>`) and has no items or speed. Its boards: Any machine (every time), No Legendaries (every
 * machine but Dragoon, Hydra and Leo, which most runs leave out: speedrun.com's Restricted boards hold most of its Air
 * Ride Time Attack runs) and one per machine. Gigantes can't be raced in Time Attack (WiKirby: City Trial and its
 * Stadium only), and Flight Warp Star is Free Run only, so neither is here. The database counts a time on a board with
 * tt_on_board (supabase/tt-kirby-m1.sql adds No Legendaries); `onBoard` below is the same rule.
 */

import { AIR_RIDERS } from "@/data/kirby/air-riders";
import type { MachineType } from "@/lib/kirby/types";
import type { TtGame } from "./tracks";

export type TtItems = "shrooms" | "none";
/** A Kirby Air Riders machine's id ("kar_rocket_star"), or kar_std, the No Legendaries board. */
export type KarVehicle = `kar_${string}`;
export type TtVehicle = "any" | "inside_drift" | "scooty" | "teddy" | "biddybuggy" | "yoshi_bike" | "rob_hog" | KarVehicle;

export const ITEMS: { id: TtItems; label: string; short: string }[] = [
  { id: "shrooms", label: "Mushrooms", short: "Mushrooms" },
  { id: "none", label: "No mushrooms", short: "No mushrooms" },
];

/** Kirby machines raced in Time Attack, in the game's order: id from the name, never renamed once saved. */
const KAR_MACHINES = AIR_RIDERS.machines.filter((m) => m.name !== "Gigantes");
const karId = (name: string): KarVehicle => `kar_${name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")}`;
/** The No Legendaries board's id (a board only: no time is saved with it). */
export const KAR_STANDARD: KarVehicle = "kar_std";

export interface VehicleInfo {
  id: TtVehicle; label: string; long: string; games: TtGame[];
  /** Kept for times already saved with it, never offered. */
  retired?: boolean;
  /** A board that gathers several vehicles: offered as a filter, never saved with a time. */
  boardOnly?: boolean;
  /** Kirby: the machine's type (Stars, Bikes...), for grouping pickers. */
  type?: MachineType;
  /** Kirby: Dragoon, Hydra and Leo, left off the No Legendaries board. */
  legendary?: boolean;
}

/** `retired`: kept for times already saved with it, never offered (players' feedback 2026-11-04: Yoshi Bike folds into
 *  Inside drift, where its times already counted; the World board is named for both karts that share it). */
export const VEHICLES: VehicleInfo[] = [
  { id: "any", label: "Any", long: "Any vehicle", games: ["mk8dx", "mkworld", "kar"] },
  { id: "inside_drift", label: "Inside drift", long: "Inside drift bike", games: ["mk8dx"] },
  { id: "yoshi_bike", label: "Yoshi Bike", long: "Yoshi Bike", games: ["mk8dx"], retired: true },
  { id: "teddy", label: "Teddy Buggy", long: "Teddy Buggy", games: ["mk8dx"] },
  { id: "biddybuggy", label: "Biddybuggy", long: "Biddybuggy", games: ["mk8dx"] },
  { id: "scooty", label: "Mr. Scooty", long: "Mr. Scooty", games: ["mk8dx"] },
  { id: "rob_hog", label: "Swoop, R.O.B.-HOG", long: "Swoop, R.O.B.-HOG", games: ["mkworld"] },
  { id: KAR_STANDARD, label: "No Legendaries", long: "No Legendaries", games: ["kar"], boardOnly: true },
  ...KAR_MACHINES.map((m): VehicleInfo => ({ id: karId(m.name), label: m.name, long: m.name, games: ["kar"], type: m.type, legendary: m.type === "Legendary" })),
];
const BY_ID = new Map(VEHICLES.map((v) => [v.id, v]));
/** The machine types in the game's order, with how a picker groups them ("Stars"...). */
export const KAR_MACHINE_TYPES = AIR_RIDERS.machineTypes;

export function isItems(v: unknown): v is TtItems {
  return v === "shrooms" || v === "none";
}
export function isVehicle(v: unknown): v is TtVehicle {
  return typeof v === "string" && BY_ID.has(v as TtVehicle);
}
/** Whether the game has mushrooms or no mushrooms boards (Mario Kart; Kirby Air Riders has neither). */
export const hasItems = (game: TtGame): boolean => game !== "kar";
/** Whether a time must name its vehicle (Kirby: every record is a machine's). */
export const vehicleRequired = (game: TtGame): boolean => game === "kar";
/** A vehicle a time can be saved with in this game: never a board-only filter, and never "any" where one is required. */
export function isSavableVehicle(game: TtGame, v: unknown): v is TtVehicle {
  const info = isVehicle(v) ? BY_ID.get(v) : undefined;
  return !!info && info.games.includes(game) && !info.retired && !info.boardOnly && !(v === "any" && vehicleRequired(game));
}
/** The machines a Kirby time can be saved with, in the game's order (for the add form's grouped picker). */
export function savableVehicles(game: TtGame): VehicleInfo[] {
  return VEHICLES.filter((v) => isSavableVehicle(game, v.id));
}
/** What a board filter is called: "Vehicle board" or, in Kirby Air Riders, "Machine". */
export const vehicleWord = (game: TtGame): { label: string; any: string } => (game === "kar" ? { label: "Machine", any: "Any machine" } : { label: "Vehicle board", any: "Any vehicle" });
/** A board's name in a picker: "Any vehicle", "Any machine", "No Legendaries", "Rocket Star". */
export function boardLabel(game: TtGame, v: TtVehicle): string {
  return v === "any" ? vehicleWord(game).any : vehicleLabel(v);
}
/** Vehicle boards a game has. */
export function vehiclesFor(game: TtGame): TtVehicle[] {
  return VEHICLES.filter((v) => v.games.includes(game) && !v.retired).map((v) => v.id);
}
/** A game's vehicle choices (for pickers). */
export function vehicleOptions(game: TtGame) {
  return VEHICLES.filter((v) => v.games.includes(game) && !v.retired);
}
/** The vehicle a time keeps for its game ("any" when that game has no such board; Yoshi Bike is Inside drift now). */
export function vehicleFor(game: TtGame, v: unknown): TtVehicle {
  if (v === "yoshi_bike" && game === "mk8dx") return "inside_drift";
  return isVehicle(v) && vehiclesFor(game).includes(v) ? v : "any";
}
/** A Kirby machine that counts on the No Legendaries board. */
const standardMachine = (v: TtVehicle): boolean => v.startsWith("kar_") && v !== KAR_STANDARD && !BY_ID.get(v)?.legendary;
/** Whether a time set with `vehicle` counts on board `board` (the database's tt_on_board). */
export function onBoard(board: TtVehicle, vehicle: TtVehicle): boolean {
  return board === "any" || board === vehicle || (board === "inside_drift" && vehicle === "yoshi_bike") || (board === KAR_STANDARD && standardMachine(vehicle));
}
/** The boards a time counts on: the open board and its vehicle's (a Yoshi Bike time is on Inside drift; a Kirby
 *  machine that isn't Legendary is on No Legendaries too). */
export function boardsFor(game: TtGame, vehicle: TtVehicle): TtVehicle[] {
  const v = vehicleFor(game, vehicle);
  if (v === "any") return ["any"];
  return standardMachine(v) ? ["any", KAR_STANDARD, v] : ["any", v];
}
export function itemsLabel(items: TtItems): string {
  return ITEMS.find((i) => i.id === items)!.label;
}
export function vehicleLabel(v: TtVehicle): string {
  return BY_ID.get(v)?.label ?? "Any";
}

/** Items and vehicle from a page's search params, with the defaults when missing or not for this game. */
export function readCategory(game: TtGame, sp: { items?: string | null; vehicle?: string | null }): { items: TtItems; vehicle: TtVehicle } {
  const items = isItems(sp.items) && hasItems(game) ? sp.items : "shrooms";
  return { items, vehicle: vehicleFor(game, sp.vehicle) };
}

/** "?cc=200&items=none&vehicle=scooty" for whatever isn't a default (cc's default is the game's first class). */
export function categoryQuery(parts: { cc?: number | null; defaultCc?: number; items?: TtItems; vehicle?: TtVehicle }): string {
  const q = new URLSearchParams();
  if (parts.cc && parts.cc !== parts.defaultCc) q.set("cc", String(parts.cc));
  if (parts.items && parts.items !== "shrooms") q.set("items", parts.items);
  if (parts.vehicle && parts.vehicle !== "any") q.set("vehicle", parts.vehicle);
  const s = q.toString();
  return s ? `?${s}` : "";
}

/** "150cc, no mushrooms, Mr. Scooty" (the speed only when the game has two); Kirby Air Riders names only the machine
 *  or the board ("Rocket Star", "any machine", "No Legendaries"). */
export function categoryText(game: TtGame, cc: number, items: TtItems, vehicle: TtVehicle, twoSpeeds: boolean): string {
  if (!hasItems(game)) { const v = vehicleFor(game, vehicle); return v === "any" ? "any machine" : vehicleLabel(v); }
  return [twoSpeeds ? `${cc}cc` : null, items === "none" ? "no mushrooms" : "mushrooms", vehicleFor(game, vehicle) !== "any" ? vehicleLabel(vehicle) : null].filter(Boolean).join(", ");
}

/** A time in a board's top ten is asked for a clip of its last 30 seconds; until a reviewer checks one it shows as Unverified. */
export const TOP_TEN = 10;
/** How long the "add your video" reminder lasts. */
export const VIDEO_DAYS = 14;
