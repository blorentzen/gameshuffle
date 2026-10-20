import "server-only";

/**
 * Draws a share card (Britton's picks, 2026-10-19, https://claude.ai/artifact/9JxKKcAJj1L8m5pZgqg7kD):
 * wide 1200×630 for link previews and computers, tall 1080×1920 for the phone's share sheet
 * (stories). Each game's own colors and glyphs, or a signed-in player's banner (darkened under the
 * text so white passes 4.5:1 on any photo) or brand theme (darkened the same way). Squares only,
 * never the answer. Drawn with next/og like the Discord cards; pictures go through sharp to PNG.
 */

import type { ReactNode } from "react";
import { ImageResponse } from "next/og";
import sharp from "sharp";
import { allowedImageHost, fieldSvg, fonts, logo, svgUri } from "@/lib/og/eventCard";
import { GLYPHS, type GlyphName } from "@/lib/og/glyphs";
import { facePng } from "@/lib/discord/faces";
import { ordinalPlace, partLine, partTitle, puzzleHeadline, puzzleVibe, shareTime, supporterSince, type NamesPart, type FirePart, type PuzzlePart, type ShareCell, type ShareData, type SharePart, type SupporterPart, type WeeklyPart } from "./types";

type Look = "shuffle" | "dex" | "fire" | "weekly" | "day" | "supporter" | "names";
const LOOK: Record<Look, { base: string; glow: string; field: GlyphName[]; kicker: string; link: string; cta: string }> = {
  shuffle: { base: "#150f45", glow: "radial-gradient(circle at 0% 0%, #6b4ee6 0%, #2b1d84 48%, #150f45 100%)", field: ["star", "steering-wheel", "mushroom", "question-mark", "flame"], kicker: "#d3c8ff", link: "gameshuffle.co/daily", cta: "Can you beat it? Play today's, free." },
  dex: { base: "#2a0f07", glow: "radial-gradient(circle at 0% 0%, #d9622a 0%, #7d2412 50%, #2a0f07 100%)", field: ["pokeball", "bolt", "flame", "droplet", "leaf"], kicker: "#ffcfa8", link: "gameshuffle.co/daily-dex", cta: "Can you beat it? Play today's, free." },
  fire: { base: "#2c0610", glow: "radial-gradient(circle at 0% 0%, #e2453a 0%, #8f1428 50%, #2c0610 100%)", field: ["flame", "bolt", "trophy", "sparkles", "star"], kicker: "#ffc2a6", link: "gameshuffle.co/daily-trivia", cta: "How many can you get in 60 seconds?" },
  weekly: { base: "#062a27", glow: "radial-gradient(circle at 0% 0%, #1fae96 0%, #0b5a52 50%, #062a27 100%)", field: ["trophy", "calendar-week", "users-group", "award", "star"], kicker: "#b6f0e4", link: "gameshuffle.co/weekly", cta: "What would you say? Answer this week's." },
  supporter: { base: "#26101f", glow: "radial-gradient(circle at 100% 0%, #c2386e 0%, #5a1838 45%, #26101f 100%)", field: ["sparkles", "star", "puzzle", "trophy", "heart"], kicker: "#ffd2e2", link: "gameshuffle.co/support", cta: "Come play, or chip in too." },
  names: { base: "#2b0a0e", glow: "radial-gradient(circle at 100% 0%, #e0383e 0%, #8a1622 48%, #2b0a0e 100%)", field: ["pokeball", "bolt", "flame", "droplet", "leaf"], kicker: "#ffc9c4", link: "gameshuffle.co/name-every-pokemon", cta: "How many can you name? Free, no account." },
  day: { base: "#0f1d5c", glow: "linear-gradient(135deg, #1b3db0, #2f66ec 48%, #4b5cf5)", field: ["puzzle", "pokeball", "flame", "calendar-week", "trophy"], kicker: "#dbe4ff", link: "gameshuffle.co/daily", cta: "Play today's dailies, free." },
};
const PART_GLOW: Record<SharePart["kind"], string> = { shuffle: LOOK.shuffle.glow, dex: LOOK.dex.glow, fire: LOOK.fire.glow, weekly: LOOK.weekly.glow, supporter: LOOK.supporter.glow, names: LOOK.names.glow };
const ROSE = "#ff8db6";
const CELL: Record<ShareCell, string> = { match: "#3bd17f", close: "#f6c34a", miss: "rgba(255,255,255,0.18)" };

