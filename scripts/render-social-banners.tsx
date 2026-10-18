/**
 * Profile banners for GameShuffle's social accounts (YouTube, X, Bluesky,
 * Facebook, Twitch, LinkedIn, Discord), drawn the way the share images are
 * (scripts/render-originals-og.tsx): Gabarito and a Tabler glyph field, with the
 * slogan instead of the wordmark (the profile picture already shows the logo). Each size keeps its words inside the box every platform shows
 * (YouTube's 1546x423 safe area, clear of the profile picture on X and Bluesky,
 * the middle of Facebook's mobile crop). No word may repeat across the lines.
 *
 *   npx tsx scripts/render-social-banners.tsx --preview <dir>                 every style at YouTube + X size, with crop guides
 *   npx tsx scripts/render-social-banners.tsx --out <dir> --style night [--only youtube,x]   upload-ready PNGs in one style
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { ReactNode } from "react";
import { ImageResponse } from "next/dist/compiled/@vercel/og/index.node.js";
import sharp from "sharp";

type Style = "night" | "blue" | "toolkit";
interface Size { id: string; label: string; w: number; h: number; box: [number, number, number, number]; compact?: boolean; noPill?: boolean; boost?: number }

/** Banner sizes (2x where the platform shows them small) and the box the words stay inside. */
const SIZES: Size[] = [
  { id: "youtube", label: "YouTube channel banner", w: 2560, h: 1440, box: [507, 508, 1546, 423] },
  { id: "x", label: "X header", w: 1500, h: 500, box: [430, 46, 1030, 400] },
  { id: "bluesky", label: "Bluesky banner", w: 3000, h: 1000, box: [860, 92, 2060, 800] },
  { id: "facebook", label: "Facebook cover", w: 1702, h: 630, box: [291, 56, 1120, 518] },
  { id: "twitch", label: "Twitch profile banner", w: 1200, h: 480, box: [100, 50, 1000, 380] },
  { id: "linkedin", label: "LinkedIn page cover", w: 2256, h: 382, box: [560, 36, 1640, 310], noPill: true, boost: 1.3 },
  { id: "discord", label: "Discord server banner", w: 960, h: 540, box: [80, 110, 800, 320], compact: true },
];

const HEADLINE = "Shuffle up your game night";
const SUB = "Randomizers, daily puzzles, tournaments and trivia";
const CHIPS: [string, string][] = [["Dice5", "Randomizers"], ["LayoutGrid", "Daily puzzles"], ["Tournament", "Tournaments"], ["Bulb", "Trivia"]];
const GLYPHS = ["Dice5", "DeviceGamepad2", "Cards", "Puzzle", "Star", "Trophy", "SteeringWheel", "Pokeball"];
const TILES: { colors: [string, string]; icon: string }[] = [
  { colors: ["#1f1760", "#5a3fd6"], icon: "LayoutGrid" },
  { colors: ["#a3301b", "#e8a21c"], icon: "Pokeball" },
  { colors: ["#083f3b", "#169a85"], icon: "Trophy" },
  { colors: ["#0b3a6e", "#2f9be6"], icon: "Dice5" },
];

const gabarito = readFileSync("src/app/fonts/gabarito-bold.ttf");
const outfit = readFileSync("src/app/fonts/outfit-medium.ttf");
const ICONS = "node_modules/@tabler/icons-react/dist/esm/icons";

function iconPaths(name: string): string[] {
  const src = readFileSync(path.join(ICONS, `Icon${name}.mjs`), "utf8");
  const paths = [...src.matchAll(/\["path", \{ "d": "([^"]+)"/g)].map((m) => m[1]);
  if (!paths.length) throw new Error(`Icon${name} has no paths`);
  return paths;
}
const iconSvg = (name: string, color: string, px: number) =>
  `data:image/svg+xml;base64,${Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${iconPaths(name).map((d) => `<path d="${d}"/>`).join("")}</svg>`).toString("base64")}`;

/** The staggered glyph field, sized to the banner (cells scale with its height). */
function glyphField(w: number, h: number, opacity: number): string {
  const icons = GLYPHS.map(iconPaths);
  const cell = Math.max(70, h * 0.16), size = cell * 0.44;
  let body = "";
  for (let row = 0, y = cell * 0.2; y < h; row++, y += cell * 0.82) {
    for (let col = 0, x = row % 2 ? cell / 2 : 0; x < w; col++, x += cell) {
      const p = icons[(row * 3 + col) % icons.length];
      body += `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${(size / 24).toFixed(3)})">${p.map((d) => `<path d="${d}"/>`).join("")}</g>`;
    }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><g fill="none" stroke="#ffffff" stroke-opacity="${opacity}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${body}</g></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

