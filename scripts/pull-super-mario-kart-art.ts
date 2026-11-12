/**
 * Pulls the Super Mario Kart randomizer's art into public/images/super-mario-kart/ as webp:
 *   characters/<slug>.webp  the official artwork of each driver in their kart, trimmed, white edges made transparent
 *   tracks/<slug>.webp      the in-game lower-screen course maps (256x104 pixel art, drawn at 2x)
 *   battle/<slug>.webp      the in-game lower-screen battle course maps (drawn at 2x)
 *   cups/<slug>.webp        the in-game cup emblems (48x16 pixel art, drawn at 4x)
 *   super-mario-kart-keyart.webp  the official international cover artwork, cropped to 16:9 for headers
 * Sources: scripts/data/super-mario-kart-art.json (Super Mario Wiki file names). Skips files that already exist
 * unless --force. The fetching and shaping is shared: scripts/lib/wiki-art.ts.
 *
 *   npx tsx scripts/pull-super-mario-kart-art.ts [--force] [--only characters|tracks|battle|cups]
 */

import fs from "node:fs";
import path from "node:path";
import { artArgs, pullWikiArt, type ArtManifest } from "./lib/wiki-art";

const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, "data/super-mario-kart-art.json"), "utf8")) as ArtManifest;

void pullWikiArt({
  manifest,
  outDir: path.join(process.cwd(), "public/images/super-mario-kart"),
  groups: [
    ["characters", { kind: "model", w: 320, h: 300 }],
    ["tracks", { kind: "pixel", scale: 2 }],
    ["battle", { kind: "pixel", scale: 2 }],
    ["cups", { kind: "pixel", scale: 4 }],
  ],
  ...artArgs(),
});
