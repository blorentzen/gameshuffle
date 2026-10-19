/**
 * Artwork for the Facebook Instant Game's listing (Meta's sizes, checked
 * 2026-10-18 against developers.facebook.com/documentation/games/launch/game-setup
 * and .../reviews/asset-design-guidelines):
 *   icon-800.png              Game icon, 800x800: square, no rounded corners, no border, no text
 *   app-icon-1024.png         Settings ▸ Basic app icon, 1024x1024 (same art)
 *   cover-landscape-1200x630.jpg, cover-square-1080.jpg, banner-1200x400.jpg
 *                             the GameShuffle logo, one short line (no call to action, well
 *                             under 20% text) and a tile in each game's colors
 * The icon is the site's GS badge rebuilt full-bleed from the logo's own vector
 * shapes (the badge only exists as a 500px rounded PNG). No third-party names or
 * art anywhere: Pokémon and Nintendo stay out of the artwork.
 *
 * Meta's older Details page (docs/games/build/instant-games/get-started/app-center,
 * still shown on some dashboards) asks for other sizes, written to art/older-sizes/:
 *   small-icon-16.png, cover-800x150.jpg, cover-1600x300, banner-1200x630 (the dashboard asks 1200x630,
 *   not the doc's 1200x627), splash-750x1334.jpg; the cover and banner also as PNG
 *
 * The dashboard's banner and splash sizes, written to art/banners/ as JPG and PNG:
 *   banner-landscape-1920x1080, banner-portrait-1080x1920, banner-square-1080x1080 (logo, line, tiles)
 *   splash-portrait-1080x1920, splash-landscape-1920x1080 (logo and tiles, shown while the game loads)
 *
 *   npx tsx scripts/render-instant-game-art.tsx    → instant-game/listing/art/
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ImageResponse } from "next/dist/compiled/@vercel/og/index.node.js";
import sharp from "sharp";

const OUT = "instant-game/listing/art";
const font = readFileSync("src/app/fonts/gabarito-bold.ttf");
/** The official white logo, never the name typed out. */
const LOGO = `data:image/svg+xml;base64,${readFileSync("public/images/fg/logos/gameshuffle-wht.svg").toString("base64")}`;
const ICONS = "node_modules/@tabler/icons-react/dist/esm/icons";
const LINE = "Three new puzzles every day";

/** The badge's own gradient (sampled from gs-monogram.png). */
const BADGE: [string, string] = ["#8796ff", "#2d68ec"];
/** One tile per game, in each game's colors (the share images'). */
const GAMES: { colors: [string, string]; icon: string }[] = [
  { colors: ["#1f1760", "#5a3fd6"], icon: "Puzzle" },
  { colors: ["#a3301b", "#e8a21c"], icon: "ListSearch" },
  { colors: ["#4a1243", "#c8447a"], icon: "Brain" },
];

function iconPaths(name: string): string[] {
  const src = readFileSync(path.join(ICONS, `Icon${name}.mjs`), "utf8");
  const paths = [...src.matchAll(/\["path", \{ "d": "([^"]+)"/g)].map((m) => m[1]);
  if (!paths.length) throw new Error(`Icon${name} has no paths`);
  return paths;
}
const iconSvg = (name: string, px: number) =>
  `data:image/svg+xml;base64,${Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${iconPaths(name).map((d) => `<path d="${d}"/>`).join("")}</svg>`).toString("base64")}`;

function glyphField(w: number, h: number, names: string[], opacity = 0.12): string {
  const icons = names.map(iconPaths);
  const cell = 92, size = 40;
  let body = "";
  for (let row = 0, y = 18; y < h; row++, y += cell * 0.82) {
    for (let col = 0, x = row % 2 ? cell / 2 : 0; x < w; col++, x += cell) {
      const p = icons[(row * 3 + col) % icons.length];
      body += `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${size / 24})">${p.map((d) => `<path d="${d}"/>`).join("")}</g>`;
    }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><g fill="none" stroke="#ffffff" stroke-opacity="${opacity}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${body}</g></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}