/** A Tabler outline icon as an SVG picture (path data kept in glyphs.ts, never read from node_modules at request time). */
const icon = (name: GlyphName, color: string, px: number) =>
  svgUri(`<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${GLYPHS[name].map((d) => `<path d="${d}"/>`).join("")}</svg>`);

/** A banner from our own storage, cropped to the card. Null if it isn't ours or can't be read in time. */
async function bannerPng(src: string, w: number, h: number): Promise<string | null> {
  let url: URL;
  try { url = new URL(src); } catch { return null; }
  if (!allowedImageHost(url)) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > 12 * 1024 * 1024) return null;
    const out = await sharp(buf).resize(w, h, { fit: "cover", position: "centre" }).png().toBuffer();
    return `data:image/png;base64,${out.toString("base64")}`;
  } catch {
    return null;
  }
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

interface Assets { logo: string; face: string | null; banner: string | null; icons: Record<string, string> }

/** A supporter's card: keeping game night free, since when (never an amount). */
function SupporterBlock({ p, a, big, px, center = false }: { p: SupporterPart; a: Assets; big: boolean; px: number; center?: boolean }) {
  const tall = px > 30;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: tall ? 26 : 16, alignItems: center ? "center" : "flex-start" }}>
      <div style={{ display: "flex", fontFamily: "Gabarito", fontSize: tall ? 104 : big ? 84 : 66, lineHeight: 1.04, textAlign: center ? "center" : "left" }}>Keeping game night free</div>
      <div style={{ display: "flex" }}><Chip src={a.icons.heart} text={supporterSince(p)} px={px} /></div>
      <div style={{ display: "flex", fontSize: tall ? 36 : 26, color: "rgba(255,255,255,0.86)", lineHeight: 1.35, textAlign: center ? "center" : "left", maxWidth: tall ? 880 : 760 }}>Daily puzzles, randomizers and party tools, backed by players.</div>
    </div>
  );
}

/** Name every Pokémon: the count out of the set, how long, and which clock. */
function NamesBlock({ p, a, big, px, center = false }: { p: NamesPart; a: Assets; big: boolean; px: number; center?: boolean }) {
  const tall = px > 30;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: tall ? 24 : 14, alignItems: center ? "center" : "flex-start" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 16 }}>
        <div style={{ display: "flex", fontFamily: "Gabarito", fontSize: tall ? 200 : big ? 132 : 110, lineHeight: 1 }}>{p.count.toLocaleString("en-US")}</div>
        <div style={{ display: "flex", fontSize: tall ? 46 : 32, fontWeight: 600, color: LOOK.names.kicker }}>of {p.of.toLocaleString("en-US")}</div>
      </div>
      <div style={{ display: "flex", fontSize: tall ? 46 : 30, fontWeight: 600 }}>{p.count === p.of ? "Named every one" : "named from memory"}</div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: center ? "center" : "flex-start" }}>
        <Chip src={a.icons.time} text={shareTime(p.seconds)} px={px} />
        <Chip src={a.icons.bolt} text={p.clockLabel} color="#ffd2a6" px={px} />
      </div>
    </div>
  );
}

/** The heart in place of a picture when a supporter card has no name. */
function HeartTile({ size }: { size: number }) {
  const inner = Math.round(size * 0.5);
  return (
    <div style={{ width: size, height: size, borderRadius: size, display: "flex", alignItems: "center", justifyContent: "center", backgroundImage: "linear-gradient(135deg, #e2457a, #a81e57)" }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- drawn by ImageResponse */}
      <img src={svgUri(`<svg xmlns="http://www.w3.org/2000/svg" width="${inner}" height="${inner}" viewBox="0 0 24 24" fill="#ffffff" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${GLYPHS.heart[0]}"/></svg>`)} width={inner} height={inner} alt="" />
    </div>
  );
}

