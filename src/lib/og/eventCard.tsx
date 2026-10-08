/**
 * The link-preview card for an event (tournament, game night, championship
 * season, a streamer's live page): 1200×630, drawn per event so a shared link
 * shows its own name, date and art instead of one stock image for everything.
 *
 * Look (approved mockups, 2026-10-07): navy ground with a glow in the event's
 * accent, a faint field of Tabler glyphs, the white wordmark, a kicker, the
 * title in Gabarito, the date in the organizer's timezone, up to three fact
 * chips, and the art on the right: the game's box art as a tilted card, the
 * organizer's banner fading in behind the text, or three glyph tiles when
 * there's neither. Cancelled events get a stamp.
 *
 * The renderer can't draw webp (all our box art is webp, and banners may be),
 * so every picture goes through sharp to a PNG first.
 */
import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import sharp from "sharp";
import { GLYPHS, type GlyphName } from "./glyphs";

export const OG_SIZE = { width: 1200, height: 630 };
export const OG_CONTENT_TYPE = "image/png";

export type CardArt =
  | { kind: "cover"; src: string }
  | { kind: "banner"; src: string }
  | { kind: "glyphs"; glyphs: [GlyphName, GlyphName, GlyphName] };

export interface EventCardInput {
  /** "Tournament · Mario Kart 8 Deluxe" (set in capitals on the card). */
  kicker: string;
  title: string;
  /** Date line, already formatted in the right timezone. */
  when?: string | null;
  meta?: { icon: GlyphName; text: string }[];
  /** Resolved art (see coverArt / bannerArt); glyph tiles when null. */
  art: CardArt | null;
  /** Fallback tiles and the background field. */
  glyphs: [GlyphName, GlyphName, GlyphName];
  accent: string;
  stamp?: string | null;
}

// ---------------------------------------------------------------- assets

const assets: { gabarito?: Promise<Buffer>; outfit500?: Promise<Buffer>; outfit600?: Promise<Buffer>; logo?: Promise<string> } = {};

function fonts() {
  const dir = join(process.cwd(), "src/app/fonts");
  assets.gabarito ??= readFile(join(dir, "gabarito-bold.ttf"));
  assets.outfit500 ??= readFile(join(dir, "outfit-medium.ttf"));
  assets.outfit600 ??= readFile(join(dir, "outfit-semibold.ttf"));
  return Promise.all([assets.gabarito, assets.outfit500, assets.outfit600]);
}

function logo(): Promise<string> {
  assets.logo ??= readFile(join(process.cwd(), "public/images/fg/logos/gameshuffle-wht.svg")).then(
    (b) => `data:image/svg+xml;base64,${b.toString("base64")}`,
  );
  return assets.logo;
}

async function pngData(input: Buffer, width: number, height: number): Promise<string> {
  const png = await sharp(input).resize(width, height, { fit: "cover", position: "centre" }).png().toBuffer();
  return `data:image/png;base64,${png.toString("base64")}`;
}

/** Box art from public/images/box-art (a path like boxArt() returns), as a cover card. */
export async function coverArt(path: string | null | undefined): Promise<CardArt | null> {
  if (!path || !path.startsWith("/images/box-art/") || path.includes("..")) return null;
  try {
    const file = await readFile(join(process.cwd(), "public", path));
    return { kind: "cover", src: await pngData(file, 330 * 2, 440 * 2) };
  } catch {
    return null;
  }
}

/** Uploaded banners live on our own storage; nothing else is fetched. */
function allowedImageHost(url: URL): boolean {
  if (url.protocol !== "https:") return false;
  const hosts = new Set(["gs-ugc.empac.co", "cdn.empac.co"]);
  const r2 = process.env.R2_PUBLIC_BASE_URL ?? process.env.R2_PUBLIC_BASE;
  if (r2) {
    try { hosts.add(new URL(r2).host); } catch { /* ignore a malformed env value */ }
  }
  return hosts.has(url.host);
}