const FIELD = ["Puzzle", "Brain", "CalendarWeek", "Trophy", "Sparkles", "ListSearch"];

/**
 * The GS badge, full-bleed: the logo SVG's "G" (its 4th shape) and the arrowed
 * "S" of Shuffle (shapes 11 to 13), white on the badge gradient.
 */
async function badge(px: number): Promise<Buffer> {
  const svg = readFileSync("public/images/fg/logos/gameshuffle-primary.svg", "utf8");
  const shapes = [...svg.matchAll(/<path d="([^"]+)"/g)].map((m) => m[1]);
  const G = [shapes[3]], S = [shapes[10], shapes[11], shapes[12]];
  // Each letter's real bounds, from a render of just that letter.
  const bounds = async (ds: string[]) => {
    const one = `<svg xmlns="http://www.w3.org/2000/svg" width="3829" height="526" viewBox="0 0 3829 526">${ds.map((d) => `<path d="${d}" fill="#000"/>`).join("")}</svg>`;
    const { info } = await sharp(Buffer.from(one)).trim({ threshold: 1 }).toBuffer({ resolveWithObject: true });
    return { x: -(info.trimOffsetLeft ?? 0), y: -(info.trimOffsetTop ?? 0), w: info.width, h: info.height };
  };
  const g = await bounds(G), s = await bounds(S);
  const gap = g.h * 0.06;
  const w = g.w + gap + s.w, h = Math.max(g.h, s.h);
  const k = (px * 0.74) / w;
  const ox = (px - w * k) / 2, oy = (px - h * k) / 2;
  const art = `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 ${px} ${px}">
    <defs><linearGradient id="b" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${BADGE[0]}"/><stop offset="1" stop-color="${BADGE[1]}"/></linearGradient></defs>
    <rect width="${px}" height="${px}" fill="url(#b)"/>
    <g transform="translate(${ox} ${oy + (h - g.h) * k / 2}) scale(${k}) translate(${-g.x} ${-g.y})" fill="#fff">${G.map((d) => `<path d="${d}"/>`).join("")}</g>
    <g transform="translate(${ox + (g.w + gap) * k} ${oy + (h - s.h) * k / 2}) scale(${k}) translate(${-s.x} ${-s.y})" fill="#fff">${S.map((d) => `<path d="${d}"/>`).join("")}</g>
  </svg>`;
  return sharp(Buffer.from(art)).png().toBuffer();
}

