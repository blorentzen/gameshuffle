/**
 * MKWorld knockout rally registry — 10 rallies. Sourced from
 * `src/data/mkworld-data.json` (`knockoutRallies`). Rallies are a
 * separate roll path from race tracks; the picks/bans editor surfaces
 * them via a Tracks/Rallies toggle inside the Tracks pool.
 */

import type { Rally } from "../types";

const RALLY_CDN = "https://cdn.empac.co/gameshuffle/images/mkworld/knockout";

export const MKWORLD_RALLIES: Rally[] = [
  { id: "acorn-rally", name: "Acorn Rally", image: `${RALLY_CDN}/Acorn_Rally.png`, game: "mkworld" },
  { id: "boomerang-rally", name: "Boomerang Rally", image: `${RALLY_CDN}/Boomerang-Rally.webp`, game: "mkworld" },
  { id: "cherry-rally", name: "Cherry Rally", image: `${RALLY_CDN}/Cherry_Rally.png`, game: "mkworld" },
  { id: "cloud-rally", name: "Cloud Rally", image: `${RALLY_CDN}/Cloud_Rally.png`, game: "mkworld" },
  { id: "drill-rally", name: "Drill Rally", image: `${RALLY_CDN}/Drill-Rally.webp`, game: "mkworld" },
  { id: "golden-rally", name: "Golden Rally", image: `${RALLY_CDN}/Golden_Rally.png`, game: "mkworld" },
  { id: "heart-rally", name: "Heart Rally", image: `${RALLY_CDN}/Heart_Rally.png`, game: "mkworld" },
  { id: "ice-rally", name: "Ice Rally", image: `${RALLY_CDN}/Ice_Rally.png`, game: "mkworld" },
  { id: "moon-rally", name: "Moon Rally", image: `${RALLY_CDN}/Moon_Rally.png`, game: "mkworld" },
  { id: "spiny-rally", name: "Spiny Rally", image: `${RALLY_CDN}/Spiny_Rally.png`, game: "mkworld" },
];