/** An organizer's uploaded banner, faded in behind the text. Null if it can't be read in time. */
export async function bannerArt(src: string | null | undefined): Promise<CardArt | null> {
  if (!src) return null;
  let url: URL;
  try { url = new URL(src); } catch { return null; }
  if (!allowedImageHost(url)) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > 12 * 1024 * 1024) return null;
    return { kind: "banner", src: await pngData(buf, 700, 630) };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- drawing

function glyphSvg(name: GlyphName, color: string, strokeWidth = 1.6): string {
  const paths = GLYPHS[name].map((d) => `<path d="${d}"/>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
}

const svgUri = (svg: string) => `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;

/** The faint glyph field, jittered the same way every time. */
function fieldSvg(names: GlyphName[], w: number, h: number, step = 96): string {
  let seed = 11;
  const r = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const cells: string[] = [];
  for (let y = -step / 2; y < h + step; y += step) {
    for (let x = -step / 2; x < w + step; x += step) {
      const s = step * (0.36 + r() * 0.2);
      const jx = (r() - 0.5) * step * 0.5, jy = (r() - 0.5) * step * 0.5, rot = Math.round((r() - 0.5) * 40);
      const g = names[Math.floor(r() * names.length)];
      const paths = GLYPHS[g].map((d) => `<path d="${d}"/>`).join("");
      cells.push(`<g transform="translate(${(x + jx).toFixed(0)} ${(y + jy).toFixed(0)}) rotate(${rot} ${(s / 2).toFixed(1)} ${(s / 2).toFixed(1)}) scale(${(s / 24).toFixed(3)})">${paths}</g>`);
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><g fill="none" stroke="#ffffff" stroke-opacity="0.075" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${cells.join("")}</g></svg>`;
}

function titleSize(len: number): number {
  return len <= 26 ? 70 : len <= 44 ? 62 : len <= 64 ? 54 : 46;
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

export async function renderEventCard(card: EventCardInput, init?: { headers?: Record<string, string> }): Promise<ImageResponse> {
  const [[gabarito, outfit500, outfit600], logoSrc] = await Promise.all([fonts(), logo()]);
  const { width: W, height: H } = OG_SIZE;
  const title = clip(card.title.trim() || "GameShuffle", 84);
  const meta = (card.meta ?? []).filter((m) => m.text.trim()).slice(0, 3);
  const art = card.art ?? { kind: "glyphs" as const, glyphs: card.glyphs };
  const dim = !!card.stamp;
  const tileColors = [card.accent, "#2766ec", "#1f8a4c"];
  const tilePos = [
    { left: 0, top: 20, rotate: -8 },
    { left: 190, top: 0, rotate: 7 },
    { left: 95, top: 210, rotate: -3 },
  ];

  return new ImageResponse(
    (
      <div style={{ width: W, height: H, display: "flex", position: "relative", color: "#ffffff", fontFamily: "Outfit", background: "linear-gradient(135deg, #10123a 0%, #0b0d1c 60%, #0b0d14 100%)" }}>
        <div style={{ position: "absolute", top: 0, left: 0, width: W, height: H, display: "flex", background: `radial-gradient(circle at 86% 18%, ${card.accent}66 0%, rgba(11,13,28,0) 52%)` }} />
        <div style={{ position: "absolute", top: 0, left: 0, width: W, height: H, display: "flex", background: "radial-gradient(circle at 8% 112%, rgba(39,102,236,0.28) 0%, rgba(11,13,28,0) 45%)" }} />
        {/* eslint-disable-next-line @next/next/no-img-element -- drawn by ImageResponse, not a browser */}
        <img src={svgUri(fieldSvg(card.glyphs, W, H))} width={W} height={H} style={{ position: "absolute", top: 0, left: 0 }} alt="" />

        {art.kind === "banner" && (
          <div style={{ position: "absolute", top: 0, right: 0, width: 700, height: H, display: "flex", opacity: dim ? 0.45 : 1 }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- drawn by ImageResponse */}
            <img src={art.src} width={700} height={H} alt="" />
          </div>
        )}
        {/* Keeps the text legible over a banner; barely there otherwise. */}
        <div style={{ position: "absolute", top: 0, left: 0, width: W, height: H, display: "flex", background: art.kind === "banner"
          ? "linear-gradient(90deg, rgba(11,13,28,0.98) 0%, rgba(11,13,28,0.94) 44%, rgba(11,13,28,0.55) 70%, rgba(11,13,28,0.2) 100%)"
          : "linear-gradient(90deg, rgba(11,13,28,0.6) 0%, rgba(11,13,28,0.3) 55%, rgba(11,13,28,0) 100%)" }} />

        {art.kind === "cover" && (
          <div style={{ position: "absolute", right: 84, top: 95, width: 330, height: 440, display: "flex", borderRadius: 22, overflow: "hidden", border: "2px solid rgba(255,255,255,0.16)", boxShadow: "0 30px 80px rgba(0,0,0,0.55)", transform: "rotate(3deg)", opacity: dim ? 0.45 : 1 }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- drawn by ImageResponse */}
            <img src={art.src} width={330} height={440} alt="" />
          </div>
        )}
        {art.kind === "glyphs" && (
          <div style={{ position: "absolute", right: 70, top: 110, width: 360, height: 410, display: "flex", opacity: dim ? 0.45 : 1 }}>
            {art.glyphs.map((g, i) => (
              <div key={i} style={{ position: "absolute", left: tilePos[i].left, top: tilePos[i].top, width: 170, height: 170, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 34, background: tileColors[i], boxShadow: "0 24px 60px rgba(0,0,0,0.45)", transform: `rotate(${tilePos[i].rotate}deg)` }}>
                {/* eslint-disable-next-line @next/next/no-img-element -- drawn by ImageResponse */}
                <img src={svgUri(glyphSvg(g, "#ffffff", 1.5))} width={98} height={98} alt="" />
              </div>
            ))}
          </div>
        )}

        {card.stamp && (
          <div style={{ position: "absolute", right: 110, top: 268, display: "flex", padding: "6px 22px", border: "6px solid #ff6b6b", borderRadius: 16, background: "rgba(11,13,28,0.78)", color: "#ff6b6b", fontFamily: "Gabarito", fontSize: 54, letterSpacing: 4, transform: "rotate(-12deg)" }}>
            {card.stamp.toUpperCase()}
          </div>
        )}

        <div style={{ position: "absolute", left: 72, top: 64, bottom: 64, width: 650, display: "flex", flexDirection: "column" }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- drawn by ImageResponse */}
          <img src={logoSrc} width={190} height={26} alt="" />
          <div style={{ display: "flex", marginTop: 40, fontSize: 24, fontWeight: 600, letterSpacing: 2.9, color: "#a9b8ff" }}>{clip(card.kicker, 46).toUpperCase()}</div>
          <div style={{ display: "flex", marginTop: 14, fontFamily: "Gabarito", fontSize: titleSize(title.length), lineHeight: 1.04, letterSpacing: -0.5 }}>{title}</div>
          {card.when && <div style={{ display: "flex", marginTop: 22, fontSize: 32, fontWeight: 600 }}>{clip(card.when, 40)}</div>}
          {meta.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", marginTop: "auto" }}>
              {meta.map((m, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", marginRight: 14, marginTop: 12, padding: "8px 18px 8px 14px", fontSize: 23, fontWeight: 500, borderRadius: 999, background: "rgba(255,255,255,0.10)", border: "1px solid rgba(255,255,255,0.16)" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- drawn by ImageResponse */}
                  <img src={svgUri(glyphSvg(m.icon, "#cfd6ff", 1.8))} width={24} height={24} style={{ marginRight: 10 }} alt="" />
                  {clip(m.text, 34)}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    ),
    {
      ...OG_SIZE,
      fonts: [
        { name: "Gabarito", data: gabarito, weight: 700, style: "normal" },
        { name: "Outfit", data: outfit500, weight: 500, style: "normal" },
        { name: "Outfit", data: outfit600, weight: 600, style: "normal" },
      ],
      headers: { "Cache-Control": "public, max-age=600, s-maxage=3600, stale-while-revalidate=86400", ...init?.headers },
    },
  );
}
