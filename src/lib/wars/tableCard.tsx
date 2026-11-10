/**
 * A war table drawn (war tools pick 4A; looks picks 2026-11-09, all as recommended). Three layouts: Stacked (one team
 * above the other, big logos, totals on the right; the default), Side by side (each team under a header in its color)
 * and Classic (the first table, logos twice the size). Every layout has each team's color, medals for 1st to 3rd
 * (places as text after, or for everyone with medals off), each team's total in its color with who won and by how
 * much. On the uploaded background behind a veil, else the teams' colors or Competitive's checker. A table of one team
 * (a lounge room's free-for-all) is a plain list. Drawn at twice the size; names have fixed boxes and end in "…".
 */

import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ReactElement } from "react";
import { ImageResponse } from "next/og";
import sharp from "sharp";
import { fonts, svgUri } from "@/lib/og/eventCard";
import { logoPng } from "./card";
import { flagPng } from "./flags";
import { tagColor } from "./look";
import { logoColor } from "./teamColor";
import { placesOf, teamTotal, type TableModel, type TablePlayer, type TableTeam } from "./table";
import { DEFAULT_TABLE_LOOK, contrast, frameColors, tableColors, type TableFont, type TableLook } from "./tableLook";

const S = 2;
const u = (n: number) => n * S;
const PAD = 18;
const HEAD = 36;
const PITCH = 34;
const ROWH = 30;
const FOOT = 28;
const ICE = "#8cc8f0";
const MEDAL = ["#f5c542", "#c9d3dd", "#e0915a"];

const clip = (s: string, n: number) => ([...s.trim()].length > n ? `${[...s.trim()].slice(0, n - 1).join("")}…` : s.trim());
const placeName = (p: number) => `${p}${p % 10 === 1 && p !== 11 ? "st" : p % 10 === 2 && p !== 12 ? "nd" : p % 10 === 3 && p !== 13 ? "rd" : "th"}`;
const alpha = (hex: string, a: number) => `${hex}${Math.round(a * 255).toString(16).padStart(2, "0")}`;
const onColor = (bg: string) => (contrast(bg, "#ffffff") >= 3 ? "#ffffff" : "#0b0e13");

// ── Assets ──────────────────────────────────────────────────────────────────────────────────────

const fontCache: Partial<Record<TableFont, Promise<Buffer>>> = {};
/** The display font's file (the free one is Gabarito, already loaded with the others). */
function displayFont(font: TableFont): Promise<Buffer> | null {
  const dir = join(process.cwd(), "src/app/fonts");
  if (font === "bebas") return (fontCache.bebas ??= readFile(join(dir, "bebas-neue.ttf")));
  if (font === "chakra") return (fontCache.chakra ??= readFile(join(dir, "chakra-petch-bold.ttf")));
  if (font === "fredoka") return (fontCache.fredoka ??= readFile(join(dir, "fredoka-bold.ttf")));
  if (font === "grotesk") return (fontCache.grotesk ??= readFile(join(dir, "space-grotesk-bold.ttf")));
  return null;
}

const ALLOWED = new Set(["gs-ugc.empac.co", "cdn.empac.co"]);
async function backgroundPng(url: string | null, w: number, h: number): Promise<string | null> {
  if (!url) return null;
  try { if (!ALLOWED.has(new URL(url).host)) return null; } catch { return null; }
  const res = await fetch(url, { signal: AbortSignal.timeout(4000) }).catch(() => null);
  if (!res?.ok) return null;
  const jpg = await sharp(Buffer.from(await res.arrayBuffer())).resize(u(w), u(h), { fit: "cover" }).jpeg({ quality: 82 }).toBuffer().catch(() => null);
  return jpg ? `data:image/jpeg;base64,${jpg.toString("base64")}` : null;
}

function checker(w: number, h: number, light: boolean): string {
  const sq = u(10);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${u(w)}" height="${u(h)}"><rect width="100%" height="100%" fill="${light ? "#f3f5fa" : "#05070b"}"/><defs><pattern id="p" width="${sq * 2}" height="${sq * 2}" patternUnits="userSpaceOnUse"><rect width="${sq}" height="${sq}" fill="${ICE}"/><rect x="${sq}" y="${sq}" width="${sq}" height="${sq}" fill="${ICE}"/></pattern><radialGradient id="g" cx="1" cy="0" r="0.8"><stop offset="0" stop-color="#fff" stop-opacity="${light ? 0.5 : 0.22}"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient><mask id="m"><rect width="100%" height="100%" fill="url(#g)"/></mask></defs><rect width="100%" height="100%" fill="url(#p)" mask="url(#m)"/></svg>`;
}

