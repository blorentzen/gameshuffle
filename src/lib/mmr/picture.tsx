import "server-only";

/**
 * The MMR card as a picture (picks 2026-11-04, 4A to 9A: "a live one or a physical one"). The live card is
 * CSS a server can't run, so this is its own still drawing in the card's look: the same colors, surface,
 * background, emblem, font and pieces, laid out for three sizes (square 1080, wide 1200×630, story
 * 1080×1920). Drawn with next/og like the share cards; the look's font comes from Google Fonts as TTF.
 */

import { ImageResponse } from "next/og";
import sharp from "sharp";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { allowedImageHost, fonts, svgUri } from "@/lib/og/eventCard";
import { GLYPHS, type GlyphName } from "@/lib/og/glyphs";
import { facePng } from "@/lib/discord/faces";
import { flagUrl } from "@/lib/lounge/flags";
import { divisionLook, fontOf, lookVars, type MmrLook } from "./look";
import { emblemSvg } from "./emblemSvg";
import { medalData } from "./medalsServer";
import { MMR_GAMES, fmtMmr, viewOf, type MmrSource, type MmrView } from "./rules";
import { bigOf, pieceOrder, pieceText, type MmrPiece, type Shown } from "./pieces";
import type { GoalProgress } from "./goal";

export type PictureSize = "square" | "wide" | "story";
export const PICTURE_SIZES: Record<PictureSize, [number, number]> = { square: [1080, 1080], wide: [1200, 630], story: [1080, 1920] };
export const isPictureSize = (v: unknown): v is PictureSize => v === "square" || v === "wide" || v === "story";

/** Detail tiles each size has room for. */
const TILES: Record<PictureSize, number> = { square: 6, wide: 4, story: 8 };
/** Pieces in the card's head (the rest are tiles). */
const HEAD: MmrPiece[] = ["name", "cc", "game", "division", "line"];

// ── Fonts ─────────────────────────────────────────────────────────────────

const fontCache = new Map<string, Promise<ArrayBuffer | null>>();