function Ground({ look, data, a, w, h }: { look: Look; data: ShareData; a: Assets; w: number; h: number }): ReactNode {
  const t = LOOK[look];
  const theme = !a.banner ? data.background?.theme ?? null : null;
  const fill = (style: Record<string, string>) => <div style={{ position: "absolute", top: 0, left: 0, width: w, height: h, display: "flex", ...style }} />;
  return (
    <>
      {a.banner ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element -- drawn by ImageResponse */}
          <img src={a.banner} width={w} height={h} style={{ position: "absolute", top: 0, left: 0 }} alt="" />
          {/* At least 70% dark under every line of text, so white text passes AA on any photo. */}
          {fill({ backgroundImage: h > w ? "linear-gradient(180deg, rgba(10,8,24,0.78) 0%, rgba(10,8,24,0.82) 60%, rgba(10,8,24,0.86) 100%)" : "linear-gradient(90deg, rgba(10,8,24,0.86) 0%, rgba(10,8,24,0.76) 55%, rgba(10,8,24,0.55) 100%)" })}
        </>
      ) : theme ? (
        <>
          {fill({ backgroundImage: theme })}
          {/* Their colors, darkened for white text (a light theme like Sunset is 2:1 with white on its own). */}
          {fill({ background: "rgba(12,6,20,0.58)" })}
        </>
      ) : (
        <>
          {fill({ background: t.base })}
          {fill({ backgroundImage: t.glow })}
        </>
      )}
      {!a.banner && (
        // eslint-disable-next-line @next/next/no-img-element -- drawn by ImageResponse
        <img src={svgUri(fieldSvg(t.field, w, h, 110))} width={w} height={h} style={{ position: "absolute", top: 0, left: 0 }} alt="" />
      )}
    </>
  );
}

function Squares({ rows, cols, size }: { rows: ShareCell[][]; cols: number; size: number }) {
  const gap = Math.round(size * 0.16);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap }}>
      {rows.map((r, i) => (
        <div key={i} style={{ display: "flex", gap }}>
          {Array.from({ length: cols }, (_, j) => <div key={j} style={{ width: size, height: size, borderRadius: Math.round(size * 0.22), background: CELL[r[j] ?? "miss"] }} />)}
        </div>
      ))}
    </div>
  );
}

function Chip({ src, text, color = "#ffffff", px = 26 }: { src: string; text: string; color?: string; px?: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: Math.round(px * 0.38), padding: `${Math.round(px * 0.38)}px ${Math.round(px * 0.7)}px`, borderRadius: 999, background: "rgba(255,255,255,0.14)", border: "1px solid rgba(255,255,255,0.22)", fontSize: px, fontWeight: 600, color }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- drawn by ImageResponse */}
      <img src={src} width={px} height={px} alt="" />{text}
    </div>
  );
}

function Face({ src, name, size, ring }: { src: string | null; name: string; size: number; ring: string }) {
  const border = `${Math.max(3, Math.round(size * 0.06))}px solid ${ring}`;
  return src
    // eslint-disable-next-line @next/next/no-img-element -- drawn by ImageResponse
    ? <img src={src} width={size} height={size} style={{ borderRadius: size, border }} alt="" />
    : <div style={{ width: size, height: size, borderRadius: size, display: "flex", alignItems: "center", justifyContent: "center", background: "#4f6bf5", border, fontSize: size * 0.46, fontWeight: 700, fontFamily: "Gabarito", color: "#fff" }}>{(name.match(/[A-Za-z0-9]/)?.[0] ?? "?").toUpperCase()}</div>;
}

/** A square per guess for the day card: grey misses, then green for the solve. */
const guessCells = (p: PuzzlePart): ShareCell[] => Array.from({ length: p.guesses }, (_, i) => (p.solved && i === p.guesses - 1 ? "match" : "miss"));

function PuzzleChips({ p, a, px, center = false }: { p: PuzzlePart; a: Assets; px: number; center?: boolean }) {
  return (
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: center ? "center" : "flex-start" }}>
      {p.seconds != null && <Chip src={a.icons.time} text={shareTime(p.seconds)} px={px} />}
      {p.streak > 1 && <Chip src={a.icons.streak} text={`${p.streak}-day streak`} color="#ffd2a6" px={px} />}
      {p.place && <Chip src={a.icons.place} text={`${ordinalPlace(p.place)} today`} color="#ffe08a" px={px} />}
    </div>
  );
}

