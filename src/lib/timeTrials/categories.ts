/**
 * Time trial categories (round 2, players' feedback 2026-10-29; supabase/time-trials-m2.sql).
 * Client-safe.
 *
 * Every time is with mushrooms or no mushrooms (the split time trialers care about), at one speed,
 * and may be set with a restricted vehicle. The open board ("any") counts every time, so a Mr. Scooty
 * run also shows there; a vehicle board shows only times set with that vehicle, except Inside drift, which
 * also counts Yoshi Bike times (it's an inside-drift bike; round 3 pick 4A). Mario Kart World has a
 * R.O.B.-HOG board (round 3 pick 5A, the "meta combo"); its other vehicles open once players ask.
 */

import type { TtGame } from "./tracks";

export type TtItems = "shrooms" | "none";
export type TtVehicle = "any" | "inside_drift" | "scooty" | "teddy" | "biddybuggy" | "yoshi_bike" | "rob_hog";

export const ITEMS: { id: TtItems; label: string; short: string }[] = [
  { id: "shrooms", label: "Mushrooms", short: "Mushrooms" },
  { id: "none", label: "No mushrooms", short: "No mushrooms" },
];

/** `retired`: kept for times already saved with it, never offered (players' feedback 2026-11-04: Yoshi Bike folds into
 *  Inside drift, where its times already counted; the World board is named for both karts that share it). */
export const VEHICLES: { id: TtVehicle; label: string; long: string; games: TtGame[]; retired?: boolean }[] = [
  { id: "any", label: "Any", long: "Any vehicle", games: ["mk8dx", "mkworld"] },
  { id: "inside_drift", label: "Inside drift", long: "Inside drift bike", games: ["mk8dx"] },
  { id: "yoshi_bike", label: "Yoshi Bike", long: "Yoshi Bike", games: ["mk8dx"], retired: true },
  { id: "teddy", label: "Teddy Buggy", long: "Teddy Buggy", games: ["mk8dx"] },
  { id: "biddybuggy", label: "Biddybuggy", long: "Biddybuggy", games: ["mk8dx"] },
  { id: "scooty", label: "Mr. Scooty", long: "Mr. Scooty", games: ["mk8dx"] },
  { id: "rob_hog", label: "Swoop, R.O.B.-HOG", long: "Swoop, R.O.B.-HOG", games: ["mkworld"] },
];

export function isItems(v: unknown): v is TtItems {
  return v === "shrooms" || v === "none";
}
export function isVehicle(v: unknown): v is TtVehicle {
  return VEHICLES.some((x) => x.id === v);
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
/** Whether a time set with `vehicle` counts on board `board` (the database's tt_on_board). */
export function onBoard(board: TtVehicle, vehicle: TtVehicle): boolean {
  return board === "any" || board === vehicle || (board === "inside_drift" && vehicle === "yoshi_bike");
}
/** The boards a time counts on: the open board and its vehicle's (a Yoshi Bike time is on Inside drift). */
export function boardsFor(game: TtGame, vehicle: TtVehicle): TtVehicle[] {
  const v = vehicleFor(game, vehicle);
  return v === "any" ? ["any"] : ["any", v];
}
export function itemsLabel(items: TtItems): string {
  return ITEMS.find((i) => i.id === items)!.label;
}
export function vehicleLabel(v: TtVehicle): string {
  return VEHICLES.find((x) => x.id === v)!.label;
}

/** Items and vehicle from a page's search params, with the defaults when missing or not for this game. */
export function readCategory(game: TtGame, sp: { items?: string | null; vehicle?: string | null }): { items: TtItems; vehicle: TtVehicle } {
  const items = isItems(sp.items) ? sp.items : "shrooms";
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

/** "150cc, no mushrooms, Mr. Scooty" (the speed only when the game has two). */
export function categoryText(game: TtGame, cc: number, items: TtItems, vehicle: TtVehicle, twoSpeeds: boolean): string {
  return [twoSpeeds ? `${cc}cc` : null, items === "none" ? "no mushrooms" : "mushrooms", vehicleFor(game, vehicle) !== "any" ? vehicleLabel(vehicle) : null].filter(Boolean).join(", ");
}

/** A time in a board's top ten is asked for a clip of its last 30 seconds; until a reviewer checks one it shows as Unverified. */
export const TOP_TEN = 10;
/** How long the "add your video" reminder lasts. */
export const VIDEO_DAYS = 14;
