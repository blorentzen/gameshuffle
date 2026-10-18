/**
 * Share images (1200x630) for GameShuffle's own games: each game keeps the
 * site's frame (the GameShuffle logo, Gabarito, a Tabler glyph field) but
 * has its own colors and a motif from the game itself, so a link preview says
 * which game it is at a glance. No word may repeat across the three lines.
 *
 *   npx tsx scripts/render-originals-og.tsx                  writes each game's route files
 *   npx tsx scripts/render-originals-og.tsx --preview <dir>  writes <dir>/<slug>.jpg only
 *   npx tsx scripts/render-originals-og.tsx --only daily-dex
 *   npx tsx scripts/render-originals-og.tsx --only home      the site-wide image
 *
 * Route files: src/app/<route>/opengraph-image.jpg + twitter-image.jpg. The
 * homepage's (also every page's default) is public/images/opengraph/gameshuffle-main-og.jpg:
 * the logo, what's on the site, and the games' colors side by side.
 * Pokémon: type colors and our own icons only, never art (the imagery rule).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { ReactNode } from "react";
import { ImageResponse } from "next/dist/compiled/@vercel/og/index.node.js";
import sharp from "sharp";

type Motif = "grid" | "dex" | "podium" | "board";
interface Spec { slug: string; route: string; title: string; /** "" = no line under the title. */ sub: string; colors: [string, string]; glyphs: string[]; motif: Motif }

const SPECS: Spec[] = [
  { slug: "daily", route: "daily", title: "Guess today's character", sub: "A new Nintendo puzzle every day", colors: ["#1f1760", "#5a3fd6"], glyphs: ["Star", "SteeringWheel", "Mushroom", "QuestionMark", "Flame"], motif: "grid" },
  { slug: "daily-dex", route: "daily-dex", title: "Guess today's Pokémon", sub: "", colors: ["#a3301b", "#e8a21c"], glyphs: ["Pokeball", "Bolt", "Flame", "Droplet", "Leaf"], motif: "dex" },
  { slug: "weekly", route: "weekly", title: "The Weekly Challenge", sub: "Guess what everyone said", colors: ["#083f3b", "#169a85"], glyphs: ["Trophy", "ListNumbers", "UsersGroup", "CalendarWeek", "Award"], motif: "podium" },
  { slug: "chat-brain", route: "chat-brain", title: "Chat Brain", sub: "Name the top answers", colors: ["#4a1243", "#c8447a"], glyphs: ["Brain", "Messages", "ChartBar", "Users", "Bulb"], motif: "board" },
];

const font = readFileSync("src/app/fonts/gabarito-bold.ttf");
/** The official white logo (public/images/fg/logos), never the name typed out. */
const LOGO = `data:image/svg+xml;base64,${readFileSync("public/images/fg/logos/gameshuffle-wht.svg").toString("base64")}`;
const ICONS = "node_modules/@tabler/icons-react/dist/esm/icons";