function FireChips({ p, a, px }: { p: FirePart; a: Assets; px: number }) {
  return (
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
      <Chip src={a.icons.bolt} text={`Best streak ${p.bestStreak}`} color="#ffd2a6" px={px} />
      {p.bestStreak >= 6 && <Chip src={a.icons.streak} text="Hit ×2" color="#ffd2a6" px={px} />}
      {p.place && <Chip src={a.icons.place} text={`${ordinalPlace(p.place)} today`} color="#ffe08a" px={px} />}
    </div>
  );
}

function PlayerLine({ data, a, size, look }: { data: ShareData; a: Assets; size: number; look: Look }) {
  const p = data.player;
  if (!p) return null;
  const ring = look === "fire" ? "#ff8a3d" : look === "weekly" ? "#5fd3bd" : look === "supporter" ? ROSE : "#3bd17f";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: Math.round(size * 0.22) }}>
      <Face src={a.face} name={p.name} size={size} ring={ring} />
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", fontFamily: "Gabarito", fontSize: Math.round(size * 0.48), lineHeight: 1.05 }}>{clip(p.name, 22)}</div>
        <div style={{ display: "flex", fontSize: Math.round(size * 0.26), fontWeight: 500, color: LOOK[look].kicker, marginTop: 4 }}>{p.guest ? "Playing as a guest" : p.profile ? `gameshuffle.co${p.profile}` : "On GameShuffle"}</div>
      </div>
    </div>
  );
}

function Wide({ data, a, look }: { data: ShareData; a: Assets; look: Look }) {
  const W = 1200, H = 630;
  const t = LOOK[look];
  const part = data.parts[0];
  const day = data.kind === "day";
  return (
    <div style={{ width: W, height: H, display: "flex", position: "relative", fontFamily: "Outfit", color: "#fff" }}>
      <Ground look={look} data={data} a={a} w={W} h={H} />
      <div style={{ position: "absolute", top: 0, left: 0, width: W, height: H, display: "flex", flexDirection: "column", padding: "46px 60px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- drawn by ImageResponse */}
          <img src={a.logo} width={240} height={33} style={{ objectFit: "contain", objectPosition: "left" }} alt="" />
          <div style={{ display: "flex", fontSize: 26, fontWeight: 600, color: t.kicker }}>{day ? "Today's dailies" : clip(partTitle(part), 44)}</div>
        </div>
        {day ? (
          <div style={{ display: "flex", flexDirection: "column", flex: 1, gap: 16, justifyContent: "center" }}>
            <PlayerLine data={data} a={a} size={72} look={look} />
            {data.parts.slice(0, 4).map((p, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 22, padding: "14px 22px", borderRadius: 20, backgroundImage: PART_GLOW[p.kind], border: "1px solid rgba(255,255,255,0.18)" }}>
                <div style={{ display: "flex", width: 380, fontFamily: "Gabarito", fontSize: 32 }}>{clip(partTitle(p).replace("The ", ""), 24)}</div>
                {p.kind === "shuffle" || p.kind === "dex"
                  ? <div style={{ display: "flex", gap: 8 }}>{guessCells(p).map((c, j) => <div key={j} style={{ width: 34, height: 34, borderRadius: 8, background: CELL[c] }} />)}</div>
                  : null}
                <div style={{ display: "flex", marginLeft: "auto", fontSize: 30, fontWeight: 600 }}>{partLine(p)}</div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ display: "flex", flex: 1, alignItems: "center", gap: 48 }}>
            <div style={{ display: "flex", flexDirection: "column", flex: 1, gap: 18 }}>
              {part.kind === "supporter" && !data.player && <HeartTile size={120} />}
              <PlayerLine data={data} a={a} size={92} look={look} />
              {part.kind === "supporter" ? (
                <SupporterBlock p={part} a={a} big={!data.player} px={26} />
              ) : part.kind === "names" ? (
                <NamesBlock p={part} a={a} big={!data.player} px={26} />
              ) : part.kind === "fire" ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 16 }}>
                    <div style={{ display: "flex", fontFamily: "Gabarito", fontSize: data.player ? 110 : 132, lineHeight: 1 }}>{part.score.toLocaleString("en-US")}</div>
                    <div style={{ display: "flex", fontSize: 32, fontWeight: 600, color: t.kicker }}>points</div>
                  </div>
                  <div style={{ display: "flex", fontSize: 30, fontWeight: 600 }}>{part.right} right{part.daily ? " in 60 seconds" : ""}</div>
                  <FireChips p={part} a={a} px={26} />
                </div>
              ) : part.kind === "weekly" ? (
                <WeeklyBlock p={part} a={a} big={!data.player} />
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  <div style={{ display: "flex", fontFamily: "Gabarito", fontSize: data.player ? 72 : 92, lineHeight: 1.05 }}>{puzzleHeadline(part)}</div>
                  <div style={{ display: "flex", fontSize: 32, fontWeight: 600, color: t.kicker }}>{puzzleVibe(part)}</div>
                  <PuzzleChips p={part} a={a} px={26} />
                </div>
              )}
            </div>
            {(part.kind === "shuffle" || part.kind === "dex") && part.rows.length > 0 && (
              <div style={{ display: "flex", padding: 24, borderRadius: 24, background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.16)" }}>
                <Squares rows={part.rows} cols={part.cols} size={part.rows.length > 5 ? 48 : 58} />
              </div>
            )}
          </div>
        )}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 26, fontWeight: 600 }}>
          <div style={{ display: "flex", color: "rgba(255,255,255,0.92)" }}>{t.cta}</div>
          <div style={{ display: "flex", padding: "10px 22px", borderRadius: 999, background: "#ffffff", color: "#16133a" }}>{t.link}</div>
        </div>
      </div>
    </div>
  );
}