function Tiles({ size, gap }: { size: number; gap: number }) {
  return (
    <div style={{ display: "flex", gap }}>
      {GAMES.map((t, i) => (
        <div key={i} style={{ width: size, height: size, borderRadius: size * 0.22, display: "flex", alignItems: "center", justifyContent: "center", backgroundImage: `linear-gradient(135deg, ${t.colors[0]}, ${t.colors[1]})`, border: "3px solid rgba(255,255,255,0.35)", boxShadow: "0 12px 30px rgba(0,0,0,0.25)" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={iconSvg(t.icon, Math.round(size * 0.48))} width={Math.round(size * 0.48)} height={Math.round(size * 0.48)} alt="" />
        </div>
      ))}
    </div>
  );
}

async function frame(w: number, h: number, body: React.ReactNode): Promise<Buffer> {
  const img = new ImageResponse(
    (
      <div style={{ width: w, height: h, display: "flex", position: "relative", fontFamily: "Gabarito", backgroundImage: "linear-gradient(135deg, #1b3db0, #2f66ec 48%, #4b5cf5)" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={glyphField(w, h, FIELD)} width={w} height={h} style={{ position: "absolute", top: 0, left: 0 }} alt="" />
        <div style={{ position: "absolute", top: 0, left: 0, width: w, height: h, display: "flex" }}>{body}</div>
      </div>
    ),
    { width: w, height: h, fonts: [{ name: "Gabarito", data: font, weight: 700, style: "normal" }] },
  );
  return sharp(Buffer.from(await img.arrayBuffer())).jpeg({ quality: 90 }).toBuffer();
}

(async () => {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(path.join(OUT, "icon-800.png"), await badge(800));
  writeFileSync(path.join(OUT, "app-icon-1024.png"), await badge(1024));

  // Landscape: logo and line on the left, the three games on the right, inside the 1000x500 safe zone.
  writeFileSync(path.join(OUT, "cover-landscape-1200x630.jpg"), await frame(1200, 630, (
    <div style={{ display: "flex", width: "100%", alignItems: "center", justifyContent: "space-between", padding: "0 120px" }}>
      <div style={{ display: "flex", flexDirection: "column", color: "#fff", width: 520 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={LOGO} width={470} height={65} style={{ objectFit: "contain", objectPosition: "left" }} alt="" />
        <div style={{ fontSize: 37, lineHeight: 1.2, marginTop: 26, opacity: 0.95, whiteSpace: "nowrap" }}>{LINE}</div>
      </div>
      <Tiles size={112} gap={16} />
    </div>
  )));

  // Square: recomposed, logo over the tiles over the line.
  writeFileSync(path.join(OUT, "cover-square-1080.jpg"), await frame(1080, 1080, (
    <div style={{ display: "flex", flexDirection: "column", width: "100%", alignItems: "center", justifyContent: "center", gap: 70, color: "#fff" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={LOGO} width={720} height={99} style={{ objectFit: "contain" }} alt="" />
      <Tiles size={200} gap={30} />
      <div style={{ fontSize: 54, opacity: 0.95 }}>{LINE}</div>
    </div>
  )));

  // Banner: everything centred, since its edges may be cropped.
  writeFileSync(path.join(OUT, "banner-1200x400.jpg"), await frame(1200, 400, (
    <div style={{ display: "flex", width: "100%", alignItems: "center", justifyContent: "center", gap: 64 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={LOGO} width={420} height={58} style={{ objectFit: "contain" }} alt="" />
      <Tiles size={104} gap={16} />
    </div>
  )));
  // The older Details page's sizes.
  const OLD = path.join(OUT, "older-sizes");
  mkdirSync(OLD, { recursive: true });
  writeFileSync(path.join(OLD, "small-icon-16.png"), await sharp(await badge(800)).resize(16, 16).png().toBuffer());
  writeFileSync(path.join(OLD, "cover-800x150.jpg"), await frame(800, 150, (
    <div style={{ display: "flex", width: "100%", alignItems: "center", justifyContent: "center", gap: 36 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={LOGO} width={300} height={41} style={{ objectFit: "contain" }} alt="" />
      <Tiles size={62} gap={10} />
    </div>
  )));
  const cover1600 = await frame(1600, 300, (
    <div style={{ display: "flex", width: "100%", alignItems: "center", justifyContent: "center", gap: 90 }}>
      <div style={{ display: "flex", flexDirection: "column", color: "#fff" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={LOGO} width={440} height={61} style={{ objectFit: "contain", objectPosition: "left" }} alt="" />
        <div style={{ fontSize: 34, lineHeight: 1.2, marginTop: 18, opacity: 0.95, whiteSpace: "nowrap" }}>{LINE}</div>
      </div>
      <Tiles size={112} gap={18} />
    </div>
  ));
  writeFileSync(path.join(OLD, "cover-1600x300.jpg"), cover1600);
  writeFileSync(path.join(OLD, "cover-1600x300.png"), await sharp(cover1600).png().toBuffer());
  const banner630 = await frame(1200, 630, (
    <div style={{ display: "flex", width: "100%", alignItems: "center", justifyContent: "space-between", padding: "0 120px" }}>
      <div style={{ display: "flex", flexDirection: "column", color: "#fff", width: 520 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={LOGO} width={470} height={65} style={{ objectFit: "contain", objectPosition: "left" }} alt="" />
        <div style={{ fontSize: 37, lineHeight: 1.2, marginTop: 26, opacity: 0.95, whiteSpace: "nowrap" }}>{LINE}</div>
      </div>
      <Tiles size={112} gap={16} />
    </div>
  ));
  writeFileSync(path.join(OLD, "banner-1200x630.jpg"), banner630);
  writeFileSync(path.join(OLD, "banner-1200x630.png"), await sharp(banner630).png().toBuffer());
  writeFileSync(path.join(OLD, "splash-750x1334.jpg"), await frame(750, 1334, (
    <div style={{ display: "flex", flexDirection: "column", width: "100%", alignItems: "center", justifyContent: "center", gap: 64, color: "#fff" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={LOGO} width={560} height={77} style={{ objectFit: "contain" }} alt="" />
      <Tiles size={160} gap={24} />
      <div style={{ fontSize: 44, opacity: 0.95 }}>{LINE}</div>
    </div>
  )));
  // Banners and splash screens at the dashboard's sizes.
  const BAN = path.join(OUT, "banners");
  mkdirSync(BAN, { recursive: true });
  const shapes: { name: string; w: number; h: number; line: boolean }[] = [
    { name: "banner-landscape-1920x1080", w: 1920, h: 1080, line: true },
    { name: "banner-portrait-1080x1920", w: 1080, h: 1920, line: true },
    { name: "banner-square-1080x1080", w: 1080, h: 1080, line: true },
    { name: "splash-portrait-1080x1920", w: 1080, h: 1920, line: false },
    { name: "splash-landscape-1920x1080", w: 1920, h: 1080, line: false },
  ];
  for (const sh of shapes) {
    const wide = sh.w > sh.h;
    const logoW = wide ? (sh.line ? 760 : 820) : sh.h > sh.w ? 820 : 720;
    const tile = wide ? (sh.line ? 190 : 200) : sh.h > sh.w ? 240 : 200;
    const body = wide && sh.line ? (
      <div style={{ display: "flex", width: "100%", alignItems: "center", justifyContent: "center", gap: 120 }}>
        <div style={{ display: "flex", flexDirection: "column", color: "#fff" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={LOGO} width={logoW} height={Math.round(logoW * 0.138)} style={{ objectFit: "contain", objectPosition: "left" }} alt="" />
          <div style={{ fontSize: 58, lineHeight: 1.2, marginTop: 30, opacity: 0.95, whiteSpace: "nowrap" }}>{LINE}</div>
        </div>
        <Tiles size={tile} gap={28} />
      </div>
    ) : (
      <div style={{ display: "flex", flexDirection: "column", width: "100%", alignItems: "center", justifyContent: "center", gap: sh.h > sh.w ? 100 : 70, color: "#fff" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={LOGO} width={logoW} height={Math.round(logoW * 0.138)} style={{ objectFit: "contain" }} alt="" />
        <Tiles size={tile} gap={Math.round(tile * 0.15)} />
        {sh.line ? <div style={{ fontSize: sh.h > sh.w ? 64 : 54, opacity: 0.95, whiteSpace: "nowrap" }}>{LINE}</div> : null}
      </div>
    );
    const jpg = await frame(sh.w, sh.h, body);
    writeFileSync(path.join(BAN, `${sh.name}.jpg`), jpg);
    // A 256-colour PNG keeps the big sizes under Meta's 1 MB limit.
    writeFileSync(path.join(BAN, `${sh.name}.png`), await sharp(jpg).png({ palette: true, colours: 256, dither: 1, compressionLevel: 9 }).toBuffer());
  }
  console.log(`rendered ${OUT}`);
})().catch((e) => { console.error(e); process.exit(1); });
