/**
 * MKWorld knockout rally registry — derived from the canonical game data in
 * `src/data/mkworld-data.json` (`knockoutRallies`). Single source of truth:
 * add a rally to the JSON and it flows here automatically. The `id` is the
 * slugified name (lowercased, spaces → hyphens). Rallies are a separate roll
 * path from race tracks; the picks/bans editor surfaces them via a
 * Tracks/Rallies toggle inside the Tracks pool.
 */

import mkworldData from "@/data/mkworld-data.json";
import type { Rally } from "../types";

export const MKWORLD_RALLIES: Rally[] = mkworldData.knockoutRallies.map(
  (r): Rally => ({
    id: r.name.toLowerCase().replace(/\s+/g, "-"),
    name: r.name,
    image: r.img,
    game: "mkworld",
  }),
);