function WeeklyBlock({ p, a, big }: { p: WeeklyPart; a: Assets; big: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", fontFamily: "Gabarito", fontSize: big ? 76 : 60, lineHeight: 1.05 }}>Answered this week&apos;s question</div>
      <div style={{ display: "flex", fontSize: 32, fontWeight: 600, color: LOOK.weekly.kicker, maxWidth: 820 }}>&ldquo;{clip(p.title, 90)}&rdquo;</div>
      <div style={{ display: "flex" }}><Chip src={a.icons.calendar} text="Results Monday" px={26} /></div>
    </div>
  );
}

function Tall({ data, a, look }: { data: ShareData; a: Assets; look: Look }) {
  const W = 1080, H = 1920;
  const t = LOOK[look];
  const part = data.parts[0];
  const day = data.kind === "day";
  return (
    <div style={{ width: W, height: H, display: "flex", position: "relative", fontFamily: "Outfit", color: "#fff" }}>
      <Ground look={look} data={data} a={a} w={W} h={H} />
      {/* Kept clear of the story apps' buttons: the top 12% and the bottom 16%. */}
      <div style={{ position: "absolute", top: 0, left: 0, width: W, height: H, display: "flex", flexDirection: "column", alignItems: "center", padding: "230px 80px 310px", gap: 34, textAlign: "center" }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- drawn by ImageResponse */}
        <img src={a.logo} width={360} height={50} style={{ objectFit: "contain" }} alt="" />
        <div style={{ display: "flex", fontSize: 40, fontWeight: 600, color: t.kicker }}>{day ? "Today's dailies" : clip(partTitle(part), 34)}</div>
        {/* The middle, centred between the title and the link. */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 34, flex: 1 }}>
        {data.player && <Face src={a.face} name={data.player.name} size={part?.kind === "supporter" ? 240 : 170} ring={look === "fire" ? "#ff8a3d" : look === "supporter" ? ROSE : "#3bd17f"} />}
        {!data.player && part?.kind === "supporter" && <HeartTile size={220} />}
        {data.player && <div style={{ display: "flex", fontFamily: "Gabarito", fontSize: 68 }}>{clip(data.player.name, 18)}</div>}
        {day ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 18, width: 900 }}>
            {data.parts.slice(0, 4).map((p, i) => (
              <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 10, padding: "22px 30px", borderRadius: 26, backgroundImage: PART_GLOW[p.kind], border: "1px solid rgba(255,255,255,0.18)" }}>
                <div style={{ display: "flex", fontFamily: "Gabarito", fontSize: 40 }}>{clip(partTitle(p).replace("The ", ""), 26)}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 18, width: 840 }}>
                  {(p.kind === "shuffle" || p.kind === "dex") && <div style={{ display: "flex", gap: 10 }}>{guessCells(p).map((c, j) => <div key={j} style={{ width: 40, height: 40, borderRadius: 9, background: CELL[c] }} />)}</div>}
                  <div style={{ display: "flex", marginLeft: "auto", fontSize: 38, fontWeight: 600 }}>{partLine(p)}</div>
                </div>
              </div>
            ))}
          </div>
        ) : part.kind === "supporter" ? (
          <SupporterBlock p={part} a={a} big px={36} center />
        ) : part.kind === "names" ? (
          <NamesBlock p={part} a={a} big px={36} center />
        ) : part.kind === "fire" ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 22 }}>
            <div style={{ display: "flex", fontFamily: "Gabarito", fontSize: 200, lineHeight: 1 }}>{part.score.toLocaleString("en-US")}</div>
            <div style={{ display: "flex", fontSize: 46, fontWeight: 600 }}>points · {part.right} right</div>
            <FireChips p={part} a={a} px={36} />
          </div>
        ) : part.kind === "weekly" ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 28 }}>
            <div style={{ display: "flex", fontFamily: "Gabarito", fontSize: 92, lineHeight: 1.05 }}>Answered this week&apos;s question</div>
            <div style={{ display: "flex", fontSize: 46, fontWeight: 600, color: LOOK.weekly.kicker }}>&ldquo;{clip(part.title, 80)}&rdquo;</div>
            <Chip src={a.icons.calendar} text="Results Monday" px={36} />
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 30 }}>
            <div style={{ display: "flex", fontFamily: "Gabarito", fontSize: 116, lineHeight: 1 }}>{puzzleHeadline(part)}</div>
            {part.rows.length > 0 && (
              <div style={{ display: "flex", padding: 32, borderRadius: 34, background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.18)" }}>
                <Squares rows={part.rows} cols={part.cols} size={part.rows.length > 5 ? 74 : 88} />
              </div>
            )}
            <PuzzleChips p={part} a={a} px={36} center />
          </div>
        )}
        </div>
        <div style={{ display: "flex", padding: "18px 40px", borderRadius: 999, background: "#ffffff", color: "#16133a", fontSize: 40, fontWeight: 600 }}>{t.link}</div>
      </div>
    </div>
  );
}

