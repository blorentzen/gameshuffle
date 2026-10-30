/**
 * Time trial categories (round 2, players' feedback 2026-10-29; supabase/time-trials-m2.sql).
 * Client-safe.
 *
 * Every time is with mushrooms or no mushrooms (the split time trialers care about), at one speed,
 * and may be set with a restricted vehicle. The open board ("any") counts every time, so a Mr. Scooty
 * run also shows there; a vehicle board shows only times set with that vehicle. Vehicle boards are
 * Mario Kart 8 Deluxe only.
 */

import type { TtGame } from "./tracks";

export type TtItems = "shrooms" | "none";
export type TtVehicle = "any" | "inside_drift" | "scooty" | "teddy";

export const ITEMS: { id: TtItems; label: string; short: string }[] = [
  { id: "shrooms", label: "Mushrooms", short: "Mushrooms" },
  { id: "none", label: "No mushrooms", short: "No mushrooms" },
];

export const VEHICLES: { id: TtVehicle; label: string; long: string }[] = [
  { id: "any", label: "Any", long: "Any vehicle" },
  { id: "inside_drift", label: "Inside drift", long: "Inside drift bike" },
  { id: "scooty", label: "Mr. Scooty", long: "Mr. Scooty" },
  { id: "teddy", label: "Teddy Buggy", long: "Teddy Buggy" },
];

export function isItems(v: unknown): v is TtItems {
  return v === "shrooms" || v === "none";
}
export function isVehicle(v: unknown): v is TtVehicle {
  return v === "any" || v === "inside_drift" || v === "scooty" || v === "teddy";
}
/** Vehicle boards a game has (only "any" outside Mario Kart 8 Deluxe). */
export function vehiclesFor(game: TtGame): TtVehicle[] {
  return game === "mk8dx" ? VEHICLES.map((v) => v.id) : ["any"];
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
  const v = isVehicle(sp.vehicle) && vehiclesFor(game).includes(sp.vehicle) ? sp.vehicle : "any";
  return { items, vehicle: v };
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
  return [twoSpeeds ? `${cc}cc` : null, items === "none" ? "no mushrooms" : "mushrooms", vehicle !== "any" && game === "mk8dx" ? vehicleLabel(vehicle) : null].filter(Boolean).join(", ");
}

/** A time in a board's top ten is asked for a clip of its last 30 seconds; until a reviewer checks one it shows as Unverified. */
export const TOP_TEN = 10;
/** How long the "add your video" reminder lasts. */
export const VIDEO_DAYS = 14;