/** The teams' colors glowing from opposite corners (the first two; a third and fourth from the other corners). */
function teamGround(w: number, h: number, colors: string[], light: boolean): string {
  const corners: [number, number][] = [[0, 0], [1, 1], [1, 0], [0, 1]];
  const glows = colors.slice(0, 4).map((c, i) => `<radialGradient id="g${i}" cx="${corners[i][0]}" cy="${corners[i][1]}" r="0.9"><stop offset="0" stop-color="${c}" stop-opacity="${light ? 0.32 : 0.5}"/><stop offset="1" stop-color="${c}" stop-opacity="0"/></radialGradient>`).join("");
  const rects = colors.slice(0, 4).map((_, i) => `<rect width="100%" height="100%" fill="url(#g${i})"/>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${u(w)}" height="${u(h)}"><defs>${glows}</defs><rect width="100%" height="100%" fill="${light ? "#f3f5fa" : "#07080f"}"/>${rects}</svg>`;
}

// ── Drawing ─────────────────────────────────────────────────────────────────────────────────────

export interface TablePicture { png: Buffer; alt: string }

export interface TableDrawOptions {
  /** Each team's logo url, by lowercase tag. */
  logos: Record<string, string | null>;
  /** Each flag code's picture (the server's own or the country flag, src/lib/wars/flags.ts); others draw as text. */
  flags?: Record<string, string>;
  background: string | null;
  races: number | null;
  /** The look, with paid choices already swapped for free ones where the server has no looks. */
  look?: TableLook;
}

type Team = { t: TableTeam; total: number; color: string; logo: string | null; tile: string };

/** The line under a team's total: who won and by how much (two teams), else its place and how far behind. */
function resultLine(teams: Team[], i: number): string {
  const totals = teams.map((x) => x.total);
  const best = Math.max(...totals);
  const order = [...totals].sort((a, b) => b - a);
  const me = totals[i];
  if (teams.length === 2) {
    const gap = Math.abs(totals[0] - totals[1]);
    return gap === 0 ? "Tied" : me === best ? `Won by ${gap}` : `Lost by ${gap}`;
  }
  const place = order.indexOf(me) + 1;
  if (me === best) return order[1] === best ? "1st (tied)" : `1st by ${best - order[1]}`;
  return `${placeName(place)} · ${best - me} behind`;
}

export async function renderTable(model: TableModel, opts: TableDrawOptions): Promise<TablePicture> {
  const look = opts.look ?? DEFAULT_TABLE_LOOK;
  const light = look.light;
  const frame = frameColors(look);
  const shown = model.teams.filter((t) => t.players.length);
  const list = shown.length < 2;
  const places = placesOf(model);

  // Logos and each team's color: the card's (or the text's #hex), else the logo's, else the lettered tile's.
  const urls = shown.map((t) => opts.logos[t.tag.toLowerCase()] ?? null);
  const picked = await Promise.all(urls.map((url, i) => (shown[i].color || !url ? null : logoColor(url).catch(() => null))));
  const colors = tableColors(shown.map((t, i) => ({ color: t.color ?? picked[i] ?? tagColor(t.tag), own: !!t.color })), light);

  // Sizes, by layout.
  const layout = list ? "list" : look.layout;
  const maxRows = Math.max(2, ...shown.map((t) => t.players.length));
  const W = layout === "list" ? 640 : layout === "sides" ? 880 : 860;
  const logoBig = layout === "stacked" ? Math.min(170, Math.max(64, maxRows * PITCH - 8)) : layout === "classic" ? Math.min(120, Math.max(56, maxRows * PITCH - 12)) : 64;
  // A team on a lettered tile (no logo) shows its name above its total, so it needs room for three lines there.
  const named = (t: TableTeam) => layout !== "sides" && layout !== "list" && !!t.name && !opts.logos[t.tag.toLowerCase()];
  const blockH = (t: TableTeam) => Math.max(named(t) ? 3 : 2, t.players.length) * PITCH + (t.penalty ? 22 : 0);
  const pairs: TableTeam[][] = [];
  for (let i = 0; i < shown.length; i += 2) pairs.push(shown.slice(i, i + 2));
  const bodyH = layout === "list"
    ? blockH(shown[0] ?? { tag: "", name: null, color: null, players: [], penalty: 0 }) + 8
    : layout === "sides"
      ? pairs.reduce((a, p) => a + 92 + Math.max(...p.map(blockH)) + 14, 0)
      : shown.reduce((a, t, i) => a + blockH(t) + (i ? (layout === "stacked" ? 36 : 14) : 0), 0) + 12;
  const h = HEAD + 12 + bodyH + FOOT;

  const [bg, flagEntries, ...logoPngs] = await Promise.all([
    backgroundPng(opts.background, W, h),
    (async () => {
      const codes = [...new Set(shown.flatMap((t) => t.players.map((p) => p.flag).filter((f): f is string => !!f && !!opts.flags?.[f])))];
      return Promise.all(codes.map(async (c) => [c, await flagPng(opts.flags![c], u(26))] as const));
    })(),
    ...urls.map((url) => logoPng(url, u(logoBig))),
  ]);
  const flagPics = new Map(flagEntries.filter(([, v]) => !!v) as [string, string][]);
  // A lettered logo wears the team's color as drawn (so a team given a spare color matches its names).
  const teams: Team[] = shown.map((t, i) => ({ t, total: teamTotal(t), color: colors[i], logo: logoPngs[i] as string | null, tile: colors[i] }));

  // Colors of the page.
  const ink = light ? "#141a2e" : "#f3f6fb";
  const muted = light ? "#4a5470" : "#c9d6e1";
  const rowBg = light ? "rgba(255,255,255,0.9)" : "rgba(8,10,18,0.8)";
  const line = frame ? `linear-gradient(90deg, ${frame.a}, ${frame.b})` : light ? "rgba(20,26,46,0.22)" : "rgba(255,255,255,0.35)";

  const vs = shown.map((t) => t.name || t.tag).join(" vs ");
  const day = model.date && /^\d{4}-\d{2}-\d{2}/.test(model.date) ? new Date(`${model.date.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : model.date;
  const head = [day, opts.races ? `${opts.races} races` : null].filter(Boolean).join(" · ") || "War table";

  const medal = (n: number): ReactElement => (
    <div style={{ display: "flex", width: u(24), height: u(24), borderRadius: u(24), background: MEDAL[n - 1], border: `${u(2)}px solid ${light ? "rgba(20,26,46,0.18)" : "rgba(255,255,255,0.9)"}`, alignItems: "center", justifyContent: "center", fontFamily: "Display", fontSize: u(13), color: "#1b1405" }}>{String(n)}</div>
  );

  const flagCell = (p: TablePlayer): ReactElement => (
    <div style={{ display: "flex", width: u(38), justifyContent: "center", flexShrink: 0 }}>
      {p.flag && flagPics.has(p.flag) ? (
        // eslint-disable-next-line @next/next/no-img-element -- drawn by ImageResponse
        <img src={flagPics.get(p.flag)!} width={u(26)} height={u(19)} alt="" />
      ) : p.flag ? <div style={{ display: "flex", fontSize: u(11), fontWeight: 600, padding: `${u(1)}px ${u(4)}px`, borderRadius: u(3), background: light ? "#1f2a44" : "#e8edf3", color: light ? "#ffffff" : "#0b0e13" }}>{p.flag.toUpperCase().slice(0, 6)}</div> : null}
    </div>
  );

  const playerRow = (p: TablePlayer, team: Team | null, w: number, j: number, style: { center?: boolean; tinted?: boolean; edge?: boolean }): ReactElement => {
    const place = places.get(p) ?? 0;
    const nameW = w - 20 - 38 - 48 - 46 - (style.edge ? 4 : 0);
    return (
      <div key={j} style={{ display: "flex", alignItems: "center", height: u(ROWH), marginTop: j ? u(PITCH - ROWH) : 0, padding: `0 ${u(10)}px`, borderRadius: u(6), background: rowBg, width: u(w), flexShrink: 0, ...(style.edge && team ? { borderLeft: `${u(4)}px solid ${team.color}` } : {}) }}>
        <div style={{ display: "flex", width: u(nameW), justifyContent: style.center ? "center" : "flex-start", fontSize: u(16), fontWeight: 600, color: style.tinted && team ? team.color : ink, overflow: "hidden", whiteSpace: "nowrap" }}>{clip(p.name, Math.max(10, Math.floor(nameW / 9)))}</div>
        {flagCell(p)}
        <div style={{ display: "flex", width: u(48), justifyContent: "flex-end", fontFamily: "Display", fontSize: u(18), color: ink }}>{String(p.score)}</div>
        <div style={{ display: "flex", width: u(46), justifyContent: "flex-end", alignItems: "center" }}>
          {look.medals && place >= 1 && place <= 3 ? medal(place) : <div style={{ display: "flex", fontSize: u(14), color: muted }}>{placeName(place)}</div>}
        </div>
      </div>
    );
  };

  const penaltyLine = (t: TableTeam): ReactElement | null => (t.penalty ? <div style={{ display: "flex", height: u(22), alignItems: "flex-end", fontSize: u(13), fontWeight: 600, color: light ? "#b4232a" : "#ffb3b5", paddingLeft: u(10) }}>{`Penalty −${t.penalty}`}</div> : null);

  const logoBox = (x: Team, size: number): ReactElement => x.logo ? (
    // eslint-disable-next-line @next/next/no-img-element -- drawn by ImageResponse
    <img src={x.logo} width={u(size)} height={u(size)} alt="" />
  ) : (
    <div style={{ width: u(size), height: u(size), borderRadius: u(size), background: x.tile, border: `${u(Math.max(2, size / 28))}px solid rgba(255,255,255,0.85)`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Display", fontSize: u(Math.round(size * (x.t.tag.length > 3 ? 0.2 : 0.28))), color: onColor(x.tile) }}>{clip(x.t.tag, 5)}</div>
  );

  const totalBox = (x: Team, i: number, size: number, width: number): ReactElement => (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", justifyContent: "center", width: u(width), flexShrink: 0 }}>
      {named(x.t) ? <div style={{ display: "flex", marginBottom: u(4), fontFamily: "Display", fontSize: u(17), color: ink, overflow: "hidden", whiteSpace: "nowrap" }}>{clip(x.t.name!, Math.floor(width / 10))}</div> : null}
      <div style={{ display: "flex", fontFamily: "Display", fontSize: u(size), lineHeight: "1", color: x.color }}>{String(x.total)}</div>
      <div style={{ display: "flex", marginTop: u(6), fontSize: u(15), fontWeight: 600, color: ink }}>{resultLine(teams, i)}</div>
    </div>
  );

  let body: ReactElement;
  const inner = W - PAD * 2;
  if (layout === "list") {
    const t = teams[0];
    body = (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: u(W), paddingTop: u(12) }}>
        {t ? t.t.players.map((p, j) => playerRow(p, null, inner, j, {})) : null}
        {t ? penaltyLine(t.t) : null}
      </div>
    );
  } else if (layout === "sides") {
    const colW = (inner - 16) / 2;
    body = (
      <div style={{ display: "flex", flexDirection: "column", padding: `${u(12)}px ${u(PAD)}px 0` }}>
        {pairs.map((pair, pi) => (
          <div key={pi} style={{ display: "flex", justifyContent: "space-between", marginTop: pi ? u(14) : 0 }}>
            {pair.map((_, k) => {
              const i = pi * 2 + k;
              const x = teams[i];
              const on = onColor(x.color);
              return (
                <div key={k} style={{ display: "flex", flexDirection: "column", width: u(colW) }}>
                  <div style={{ display: "flex", alignItems: "center", height: u(84), padding: `0 ${u(12)}px`, borderRadius: u(8), background: `linear-gradient(90deg, ${alpha(x.color, 0.94)}, ${alpha(x.color, 0.78)})` }}>
                    {logoBox(x, 64)}
                    <div style={{ display: "flex", flexDirection: "column", marginLeft: u(12), width: u(colW - 24 - 64 - 12 - 110) }}>
                      <div style={{ display: "flex", fontFamily: "Display", fontSize: u(22), color: on, overflow: "hidden", whiteSpace: "nowrap" }}>{clip(x.t.name || x.t.tag, 20)}</div>
                      <div style={{ display: "flex", fontSize: u(14), fontWeight: 600, color: on }}>{resultLine(teams, i)}</div>
                    </div>
                    <div style={{ display: "flex", width: u(110), justifyContent: "flex-end", fontFamily: "Display", fontSize: u(52), lineHeight: "1", color: on }}>{String(x.total)}</div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", marginTop: u(8) }}>
                    {x.t.players.map((p, j) => playerRow(p, x, colW, j, { edge: true }))}
                    {penaltyLine(x.t)}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    );
  } else {
    // Stacked and Classic: a block per team (logo, players, total), Stacked with the gap on the line between.
    const stacked = layout === "stacked";
    const logoCol = logoBig + (stacked ? 30 : 14);
    const totalCol = stacked ? 190 : 150;
    const rowsW = inner - logoCol - totalCol - 24;
    const gap = teams.length === 2 ? Math.abs(teams[0].total - teams[1].total) : null;
    body = (
      <div style={{ display: "flex", flexDirection: "column", padding: `${u(12)}px ${u(PAD)}px 0` }}>
        {teams.map((x, i) => {
          const bh = blockH(x.t);
          const size = Math.round(Math.min(stacked ? 84 : 56, Math.max(40, bh * 0.52)));
          return (
            <div key={i} style={{ display: "flex", flexDirection: "column" }}>
              {i > 0 && stacked ? (
                <div style={{ display: "flex", alignItems: "center", height: u(36) }}>
                  <div style={{ display: "flex", flex: 1, height: u(2), background: line }} />
                  {gap != null ? <div style={{ display: "flex", marginLeft: u(14), fontFamily: "Display", fontSize: u(24), color: ink }}>{gap === 0 ? "Tied" : `±${gap}`}</div> : null}
                </div>
              ) : i > 0 ? <div style={{ display: "flex", height: u(14) }} /> : null}
              <div style={{ display: "flex", alignItems: "center", height: u(bh) }}>
                <div style={{ display: "flex", width: u(logoCol), justifyContent: "center", alignItems: "center", flexShrink: 0 }}>{logoBox(x, Math.min(logoBig, Math.max(56, bh - 8)))}</div>
                <div style={{ display: "flex", flexDirection: "column", marginLeft: u(12) }}>
                  {x.t.players.map((p, j) => playerRow(p, x, rowsW, j, stacked ? { center: true, tinted: true } : { edge: true }))}
                  {penaltyLine(x.t)}
                </div>
                <div style={{ display: "flex", marginLeft: u(12) }}>{totalBox(x, i, size, totalCol)}</div>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  const headBg = frame ? `linear-gradient(90deg, ${frame.a}, ${frame.b})` : light ? "rgba(255,255,255,0.92)" : "rgba(0,0,0,0.72)";
  const headInk = frame ? frame.on : ink;
  const groundSvg = bg ? null : look.ground === "checker" ? checker(W, h, light) : teamGround(W, h, teams.map((x) => x.color), light);

  const el = (
    <div style={{ width: u(W), height: u(h), display: "flex", position: "relative", background: light ? "#f3f5fa" : "#05070b", color: ink, fontFamily: "Outfit" }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- drawn by ImageResponse */}
      <img src={bg ?? svgUri(groundSvg!)} width={u(W)} height={u(h)} style={{ position: "absolute", left: 0, top: 0 }} alt="" />
      {bg ? <div style={{ position: "absolute", left: 0, top: 0, width: u(W), height: u(h), display: "flex", background: light ? "rgba(243,245,250,0.74)" : "linear-gradient(rgba(4,6,10,0.4), rgba(4,6,10,0.64))" }} /> : null}
      <div style={{ position: "relative", display: "flex", flexDirection: "column", width: u(W), height: u(h) }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", height: u(HEAD), padding: `0 ${u(14)}px`, background: headBg, color: headInk, fontFamily: "Display", fontSize: u(17) }}>
          <div style={{ display: "flex", maxWidth: u(W * 0.4), overflow: "hidden", whiteSpace: "nowrap" }}>{clip(head, 30)}</div>
          <div style={{ display: "flex", maxWidth: u(W * 0.55), overflow: "hidden", whiteSpace: "nowrap" }}>{clip(model.title || vs, Math.floor(W / 15))}</div>
        </div>
        {body}
        {look.brand ? <div style={{ display: "flex", position: "absolute", right: u(14), bottom: u(8), fontSize: u(13), fontWeight: 600, color: light ? "#3a4560" : "rgba(255,255,255,0.9)" }}>gameshuffle.co</div> : null}
      </div>
    </div>
  );

  const [[gabarito, outfit500, outfit600], display] = await Promise.all([fonts(), displayFont(look.font)]);
  const res = new ImageResponse(el, {
    width: u(W),
    height: u(h),
    fonts: [
      { name: "Display", data: display ?? gabarito, weight: 700, style: "normal" },
      { name: "Gabarito", data: gabarito, weight: 700, style: "normal" },
      { name: "Outfit", data: outfit500, weight: 500, style: "normal" },
      { name: "Outfit", data: outfit600, weight: 600, style: "normal" },
    ],
  });
  const alt = `${model.title || vs}: ${teams.map((x) => `${x.t.name || x.t.tag} ${x.total} (${x.t.players.map((p) => `${p.name} ${p.score}`).join(", ")})`).join("; ")}.`;
  return { png: Buffer.from(await res.arrayBuffer()), alt: alt.slice(0, 1000) };
}
