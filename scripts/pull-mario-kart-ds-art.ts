/**
 * Pulls the Mario Kart DS randomizer's art into public/images/mario-kart-ds/ as webp:
 *   characters/<slug>.webp  the in-game character mugshots (40px pixel art, drawn at 160 with nearest-neighbour)
 *   karts/<slug>.webp       the game's own kart models as rendered from the game data, trimmed, 320px wide
 *   tracks/<slug>.webp      the in-game course icons (74x92 pixel art, drawn at 3x)
 *   battle/<slug>.webp      the in-game battle course icons (107x80 pixel art, drawn at 3x)
 *   cups/<slug>.webp        the in-game cup emblems (48px pixel art, drawn at 3x)
 *   bosses/<slug>.webp      Mission Mode's bosses, the game's own models, trimmed, 320px
 *   mario-kart-ds-keyart.webp  the official group artwork, cropped to 16:9 for headers
 * Sources: scripts/data/mario-kart-ds-art.json (Super Mario Wiki file names). Skips files that already exist unless
 * --force. The fetching and shaping is shared: scripts/lib/wiki-art.ts.
 *
 *   npx tsx scripts/pull-mario-kart-ds-art.ts [--force] [--only characters|karts|tracks|battle|cups|bosses]
 */

import fs from "node:fs";
import path from "node:path";
import { artArgs, pullWikiArt, type ArtManifest } from "./lib/wiki-art";

const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, "data/mario-kart-ds-art.json"), "utf8")) as ArtManifest;

void pullWikiArt({
  manifest,
  outDir: path.join(process.cwd(), "public/images/mario-kart-ds"),
  groups: [
    ["characters", { kind: "pixel", scale: 4 }],
    ["karts", { kind: "model", w: 320, h: 260 }],
    ["tracks", { kind: "pixel", scale: 3 }],
    ["battle", { kind: "pixel", scale: 3 }],
    ["cups", { kind: "pixel", scale: 3 }],
    ["bosses", { kind: "model", w: 320, h: 320 }],
  ],
  ...artArgs(),
});
