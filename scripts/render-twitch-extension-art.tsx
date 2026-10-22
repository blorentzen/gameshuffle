/**
 * Artwork for the Twitch extension's listing (Twitch's sizes, checked
 * 2026-10-20 against dev.twitch.tv/docs/extensions/life-cycle):
 *   logo-100.png          Logo Image, 100x100 PNG (the GS badge; no Twitch logo)
 *   taskbar-24.png        Taskbar Icon Image, 24x24 PNG (video component)
 *   discovery-300x200.png Discovery Image, 300x200 PNG: no transparency, little text
 * The badge comes from the Facebook game's art (instant-game/listing/art/icon-800.png,
 * rebuilt from the logo's own vector shapes by scripts/render-instant-game-art.tsx).
 * Screenshots (1024x768) are filmed from the dev build: see twitch-extension/listing/LISTING.md.
 *
 *   npx tsx scripts/render-twitch-extension-art.tsx    → twitch-extension/listing/art/
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ImageResponse } from "next/dist/compiled/@vercel/og/index.node.js";
import sharp from "sharp";

const OUT = "twitch-extension/listing/art";
const BADGE = "instant-game/listing/art/icon-800.png";
/** The official white logo, never the name typed out. */
const LOGO = `data:image/svg+xml;base64,${readFileSync("public/images/fg/logos/gameshuffle-wht.svg").toString("base64")}`;
const ICONS = "node_modules/@tabler/icons-react/dist/esm/icons";
/** What the card runs: polls, bingo, trivia, break games, Chat Brain, picks. */
const FIELD = ["ChartBar", "Dice5", "Bulb", "Bolt", "Brain", "Trophy"];

function iconPaths(name: string): string[] {
  const src = readFileSync(path.join(ICONS, `Icon${name}.mjs`), "utf8");
  const paths = [...src.matchAll(/\["path", \{ "d": "([^"]+)"/g)].map((m) => m[1]);
  if (!paths.length) throw new Error(`Icon${name} has no paths`);
  return paths;
}

function glyphField(w: number, h: number, names: string[], cell: number, size: number, opacity: number): string {
  const icons = names.map(iconPaths);
  let body = "";
  for (let row = 0, y = 10; y < h; row++, y += cell * 0.82) {
    for (let col = 0, x = row % 2 ? cell / 2 : 0; x < w; col++, x += cell) {
      const p = icons[(row * 3 + col) % icons.length];
      body += `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${size / 24})">${p.map((d) => `<path d="${d}"/>`).join("")}</g>`;
    }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><g fill="none" stroke="#ffffff" stroke-opacity="${opacity}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${body}</g></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

async function discovery(): Promise<Buffer> {
  // Drawn at 2x, then scaled down, so the logo's edges stay clean.
  const w = 600, h = 400;
  const img = new ImageResponse(
    (
      <div style={{ width: w, height: h, display: "flex", position: "relative", backgroundImage: "linear-gradient(135deg, #10163f, #3b2fb0 55%, #6a1fe0)" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={glyphField(w, h, FIELD, 84, 34, 0.16)} width={w} height={h} style={{ position: "absolute", top: 0, left: 0 }} alt="" />
        <div style={{ position: "absolute", top: 0, left: 0, width: w, height: h, display: "flex", alignItems: "center", justifyContent: "center" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={LOGO} width={420} height={58} alt="" />
        </div>
      </div>
    ),
    { width: w, height: h },
  );
  return sharp(Buffer.from(await img.arrayBuffer())).resize(300, 200).flatten({ background: "#10163f" }).png().toBuffer();
}

(async () => {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(path.join(OUT, "logo-100.png"), await sharp(BADGE).resize(100, 100).png().toBuffer());
  writeFileSync(path.join(OUT, "taskbar-24.png"), await sharp(BADGE).resize(24, 24).png().toBuffer());
  writeFileSync(path.join(OUT, "discovery-300x200.png"), await discovery());
  console.log(`wrote ${OUT}: logo-100.png, taskbar-24.png, discovery-300x200.png`);
})().catch((err) => { console.error(err); process.exit(1); });