/** A Tabler outline icon's path data, read from its module. */
function iconPaths(name: string): string[] {
  const src = readFileSync(path.join(ICONS, `Icon${name}.mjs`), "utf8");
  const paths = [...src.matchAll(/\["path", \{ "d": "([^"]+)"/g)].map((m) => m[1]);
  if (!paths.length) throw new Error(`Icon${name} has no paths`);
  return paths;
}

/** The staggered glyph field behind the text, as an SVG data URL. */
function glyphField(names: string[], opacity = 0.13): string {
  const icons = names.map(iconPaths);
  const cell = 92, size = 40;
  let body = "";
  for (let row = 0, y = 18; y < 630; row++, y += cell * 0.82) {
    for (let col = 0, x = row % 2 ? cell / 2 : 0; x < 1200; col++, x += cell) {
      const p = icons[(row * 3 + col) % icons.length];
      body += `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${size / 24})">${p.map((d) => `<path d="${d}"/>`).join("")}</g>`;
    }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630"><g fill="none" stroke="#ffffff" stroke-opacity="${opacity}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${body}</g></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

const iconSvg = (name: string, color = "#fff", px = 34) =>
  `data:image/svg+xml;base64,${Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${iconPaths(name).map((d) => `<path d="${d}"/>`).join("")}</svg>`).toString("base64")}`;

const GREEN = "#2f9a5c", YELLOW = "#e2a336", BLANK = "rgba(255,255,255,0.14)";

/** The guess grid: rows of match / close / miss squares, solved on the last row. */
function Grid(): ReactNode {
  const rows = [
    [BLANK, BLANK, YELLOW, BLANK, BLANK],
    [YELLOW, BLANK, GREEN, BLANK, YELLOW],
    [GREEN, YELLOW, GREEN, BLANK, GREEN],
    [GREEN, GREEN, GREEN, GREEN, GREEN],
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {rows.map((r, i) => (
        <div key={i} style={{ display: "flex", gap: 12 }}>
          {r.map((c, j) => <div key={j} style={{ width: 58, height: 58, borderRadius: 12, background: c, border: c === BLANK ? "2px solid rgba(255,255,255,0.28)" : "2px solid rgba(255,255,255,0.0)" }} />)}
        </div>
      ))}
    </div>
  );
}

/** Type tiles (our type colors and icons) over the last chance's letter squares. */
function Dex(): ReactNode {
  const tiles: [string, string][] = [["#3a8f45", "Leaf"], ["#d9502a", "Flame"], ["#2f72d6", "Droplet"], ["#e3b000", "Bolt"], ["#c8447a", "Eye"]];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 26, alignItems: "flex-start" }}>
      <div style={{ display: "flex", gap: 12 }}>
        {tiles.map(([c, icon], i) => (
          <div key={i} style={{ width: 76, height: 76, borderRadius: 18, background: c, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 6px 16px rgba(0,0,0,0.25)" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={iconSvg(icon, i === 3 ? "#3a2a00" : "#fff", 40)} width={40} height={40} alt="" />
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        {Array.from({ length: 7 }, (_, i) => (
          <div key={i} style={{ width: 54, height: 64, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32, color: "#fff",
            background: i === 0 ? "rgba(47,154,92,0.9)" : "rgba(255,255,255,0.16)", border: "2px solid rgba(255,255,255,0.35)" }}>{i === 0 ? "?" : ""}</div>
        ))}
      </div>
    </div>
  );
}

/** The crowd's top three, answers hidden. */
function Podium(): ReactNode {
  const widths = [320, 250, 180];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {widths.map((w, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 54, height: 54, borderRadius: 27, background: ["#f2c94c", "#d7dde3", "#d6995b"][i], color: "#14302c", fontSize: 30, display: "flex", alignItems: "center", justifyContent: "center" }}>{i + 1}</div>
          <div style={{ width: w, height: 54, borderRadius: 14, background: "rgba(255,255,255,0.18)", border: "2px solid rgba(255,255,255,0.3)", display: "flex", alignItems: "center", paddingLeft: 18, color: "rgba(255,255,255,0.85)", fontSize: 28 }}>? ? ?</div>
        </div>
      ))}
    </div>
  );
}

/** A survey board with its answers still hidden. */
function Board(): ReactNode {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <div key={n} style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: "rgba(255,255,255,0.9)", color: "#4a1243", fontSize: 24, display: "flex", alignItems: "center", justifyContent: "center" }}>{n}</div>
          <div style={{ width: 250, height: 40, borderRadius: 10, background: "rgba(255,255,255,0.16)" }} />
          <div style={{ width: 56, height: 40, borderRadius: 10, background: "rgba(255,255,255,0.28)", color: "#fff", fontSize: 22, display: "flex", alignItems: "center", justifyContent: "center" }}>??</div>
        </div>
      ))}
    </div>
  );
}

const MOTIFS: Record<Motif, () => ReactNode> = { grid: Grid, dex: Dex, podium: Podium, board: Board };

function checkWords(s: Spec) {
  const words = (t: string) => t.toLowerCase().split(/[^a-z0-9é]+/).filter((w) => w.length > 2);
  const seen = new Set(words("GameShuffle"));
  for (const w of [...words(s.title), ...words(s.sub)]) {
    if (seen.has(w)) throw new Error(`${s.slug}: "${w}" repeats across the share image lines`);
    seen.add(w);
  }
}

async function render(s: Spec): Promise<Buffer> {
  checkWords(s);
  const Motif = MOTIFS[s.motif];
  const img = new ImageResponse(
    (
      <div style={{ width: 1200, height: 630, display: "flex", position: "relative", fontFamily: "Gabarito", backgroundImage: `linear-gradient(135deg, ${s.colors[0]}, ${s.colors[1]})` }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={glyphField(s.glyphs)} width={1200} height={630} style={{ position: "absolute", top: 0, left: 0 }} alt="" />
        <div style={{ position: "absolute", top: 0, left: 0, width: 1200, height: 630, display: "flex", alignItems: "center", padding: "0 64px", gap: 40 }}>
          <div style={{ display: "flex", flexDirection: "column", color: "#fff", width: 640 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={LOGO} width={335} height={46} style={{ objectFit: "contain", objectPosition: "left", marginBottom: 8 }} alt="" />
            <div style={{ fontSize: s.title.length > 14 ? 92 : 120, lineHeight: 1.02, letterSpacing: -2.5, marginTop: 10 }}>{s.title}</div>
            {s.sub ? <div style={{ fontSize: 40, marginTop: 20, opacity: 0.92 }}>{s.sub}</div> : null}
          </div>
          <div style={{ display: "flex", flex: 1, justifyContent: "center" }}>
            <div style={{ display: "flex", padding: 22, borderRadius: 24, background: "rgba(0,0,0,0.18)", border: "2px solid rgba(255,255,255,0.14)" }}>{Motif()}</div>
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 630, fonts: [{ name: "Gabarito", data: font, weight: 700, style: "normal" }] },
  );
  return sharp(Buffer.from(await img.arrayBuffer())).jpeg({ quality: 86 }).toBuffer();
}

/** The site-wide image: the logo over the brand blue, with a tile in each game's colors. */
async function renderHome(): Promise<Buffer> {
  const sub = "Randomizers, daily puzzles, tournaments and trivia nights";
  checkWords({ slug: "home", route: "", title: "", sub, colors: ["", ""], glyphs: [], motif: "grid" });
  const tiles: { colors: [string, string]; icon: string }[] = [
    { colors: ["#1f1760", "#5a3fd6"], icon: "LayoutGrid" },
    { colors: ["#a3301b", "#e8a21c"], icon: "Pokeball" },
    { colors: ["#083f3b", "#169a85"], icon: "Trophy" },
    { colors: ["#4a1243", "#c8447a"], icon: "Brain" },
  ];
  const img = new ImageResponse(
    (
      <div style={{ width: 1200, height: 630, display: "flex", position: "relative", fontFamily: "Gabarito", backgroundImage: "linear-gradient(135deg, #1b3db0, #2f66ec 48%, #4b5cf5)" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={glyphField(["Dice5", "DeviceGamepad2", "Cards", "Puzzle", "Star", "Trophy"], 0.12)} width={1200} height={630} style={{ position: "absolute", top: 0, left: 0 }} alt="" />
        <div style={{ position: "absolute", top: 0, left: 0, width: 1200, height: 630, display: "flex", alignItems: "center", padding: "0 70px", gap: 50 }}>
          <div style={{ display: "flex", flexDirection: "column", color: "#fff", width: 640 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={LOGO} width={600} height={98} style={{ objectFit: "contain", objectPosition: "left" }} alt="" />
            <div style={{ fontSize: 46, lineHeight: 1.2, marginTop: 30, opacity: 0.95 }}>{sub}</div>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", width: 340, gap: 20 }}>
            {tiles.map((t, i) => (
              <div key={i} style={{ width: 160, height: 160, borderRadius: 34, display: "flex", alignItems: "center", justifyContent: "center", backgroundImage: `linear-gradient(135deg, ${t.colors[0]}, ${t.colors[1]})`, border: "3px solid rgba(255,255,255,0.35)", boxShadow: "0 12px 30px rgba(0,0,0,0.25)" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={iconSvg(t.icon, "#fff", 76)} width={76} height={76} alt="" />
              </div>
            ))}
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 630, fonts: [{ name: "Gabarito", data: font, weight: 700, style: "normal" }] },
  );
  return sharp(Buffer.from(await img.arrayBuffer())).jpeg({ quality: 86 }).toBuffer();
}

(async () => {
  const args = process.argv.slice(2);
  const previewAt = args.indexOf("--preview");
  const previewDir = previewAt >= 0 ? args[previewAt + 1] : null;
  const onlyAt = args.indexOf("--only");
  const only = onlyAt >= 0 ? args[onlyAt + 1] : null;
  if (!only || only === "home") {
    const jpg = await renderHome();
    if (previewDir) { mkdirSync(previewDir, { recursive: true }); writeFileSync(path.join(previewDir, "home.jpg"), jpg); }
    else writeFileSync("public/images/opengraph/gameshuffle-main-og.jpg", jpg);
    console.log("rendered home");
  }
  for (const s of SPECS.filter((x) => !only || x.slug === only)) {
    const jpg = await render(s);
    if (previewDir) {
      mkdirSync(previewDir, { recursive: true });
      writeFileSync(path.join(previewDir, `${s.slug}.jpg`), jpg);
    } else {
      for (const name of ["opengraph-image.jpg", "twitter-image.jpg"]) writeFileSync(path.join("src/app", s.route, name), jpg);
    }
    console.log("rendered", s.slug);
  }
})().catch((e) => { console.error(e); process.exit(1); });
