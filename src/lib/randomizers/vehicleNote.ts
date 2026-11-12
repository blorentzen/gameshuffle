import type { Vehicle } from "@/data/types";

/**
 * Mario Kart Wii's line under a rolled vehicle: its size class and type, and a bike's drift ("Large bike, inside
 * drift", "Small kart"). Null for a vehicle without a type (other games, or a combo saved before it had one). Pure,
 * client-safe: the player card, chat rolls and the space's rolls all use it.
 */
export function vehicleNoteText(v: Pick<Vehicle, "type" | "size" | "drift"> | null | undefined): string | null {
  if (!v?.type) return null;
  const what = v.size ? `${v.size} ${v.type.toLowerCase()}` : v.type;
  return v.drift ? `${what}, ${v.drift.toLowerCase()} drift` : what;
}
