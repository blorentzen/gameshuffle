/**
 * Pulls the Mario Kart 7 randomizer's art into public/images/mario-kart-7/ as webp:
 *   characters/<slug>.webp  the in-game character select icons (64px, drawn at 128)
 *   bodies, tires, gliders  the official artwork of every part, trimmed, white edges made transparent
 *   tracks/<slug>.webp      the in-game course select pictures, 400x240
 *   battle/<slug>.webp      the in-game battle course pictures, 400x240
 *   cups/<slug>.webp        the in-game cup emblems, 128px
 *   mario-kart-7-keyart.webp  the official group artwork on Toad Circuit, cropped to 16:9 for headers
 * Sources: scripts/data/mario-kart-7-art.json (Super Mario Wiki file names). Skips files that already exist unless
 * --force. The fetching and shaping is shared: scripts/lib/wiki-art.ts.
 *
 *   npx tsx scripts/pull-mario-kart-7-art.ts [--force] [--only characters|bodies|tires|gliders|tracks|battle|cups]
 */

import fs from "node:fs";
import path from "node:path";
import { artArgs, pullWikiArt, type ArtManifest } from "./lib/wiki-art";

const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, "data/mario-kart-7-art.json"), "utf8")) as ArtManifest;

void pullWikiArt({
  manifest,
  outDir: path.join(process.cwd(), "public/images/mario-kart-7"),
  groups: [
    ["characters", { kind: "icon", w: 128, h: 128 }],
    ["bodies", { kind: "model", w: 320, h: 260, white: true }],
    ["tires", { kind: "model", w: 240, h: 240, white: true }],
    ["gliders", { kind: "model", w: 320, h: 220, white: true }],
    ["tracks", { kind: "view", w: 400, h: 240 }],
    ["battle", { kind: "view", w: 400, h: 240 }],
    ["cups", { kind: "icon", w: 128, h: 128 }],
  ],
  ...artArgs(),
});