function checkWords() {
  const words = (t: string) => t.toLowerCase().split(/[^a-z0-9]+/).filter((x) => x.length > 2);
  const lines = [["slogan", HEADLINE], ["sub", SUB], ...CHIPS.map(([, l]) => ["chip", l])];
  const seen = new Map<string, string>();
  for (const [where, text] of lines) for (const w of words(text)) {
    // A chip may repeat a word from the sub line it replaces; nothing else may repeat.
    const before = seen.get(w);
    if (before && !(where === "chip" && before === "sub") && !(where === "chip" && before === "chip")) throw new Error(`"${w}" appears in both the ${before} and the ${where}`);
    if (!before) seen.set(w, where);
  }
}

function Ground({ style, w, h }: { style: Style; w: number; h: number }): ReactNode {
  const r = Math.max(w, h);
  if (style === "blue") return (
    <div style={{ position: "absolute", top: 0, left: 0, width: w, height: h, display: "flex", backgroundImage: "linear-gradient(135deg, #1b3db0, #2f66ec 48%, #4b5cf5)" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={glyphField(w, h, 0.12)} width={w} height={h} style={{ position: "absolute", top: 0, left: 0 }} alt="" />
    </div>
  );
  // The hero's two auroras as an SVG (CSS radial gradients on divs drew hard edges in the renderer).
  const glow = (id: string, color: string, a: number) => `<radialGradient id="${id}"><stop offset="0" stop-color="${color}" stop-opacity="${a}"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></radialGradient>`;
  const glows = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><defs>${glow("b", "#608cff", 0.34)}${glow("v", "#c949e9", 0.26)}</defs>`
    + `<circle cx="${r * 0.22}" cy="${-r * 0.04}" r="${r * 0.42}" fill="url(#b)"/><circle cx="${w - r * 0.18}" cy="${h + r * 0.06}" r="${r * 0.42}" fill="url(#v)"/></svg>`;
  return (
    <div style={{ position: "absolute", top: 0, left: 0, width: w, height: h, display: "flex", backgroundImage: "radial-gradient(125% 140% at 50% -20%, #1c1e5f 0%, #0b0d14 64%)" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`data:image/svg+xml;base64,${Buffer.from(glows).toString("base64")}`} width={w} height={h} style={{ position: "absolute", top: 0, left: 0 }} alt="" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={glyphField(w, h, 0.09)} width={w} height={h} style={{ position: "absolute", top: 0, left: 0 }} alt="" />
    </div>
  );
}

function Pill({ font }: { font: number }): ReactNode {
  return <div style={{ display: "flex", padding: `${font * 0.42}px ${font * 1.1}px`, borderRadius: 999, background: "#ffffff", color: "#141a4a", fontFamily: "Gabarito", fontSize: font, boxShadow: `0 ${font * 0.3}px ${font}px rgba(0,0,0,0.3)` }}>gameshuffle.co</div>;
}

/** The slogan and the sub line (or chips), stacked and centred in the box. */
function Stack({ s, style, width }: { s: Size; style: Style; width: number }): ReactNode {
  // A short, wide banner (LinkedIn) shows small, so its words get a boost.
  const H = s.box[3], k = s.boost ?? 1;
  const head = Math.min(H * (s.compact ? 0.3 : 0.24) * k, width / 13.5);
  const sub = Math.min(H * 0.078 * k, width / 27);
  const chip = Math.min(H * 0.064, width / 34);
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", color: "#ffffff", width }}>
      <div style={{ fontFamily: "Gabarito", fontSize: head, lineHeight: 1.05, letterSpacing: -head * 0.02 }}>{HEADLINE}</div>
      {!s.compact && style !== "toolkit" && <div style={{ fontFamily: "Outfit", fontSize: sub, lineHeight: 1.25, marginTop: H * 0.035, color: "#d6d9f6" }}>{SUB}</div>}
      {!s.compact && style === "toolkit" && (
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: chip * 0.55, marginTop: H * 0.055 }}>
          {CHIPS.map(([icon, label]) => (
            <div key={label} style={{ display: "flex", alignItems: "center", gap: chip * 0.45, padding: `${chip * 0.42}px ${chip * 0.8}px`, borderRadius: 999, background: "rgba(255,255,255,0.1)", border: `${Math.max(1, chip * 0.06)}px solid rgba(255,255,255,0.24)`, fontFamily: "Outfit", fontSize: chip, color: "#ffffff" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={iconSvg(icon, "#ffffff", Math.round(chip * 1.2))} width={chip * 1.2} height={chip * 1.2} alt="" />
              {label}
            </div>
          ))}
        </div>
      )}
      {!s.compact && !s.noPill && style !== "toolkit" && <div style={{ display: "flex", marginTop: H * 0.06 }}><Pill font={H * 0.056} /></div>}
    </div>
  );
}

function Banner({ s, style }: { s: Size; style: Style }): ReactNode {
  const [bx, by, bw, bh] = s.box;
  const tiles = style === "blue" && !s.compact;
  const tile = Math.min(bh * 0.44, bw * 0.17);
  const textW = tiles ? bw - tile * 2 - tile * 0.5 : bw;
  return (
    <div style={{ width: s.w, height: s.h, display: "flex", position: "relative" }}>
      <Ground style={style} w={s.w} h={s.h} />
      <div style={{ position: "absolute", left: bx, top: by, width: bw, height: bh, display: "flex", alignItems: "center", justifyContent: "center", gap: tile * 0.5 }}>
        <Stack s={s} style={style} width={textW} />
        {tiles && (
          <div style={{ display: "flex", flexWrap: "wrap", width: tile * 2 + tile * 0.12, gap: tile * 0.12 }}>
            {TILES.map((t, i) => (
              <div key={i} style={{ width: tile, height: tile, borderRadius: tile * 0.21, display: "flex", alignItems: "center", justifyContent: "center", backgroundImage: `linear-gradient(135deg, ${t.colors[0]}, ${t.colors[1]})`, border: `${Math.max(2, tile * 0.02)}px solid rgba(255,255,255,0.35)`, boxShadow: `0 ${tile * 0.07}px ${tile * 0.18}px rgba(0,0,0,0.25)` }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={iconSvg(t.icon, "#ffffff", Math.round(tile * 0.48))} width={tile * 0.48} height={tile * 0.48} alt="" />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

async function render(s: Size, style: Style): Promise<Buffer> {
  const img = new ImageResponse(<Banner s={s} style={style} />, {
    width: s.w, height: s.h,
    fonts: [{ name: "Gabarito", data: gabarito, weight: 700, style: "normal" }, { name: "Outfit", data: outfit, weight: 500, style: "normal" }],
  });
  return Buffer.from(await img.arrayBuffer());
}

/** Crop guides for the previews only: YouTube's safe area and desktop band, X's profile picture. */
function guides(s: Size): Buffer {
  const dash = `stroke="#ffe066" stroke-width="${Math.round(s.w / 600)}" stroke-dasharray="${s.w / 120} ${s.w / 200}" fill="none"`;
  const label = (x: number, y: number, t: string) => `<text x="${x}" y="${y}" fill="#ffe066" font-family="Helvetica, Arial, sans-serif" font-size="${Math.round(s.w / 70)}" font-weight="700">${t}</text>`;
  let body = "";
  if (s.id === "youtube") {
    const [x, y, w, h] = s.box;
    body += `<rect x="0" y="${y}" width="${s.w}" height="${h}" ${dash} opacity="0.55"/>` + label(24, y - 16, "Desktop shows this band");
    body += `<rect x="${x}" y="${y}" width="${w}" height="${h}" ${dash}/>` + label(x + 12, y + h + s.w / 55, "Phones show only this box");
    body += label(24, s.w / 40, "TVs show the whole picture");
  }
  if (s.id === "x" || s.id === "bluesky") {
    const r = s.w * 0.11, cx = s.w * 0.025 + r;
    body += `<circle cx="${cx}" cy="${s.h}" r="${r}" fill="rgba(255,255,255,0.18)" stroke="#ffe066" stroke-width="${s.w / 400}"/>` + label(cx - r * 0.75, s.h - r * 0.35, "Profile picture");
  }
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${s.w}" height="${s.h}">${body}</svg>`);
}

(async () => {
  checkWords();
  const args = process.argv.slice(2);
  const arg = (k: string) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
  const preview = arg("--preview"), out = arg("--out");
  if (preview) {
    mkdirSync(preview, { recursive: true });
    for (const style of ["night", "blue", "toolkit"] as Style[]) {
      for (const id of ["youtube", "x"]) {
        const s = SIZES.find((z) => z.id === id)!;
        const png = await render(s, style);
        // sharp resizes before it composites, so draw the guides at full size first.
        const guided = await sharp(png).composite([{ input: guides(s) }]).png().toBuffer();
        const jpg = await sharp(guided).resize({ width: 1600, withoutEnlargement: true }).jpeg({ quality: 84 }).toBuffer();
        writeFileSync(path.join(preview, `${style}-${id}.jpg`), jpg);
        console.log("preview", style, id);
      }
    }
  }
  if (out) {
    const style = (arg("--style") ?? "night") as Style;
    const only = arg("--only")?.split(",");
    mkdirSync(out, { recursive: true });
    for (const s of SIZES.filter((z) => !only || only.includes(z.id))) {
      const png = await render(s, style);
      writeFileSync(path.join(out, `gameshuffle-${s.id}-${s.w}x${s.h}.png`), await sharp(png).png({ compressionLevel: 9 }).toBuffer());
      console.log("rendered", s.label, `${s.w}x${s.h}`);
    }
  }
})().catch((e) => { console.error(e); process.exit(1); });