/** A Google font as TTF (asked without a browser's name, Google answers with TrueType files). Cached per process. */
function googleFont(family: string, weight: number, italic: boolean): Promise<ArrayBuffer | null> {
  const key = `${family}|${weight}|${italic}`;
  if (!fontCache.has(key)) {
    const fam = family.trim().split(/\s+/).map(encodeURIComponent).join("+");
    const axis = italic ? `ital,wght@1,${weight}` : `wght@${weight}`;
    const load = (async () => {
      try {
        const css = await fetch(`https://fonts.googleapis.com/css2?family=${fam}:${axis}`, { signal: AbortSignal.timeout(3000) }).then((r) => (r.ok ? r.text() : null));
        const url = css?.match(/src:\s*url\(([^)]+)\)\s*format\(['"](?:truetype|opentype)['"]\)/)?.[1];
        if (!url) return null;
        const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
        return res.ok ? await res.arrayBuffer() : null;
      } catch {
        return null;
      }
    })();
    fontCache.set(key, load);
    // A failed load is tried again next time.
    void load.then((f) => { if (!f) fontCache.delete(key); });
  }
  return fontCache.get(key)!;
}

/** The look's display font for the picture: its family name, weight, style and file (Gabarito when it can't be had). */
async function lookFont(look: MmrLook): Promise<{ name: string; data: ArrayBuffer | Buffer; weight: number; style: "normal" | "italic" }> {
  const [stack, weight, style] = fontOf(look);
  const family = look.font === "google" ? look.fontName.trim() : stack.match(/"([^"]+)"/)?.[1] ?? "";
  if (family && family !== "Gabarito") {
    const data = await googleFont(family, weight, style === "italic");
    if (data) return { name: "CardFont", data, weight, style };
  }
  const [gabarito] = await fonts();
  return { name: "CardFont", data: gabarito, weight: 700, style: "normal" };
}

// ── Colors and background ─────────────────────────────────────────────────

const hexRgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const HEX = /^#[0-9a-f]{6}$/i;
/** `a` mixed into `b` by `t` (CSS color-mix in srgb). */
const mix = (a: string, b: string, t: number) => {
  if (!HEX.test(a) || !HEX.test(b)) return b;
  const [x, y] = [hexRgb(a), hexRgb(b)];
  return "#" + x.map((v, i) => Math.round(v * t + y[i] * (1 - t)).toString(16).padStart(2, "0")).join("");
};

interface Theme { bg: string; ink: string; ink2: string; chip: string; line: string; acc: string; hl: string; hl2: string; g2: string; dtext: string; edge: string; light: boolean }

function themeFor(look: MmrLook, v: MmrView): Theme {
  const div = divisionLook(v.division);
  const vars = lookVars(look, div);
  const light = look.surface === "light" && look.fill !== "picture";
  return {
    // A picture has no see-through: glass draws on the dark surface.
    bg: light ? "#ffffff" : "#11162e",
    ink: light ? "#17172b" : "#ffffff",
    ink2: light ? "#555a6e" : "rgba(255,255,255,0.78)",
    chip: light ? "#eef1f8" : "rgba(255,255,255,0.10)",
    line: light ? "#e2e5ee" : "rgba(255,255,255,0.16)",
    acc: vars["--mmr-acc"], hl: vars["--mmr-hl"], hl2: vars["--mmr-hl2"], g2: vars["--mmr-g2"], dtext: vars["--mmr-dtext"], edge: vars["--mmr-edge"],
    light,
  };
}

const GLYPH_FIELD: GlyphName[] = ["steering-wheel", "flag", "trophy", "flame", "crown", "stopwatch"];

/** The faint glyph field in the surface's own ink. */
function glyphLayer(w: number, h: number, color: string, opacity: number): string {
  let seed = 7;
  const r = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const step = Math.round(Math.max(w, h) / 11);
  const cells: string[] = [];
  for (let y = -step / 2; y < h + step; y += step) {
    for (let x = -step / 2; x < w + step; x += step) {
      const s = step * (0.38 + r() * 0.2);
      const jx = (r() - 0.5) * step * 0.5, jy = (r() - 0.5) * step * 0.5, rot = Math.round((r() - 0.5) * 40);
      const g = GLYPH_FIELD[Math.floor(r() * GLYPH_FIELD.length)];
      cells.push(`<g transform="translate(${(x + jx).toFixed(0)} ${(y + jy).toFixed(0)}) rotate(${rot} ${(s / 2).toFixed(1)} ${(s / 2).toFixed(1)}) scale(${(s / 24).toFixed(3)})">${GLYPHS[g].map((d) => `<path d="${d}"/>`).join("")}</g>`);
    }
  }
  return `<g fill="none" stroke="${color}" stroke-opacity="${opacity}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${cells.join("")}</g>`;
}

/** The look's background as one SVG, following the live card's CSS (mmr-card.css, .mmr-fill-*). */
function backgroundSvg(look: MmrLook, t: Theme, w: number, h: number): string {
  const u = Math.max(w, h) / 100; // one "cqw" of the live card, near enough
  const parts: string[] = [`<rect width="${w}" height="${h}" fill="${t.bg}"/>`];
  const defs: string[] = [];
  const glow = (id: string, cx: number, cy: number, color: string, op: number, stop: number) => {
    defs.push(`<radialGradient id="${id}" gradientUnits="objectBoundingBox" cx="${cx}" cy="${cy}" r="1.15"><stop offset="0" stop-color="${color}" stop-opacity="${op}"/><stop offset="${stop}" stop-color="${color}" stop-opacity="0"/></radialGradient>`);
    parts.push(`<rect width="${w}" height="${h}" fill="url(#${id})"/>`);
  };
  switch (look.fill) {
    case "gradient":
    case "glyphs":
      if (t.light) { glow("a", 0, 0, t.hl, 0.13, 0.62); glow("b", 1, 1, t.hl2, 0.08, 0.6); }
      else { glow("a", 0, 0, t.g2, 0.34, 0.62); glow("b", 1, 1, t.hl2, 0.15, 0.6); }
      if (look.fill === "glyphs") parts.push(glyphLayer(w, h, t.light ? "#17172b" : "#ffffff", t.light ? 0.06 : 0.075));
      break;
    case "stripes": {
      const s = 2.4 * u;
      defs.push(`<pattern id="p" width="${s * 2}" height="${s * 2}" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="${s}" height="${s * 2}" fill="${mix(t.hl, t.bg, t.light ? 0.09 : 0.11)}"/></pattern>`);
      parts.push(`<rect width="${w}" height="${h}" fill="url(#p)"/>`);
      break;
    }
    case "dots": {
      const s = 3.4 * u;
      defs.push(`<pattern id="p" width="${s}" height="${s}" patternUnits="userSpaceOnUse"><circle cx="${s / 2}" cy="${s / 2}" r="${s * 0.24}" fill="${t.hl}" fill-opacity="0.26"/></pattern>`);
      parts.push(`<rect width="${w}" height="${h}" fill="url(#p)"/>`);
      break;
    }
    case "checker": {
      const s = 2 * u;
      defs.push(`<pattern id="p" width="${s * 2}" height="${s * 2}" patternUnits="userSpaceOnUse"><rect width="${s}" height="${s}" fill="${mix(t.hl, t.bg, 0.22)}"/><rect x="${s}" y="${s}" width="${s}" height="${s}" fill="${mix(t.hl, t.bg, 0.22)}"/></pattern>`);
      defs.push(`<linearGradient id="f" x1="0" y1="0.4" x2="1" y2="0.6"><stop offset="0.3" stop-color="${t.bg}"/><stop offset="0.7" stop-color="${t.bg}" stop-opacity="0.55"/><stop offset="1" stop-color="${t.bg}" stop-opacity="0"/></linearGradient>`);
      parts.push(`<rect width="${w}" height="${h}" fill="url(#p)"/>`, `<rect width="${w}" height="${h}" fill="url(#f)"/>`);
      break;
    }
    case "speed": {
      glow("a", 0, 0.5, t.g2, 0.28, 0.7);
      const lines: string[] = [];
      for (let y = 0, i = 0; y < h; y += 1.5 * u, i++) {
        const len = w * (0.35 + ((i * 37) % 50) / 100);
        lines.push(`<rect x="0" y="${y.toFixed(1)}" width="${len.toFixed(0)}" height="${(0.18 * u).toFixed(1)}" fill="${i % 2 ? t.hl2 : t.hl}" fill-opacity="${i % 2 ? 0.18 : 0.26}"/>`);
      }
      defs.push(`<linearGradient id="f" x1="0" y1="0" x2="1" y2="0"><stop offset="0.35" stop-color="${t.bg}" stop-opacity="0"/><stop offset="0.92" stop-color="${t.bg}"/></linearGradient>`);
      parts.push(`<g transform="rotate(-4 0 0)">${lines.join("")}</g>`, `<rect width="${w}" height="${h}" fill="url(#f)"/>`);
      break;
    }
    case "lights":
      parts.push(`<polygon points="${w * 0.22},${-h * 0.12} ${w * 0.02},${h} ${w * 0.32},${h}" fill="${t.hl}" fill-opacity="0.16"/>`, `<polygon points="${w * 0.78},${-h * 0.12} ${w * 0.66},${h} ${w * 0.96},${h}" fill="${t.hl2}" fill-opacity="0.14"/>`);
      glow("a", 0.5, 1.1, t.g2, 0.3, 0.7);
      break;
    case "night":
      if (t.light) {
        defs.push(`<linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e9eefc"/><stop offset="0.7" stop-color="#ffffff"/></linearGradient>`);
        parts.push(`<rect width="${w}" height="${h}" fill="url(#s)"/>`);
        glow("a", 0.5, 1, t.hl, 0.18, 0.65);
      } else {
        defs.push(`<linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${mix("#0a1240", t.bg, 0.6)}"/><stop offset="0.7" stop-color="${t.bg}"/></linearGradient>`);
        parts.push(`<rect width="${w}" height="${h}" fill="url(#s)"/>`);
        glow("a", 0.5, 1, t.hl2, 0.3, 0.65);
        for (let x = 9 * u; x < w; x += 9.35 * u) parts.push(`<rect x="${x.toFixed(0)}" y="${(h * 0.66).toFixed(0)}" width="${(0.35 * u).toFixed(1)}" height="${(h * 0.34).toFixed(0)}" fill="${t.hl}" fill-opacity="0.18"/>`);
      }
      break;
    default:
      break;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs>${defs.join("")}</defs>${parts.join("")}</svg>`;
}

/** A GS Pro picture background from our own storage, darkened like the live card. Null when it can't be read. */
async function picturePng(src: string | null, w: number, h: number): Promise<string | null> {
  if (!src) return null;
  let url: URL;
  try { url = new URL(src); } catch { return null; }
  if (!allowedImageHost(url)) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > 12 * 1024 * 1024) return null;
    const out = await sharp(buf, { animated: false }).resize(w, h, { fit: "cover", position: "centre" }).png().toBuffer();
    return `data:image/png;base64,${out.toString("base64")}`;
  } catch {
    return null;
  }
}

const logos: Partial<Record<"wht" | "blk", Promise<string>>> = {};
function logoFor(light: boolean): Promise<string> {
  const k = light ? "blk" : "wht";
  logos[k] ??= readFile(join(process.cwd(), `public/images/fg/logos/gameshuffle-${k}.svg`)).then((b) => `data:image/svg+xml;base64,${b.toString("base64")}`);
  return logos[k]!;
}

const flags = new Map<string, Promise<string | null>>();
function flagData(code: string | null): Promise<string | null> {
  const path = flagUrl(code);
  if (!path) return Promise.resolve(null);
  if (!flags.has(path)) flags.set(path, readFile(join(process.cwd(), "public", path)).then((b) => `data:image/svg+xml;base64,${b.toString("base64")}`).catch(() => null));
  return flags.get(path)!;
}

// ── The drawing ───────────────────────────────────────────────────────────

const SQ: Record<string, string> = { w: "#3bd17f", p: "#ffd25a", l: "rgba(127,127,140,0.45)" };

interface Tile { id: Shown; label: string; value: string }

/** The tiles: every piece that's on and has something to show, in the card's order, past the head and the big number. */
function tilesFor(look: MmrLook, v: MmrView, goal: GoalProgress | null, room: number): Tile[] {
  const info = look.info;
  const big = bigOf(info, v);
  const out: Tile[] = [];
  for (const id of pieceOrder(info)) {
    if (HEAD.includes(id) || !info.on[id]) continue;
    if (id === "mmr" && big === "mmr") continue;
    if (id === "world" && big === "world") continue;
    // A still picture: tonight only once there's been an event, and the top division by name.
    if (id === "tonight" && !v.tonight.events) continue;
    if (id === "progress" && (!v.next || v.toNext == null) && v.division !== "Placement") { out.push({ id, label: "Division", value: v.division }); continue; }
    const t = pieceText(id, v, info, goal);
    if (!t) continue;
    out.push({ id, label: t.label || t.chip, value: t.value });
    if (out.length >= room) break;
  }
  // With world rank as the big number, MMR is a tile while its switch is on.
  if (big === "world" && info.on.mmr && v.mmr != null && out.length < room && !out.some((x) => x.id === "mmr")) out.unshift({ id: "mmr", label: "MMR", value: fmtMmr(v.mmr) });
  return out.slice(0, room);
}

export interface PictureInput {
  source: MmrSource;
  look: MmrLook;
  goal?: GoalProgress | null;
}

/** The card as a PNG at one of the three sizes. */
export async function renderMmrPicture({ source, look, goal = null }: PictureInput, size: PictureSize): Promise<Buffer> {
  const [W, H] = PICTURE_SIZES[size];
  const v = viewOf(source);
  const t = themeFor(look, v);
  const info = look.info;
  const div = divisionLook(v.division);
  const story = size === "story", wide = size === "wide";
  const big = bigOf(info, v);

  const emblemPx = story ? 300 : wide ? 220 : 220;
  const [font, [, outfit500, outfit600], logo, emblem, face, picture, flag] = await Promise.all([
    lookFont(look),
    fonts(),
    look.brand === "inside" || look.brand === "tab" ? logoFor(t.light) : Promise.resolve(null),
    look.emblem === "tile" ? medalData(div.base).then((m) => m ?? svgUri(emblemSvg(div, emblemPx))) : Promise.resolve(null),
    look.emblem === "picture" && v.avatar ? facePng(v.avatar, emblemPx * 2) : Promise.resolve(null),
    look.fill === "picture" ? picturePng(look.picture, W, H) : Promise.resolve(null),
    info.on.cc && (look.country === "flag" || look.country === "both") ? flagData(v.country) : Promise.resolve(null),
  ]);
  const bg = svgUri(backgroundSvg(look, t, W, H));
  const tiles = tilesFor(look, v, goal, TILES[size]);

  const nameSize = story ? 96 : wide ? 64 : 84;
  const bigSize = story ? 230 : wide ? 150 : 190;
  const tileVal = story ? 54 : wide ? 40 : 48;
  const tileLab = story ? 26 : wide ? 20 : 24;
  const pad = story ? 80 : wide ? 52 : 70;

  const bigText = big === "world" ? (v.worldRank ? `#${v.worldRank.toLocaleString("en-US")}` : "-") : big === "division" ? v.division : v.mmr != null ? fmtMmr(v.mmr) : "-";
  const bigLabel = big === "world" ? "World" : big === "division" ? "" : "MMR";
  const code = info.on.cc && v.country && (look.country === "code" || look.country === "both") ? v.country.toUpperCase() : null;
  const sub = [info.on.division && big !== "division" ? v.division : null, info.on.game ? (v.ladder ? v.ladder.name : MMR_GAMES[v.game].label) : null].filter(Boolean).join(" · ");
  const line = info.on.line ? pieceText("line", v, info, goal)?.value ?? null : null;
  const align = story || look.align === "center" ? "center" : "flex-start";

  const emblemEl = face
    // eslint-disable-next-line @next/next/no-img-element -- drawn by ImageResponse
    ? <img src={face} width={emblemPx} height={emblemPx} alt="" style={{ borderRadius: emblemPx / 2, border: `6px solid ${t.acc}` }} />
    // eslint-disable-next-line @next/next/no-img-element -- drawn by ImageResponse
    : emblem ? <img src={emblem} width={emblemPx} height={emblemPx} alt="" /> : null;

  const head = (
    <div style={{ display: "flex", flexDirection: "column", gap: story ? 16 : 10, alignItems: align, minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- drawn by ImageResponse */}
        {flag && <img src={flag} width={Math.round(nameSize * 0.75)} height={Math.round(nameSize * 0.5)} alt="" style={{ borderRadius: 6 }} />}
        <div style={{ display: "flex", fontFamily: "CardFont", fontSize: nameSize, lineHeight: 1.05, color: t.ink }}>{clip(v.name, story ? 16 : 18)}</div>
        {code && <div style={{ display: "flex", fontSize: Math.round(nameSize * 0.42), fontWeight: 600, color: t.ink2, letterSpacing: 2 }}>{code}</div>}
      </div>
      {sub && <div style={{ display: "flex", fontSize: story ? 38 : wide ? 28 : 34, fontWeight: 600, color: t.dtext }}>{sub}</div>}
      {line && <div style={{ display: "flex", fontSize: story ? 34 : wide ? 24 : 30, fontWeight: 500, color: t.ink2 }}>{line}</div>}
    </div>
  );

  const bigEl = (
    <div style={{ display: "flex", alignItems: "baseline", gap: 16, justifyContent: align }}>
      <div style={{ display: "flex", fontFamily: "CardFont", fontSize: big === "division" ? Math.round(bigSize * 0.6) : bigSize, lineHeight: 1, color: t.ink }}>{bigText}</div>
      {bigLabel && <div style={{ display: "flex", fontSize: story ? 44 : wide ? 30 : 38, fontWeight: 600, color: t.acc, letterSpacing: 2 }}>{bigLabel}</div>}
    </div>
  );

  const cols = story ? 2 : wide ? 4 : 3;
  const gap = story ? 20 : 14;
  const inner = W - pad * 2;
  const tileW = Math.floor((inner - gap * (cols - 1)) / cols);
  const tileEls = tiles.map((tile) => (
    <div key={tile.id} style={{ display: "flex", flexDirection: "column", gap: 6, width: tileW, padding: story ? "20px 24px" : "14px 18px", borderRadius: story ? 22 : 16, background: t.chip, border: `1px solid ${t.line}` }}>
      <div style={{ display: "flex", fontSize: tileLab, fontWeight: 600, color: t.ink2 }}>{tile.label}</div>
      {tile.id === "last10" && v.squares.length ? (
        <div style={{ display: "flex", gap: 5, marginTop: 4 }}>
          {v.squares.slice(-10).map((s, i) => <div key={i} style={{ width: Math.round(tileVal * 0.42), height: Math.round(tileVal * 0.42), borderRadius: 4, background: SQ[s] ?? SQ.l }} />)}
        </div>
      ) : (
        <div style={{ display: "flex", fontFamily: "CardFont", fontSize: fitSize(tile.value, tileVal, tileW - (story ? 48 : 36)), lineHeight: 1.05, color: t.ink, whiteSpace: "nowrap" }}>{clip(tile.value, 16)}</div>
      )}
      {tile.id === "progress" && (
        <div style={{ display: "flex", height: 8, borderRadius: 4, background: t.line, marginTop: 4 }}>
          <div style={{ display: "flex", width: `${Math.round(Math.max(0, Math.min(1, v.pct)) * 100)}%`, background: t.acc, borderRadius: 4 }} />
        </div>
      )}
    </div>
  ));
  const tileRows: typeof tileEls[] = [];
  for (let i = 0; i < tileEls.length; i += cols) tileRows.push(tileEls.slice(i, i + cols));
  const tilesEl = tileRows.length > 0 && (
    <div style={{ display: "flex", flexDirection: "column", gap }}>
      {tileRows.map((r, i) => <div key={i} style={{ display: "flex", gap, justifyContent: story ? "center" : "flex-start" }}>{r}</div>)}
    </div>
  );

  const brandEl = look.brand === "off" ? null : look.brand === "mark" ? (
    <div style={{ display: "flex", fontFamily: "Outfit", fontSize: story ? 30 : 22, fontWeight: 600, color: t.ink2 }}>gameshuffle.co/mmr-card</div>
  ) : (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <div style={{ display: "flex", fontSize: story ? 30 : wide ? 22 : 28, fontWeight: 500, color: t.ink2 }}>Built by</div>
      {/* eslint-disable-next-line @next/next/no-img-element -- drawn by ImageResponse */}
      {logo && <img src={logo} width={story ? 300 : wide ? 210 : 260} height={story ? 41 : wide ? 29 : 36} alt="" />}
    </div>
  );
  const season = v.ladder ? null : `${MMR_GAMES[v.game].short} lounge`;

  const border = look.border === "none" ? null : (
    <div style={{ position: "absolute", left: 18, top: 18, right: 18, bottom: 18, display: "flex", borderRadius: 36, border: `${look.border === "two" ? 10 : 6}px solid ${look.border === "two" ? t.hl2 : t.edge}`, ...(look.border === "two" ? { boxShadow: `inset 0 0 0 6px ${t.edge}` } : {}) }} />
  );

  let body;
  if (wide) {
    body = (
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: W, height: H, padding: pad }}>
        <div style={{ display: "flex", alignItems: "center", gap: 40 }}>
          {emblemEl}
          <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>{head}{bigEl}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {tilesEl}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", fontSize: 22, fontWeight: 500, color: t.ink2 }}>{season ?? ""}</div>
            {brandEl}
          </div>
        </div>
      </div>
    );
  } else {
    body = (
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", alignItems: story ? "center" : "stretch", width: W, height: H, padding: pad }}>
        <div style={{ display: "flex", flexDirection: "column", gap: story ? 40 : 28, alignItems: story ? "center" : "stretch" }}>
          {story ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 36, marginTop: 60 }}>{emblemEl}{head}</div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 32 }}>{emblemEl}{head}</div>
          )}
          {bigEl}
        </div>
        {tilesEl}
        <div style={{ display: "flex", justifyContent: story ? "center" : "space-between", alignItems: "center", gap: 24, flexDirection: story ? "column" : "row", marginBottom: story ? 40 : 0 }}>
          <div style={{ display: "flex", fontSize: story ? 30 : 28, fontWeight: 500, color: t.ink2 }}>{season ?? ""}</div>
          {brandEl}
        </div>
      </div>
    );
  }

  const el = (
    <div style={{ display: "flex", position: "relative", width: W, height: H, background: t.bg, color: t.ink, fontFamily: "Outfit" }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- drawn by ImageResponse */}
      <img src={bg} width={W} height={H} alt="" style={{ position: "absolute", left: 0, top: 0 }} />
      {picture && (
        <div style={{ display: "flex", position: "absolute", left: 0, top: 0, width: W, height: H }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- drawn by ImageResponse */}
          <img src={picture} width={W} height={H} alt="" />
          <div style={{ display: "flex", position: "absolute", left: 0, top: 0, width: W, height: H, backgroundImage: "linear-gradient(180deg, rgba(8,10,28,0.3), rgba(8,10,28,0.72))" }} />
        </div>
      )}
      {look.foil && <div style={{ display: "flex", position: "absolute", left: 0, top: 0, width: W, height: H, backgroundImage: "linear-gradient(115deg, rgba(255,255,255,0) 30%, rgba(255,255,255,0.12) 45%, rgba(255,255,255,0) 60%)" }} />}
      {border}
      <div style={{ display: "flex", position: "absolute", left: 0, top: 0, width: W, height: H }}>{body}</div>
    </div>
  );

  const res = new ImageResponse(el, {
    width: W,
    height: H,
    fonts: [
      { name: font.name, data: font.data, weight: font.weight as 400, style: font.style },
      { name: "Outfit", data: outfit500, weight: 500, style: "normal" },
      { name: "Outfit", data: outfit600, weight: 600, style: "normal" },
    ],
  });
  return Buffer.from(await res.arrayBuffer());
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);
/** A value's size so it fits its tile on one line (display fonts run about 0.62em a character, wide ones more). */
const fitSize = (text: string, max: number, room: number) => Math.max(Math.round(max * 0.55), Math.min(max, Math.floor(room / (Math.max(1, text.length) * 0.66))));

/** Words for the picture's alt text: name, division, the big number and the tiles. */
export function pictureAlt(source: MmrSource, look: MmrLook): string {
  const v = viewOf(source);
  const big = bigOf(look.info, v);
  const head = `${v.name}'s MMR card: ${v.division}${big === "world" && v.worldRank ? `, #${v.worldRank} in the world` : v.mmr != null ? `, ${fmtMmr(v.mmr)} MMR` : ""}`;
  const tiles = tilesFor(look, v, null, 8).map((x) => `${x.label} ${x.value}`);
  return `${head}${tiles.length ? `. ${tiles.join(", ")}` : ""}.`;
}