/** The card as a PNG: wide (1200×630) or tall (1080×1920). */
export async function renderShareCard(data: ShareData, size: "wide" | "tall"): Promise<Buffer> {
  const tall = size === "tall";
  const [W, H] = tall ? [1080, 1920] : [1200, 630];
  const look: Look = data.kind === "day" ? "day" : data.parts[0]?.kind ?? "shuffle";
  const [[gabarito, outfit500, outfit600], logoSrc, face, banner] = await Promise.all([
    fonts(),
    logo(),
    data.player?.avatar ? facePng(data.player.avatar, tall ? 340 : 184) : Promise.resolve(null),
    data.background?.banner ? bannerPng(data.background.banner, W, H) : Promise.resolve(null),
  ]);
  const ip = tall ? 36 : 26;
  const [time, streak, place, bolt, calendar, heart] = [
    icon("stopwatch", "#ffffff", ip), icon("flame", "#ffd2a6", ip), icon("trophy", "#ffe08a", ip), icon("bolt", "#ffd2a6", ip), icon("calendar-week", "#ffffff", ip), icon("heart", ROSE, ip),
  ];
  const a: Assets = { logo: logoSrc, face, banner, icons: { time, streak, place, bolt, calendar, heart } };
  const el = tall ? <Tall data={data} a={a} look={look} /> : <Wide data={data} a={a} look={look} />;
  const res = new ImageResponse(el, {
    width: W,
    height: H,
    fonts: [
      { name: "Gabarito", data: gabarito, weight: 700, style: "normal" },
      { name: "Outfit", data: outfit500, weight: 500, style: "normal" },
      { name: "Outfit", data: outfit600, weight: 600, style: "normal" },
    ],
  });
  return Buffer.from(await res.arrayBuffer());
}
