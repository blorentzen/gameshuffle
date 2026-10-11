/**
 * The drawn Discord cards (server only): today's Daily card in a channel and
 * the morning podium. Approved mockup 2026-10-10
 * (https://claude.ai/artifact/EhssJ55Z9PGHemUqTMknxb): navy ground with the
 * Originals glyph field, each player's face with a ring for how they're doing
 * (green solved, amber playing, grey out of guesses), their squares, one line
 * of personality by score, and a flame for a streak of 3 or more.
 *
 * Squares only, never the answer. Everything is drawn at twice the size so it
 * stays sharp, and every piece of text has a fixed box and a length cap so a
 * long name, channel or game can't push anything out of place.
 */

import "server-only";
import type { ReactElement, ReactNode } from "react";
import { ImageResponse } from "next/og";
import { fieldSvg, fonts, glyphSvg, svgUri } from "@/lib/og/eventCard";
import type { GlyphName } from "@/lib/og/glyphs";
import { facePng } from "./faces";

const S = 2;
const u = (n: number) => n * S;
const W = 560;
const PAD = 18;
const HEADER_H = 44;
const FOOTER_H = 14;
/** The Originals glyph field, same five as the Activity (EventHeaderArt's "originals"). */
const FIELD: GlyphName[] = ["puzzle", "calendar-week", "brain", "trophy", "sparkles"];
const KICKER = "#aab4ff";
const SOFT = "#c4c9ff";
const RING = { solved: "#3bd17f", playing: "#f6c34a", out: "#7d8099" } as const;
const CELL = { match: "#3bd17f", close: "#f6c34a", miss: "#3a3f63" } as const;
const TINTS = ["#4f6bf5", "#8a5cf6", "#e0569b", "#1fa37a", "#e08a2e", "#2f9fd8"];

export type CellStatus = keyof typeof CELL;

export interface CardPlayer {
  name: string;
  avatar: string | null;
  /** One row of cells per guess. */
  rows: CellStatus[][];
  finished: boolean;
  solved: boolean;
  guesses: number;
  /** Days in a row this player has solved the Daily. */
  streak: number;
}

/** One line of personality per score (mockup decision: words, not numbers only). */
const VIBES = ["Psychic", "Sharp", "Solid", "Steady", "Close call", "Phew"];

export function vibe(p: CardPlayer, max: number): string {
  if (!p.finished) return p.rows.length ? `Playing… ${p.rows.length} down` : "Just started";
  // Not "Tomorrow's the day": the renderer draws a gap after "Tomorrow" in this font.
  if (!p.solved) return "Better luck tomorrow";
  return `${VIBES[p.guesses - 1] ?? "Got it"}. ${p.guesses} of ${max}`;
}

export const clip = (s: string, n: number) => {
  const chars = [...s.trim()];
  return chars.length > n ? `${chars.slice(0, n - 1).join("").trimEnd()}…` : chars.join("");
};

const initial = (name: string) => ([...name.trim()][0] ?? "?").toUpperCase();
const tint = (name: string) => TINTS[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % TINTS.length];

// ---------------------------------------------------------------- pieces

/**
 * One line of text in a fixed width that ends in "…" when it runs long. The
 * renderer only adds the "…" to a line with a known width, and flex centring
 * breaks it, so a centred line is a capped line inside a centring row.
 */
function Line({ text, width, size, weight = 600, color, center = false, mt = 0 }: {
  text: string; width: number; size: number; weight?: number; color?: string; center?: boolean; mt?: number;
}) {
  const type = { fontSize: u(size), fontWeight: weight, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis", ...(color ? { color } : {}) } as const;
  if (!center) return <div style={{ display: "flex", width: u(width), marginTop: u(mt), flexShrink: 0, ...type }}>{text}</div>;
  return (
    <div style={{ display: "flex", justifyContent: "center", width: u(width), marginTop: u(mt), flexShrink: 0 }}>
      <div style={{ display: "flex", maxWidth: u(width), ...type }}>{text}</div>
    </div>
  );
}

function Avatar({ png, name, size, ring, ringWidth = 2, fire = false }: {
  png: string | null; name: string; size: number; ring: string; ringWidth?: number; fire?: boolean;
}) {
  const inner = size - ringWidth * 2;
  return (
    <div style={{ position: "relative", width: u(size), height: u(size), display: "flex", flexShrink: 0 }}>
      <div style={{ width: u(size), height: u(size), borderRadius: u(size), background: ring, display: "flex", alignItems: "center", justifyContent: "center" }}>
        {png ? (
          // eslint-disable-next-line @next/next/no-img-element -- drawn by ImageResponse, not a browser
          <img src={png} width={u(inner)} height={u(inner)} style={{ borderRadius: u(inner) }} alt="" />
        ) : (
          <div style={{ width: u(inner), height: u(inner), borderRadius: u(inner), background: tint(name), display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Gabarito", fontSize: u(Math.round(inner * 0.44)), color: "#ffffff" }}>
            {initial(name)}
          </div>
        )}
      </div>
      {fire && (
        <div style={{ position: "absolute", right: u(-3), bottom: u(-3), width: u(18), height: u(18), borderRadius: u(18), background: "#12153f", display: "flex", alignItems: "center", justifyContent: "center" }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- drawn by ImageResponse */}
          <img src={svgUri(glyphSvg("flame", "#ff9a4d", 2.4))} width={u(12)} height={u(12)} alt="" />
        </div>
      )}
    </div>
  );
}

/** A fixed box (the full width of a row) so every tile's squares line up. */
function Squares({ rows, cols }: { rows: CellStatus[][]; cols: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", width: u(cols * 8 + (cols - 1) * 2), flexShrink: 0 }}>
      {rows.map((row, i) => (
        <div key={i} style={{ display: "flex", marginTop: i ? u(2) : 0 }}>
          {row.slice(0, cols).map((c, j) => (
            <div key={j} style={{ width: u(8), height: u(8), borderRadius: u(2), background: CELL[c], marginLeft: j ? u(2) : 0 }} />
          ))}
        </div>
      ))}
    </div>
  );
}

function Header({ kicker, title, pill }: { kicker: string; title: string; pill: string }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", height: u(HEADER_H) }}>
      <div style={{ display: "flex", flexDirection: "column", flexGrow: 1, flexShrink: 1, minWidth: 0, marginRight: u(12), overflow: "hidden" }}>
        <div style={{ display: "flex", fontSize: u(10), fontWeight: 600, letterSpacing: u(1.4), color: KICKER }}>{kicker.toUpperCase()}</div>
        <div style={{ display: "flex", marginTop: u(5), fontFamily: "Gabarito", fontSize: u(22), lineHeight: 1.05, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</div>
      </div>
      <div style={{ display: "flex", flexShrink: 0, fontSize: u(12), fontWeight: 600, padding: `${u(6)}px ${u(10)}px`, borderRadius: u(999), background: "rgba(255,255,255,0.12)", border: `${u(1)}px solid rgba(255,255,255,0.2)`, whiteSpace: "nowrap" }}>
        {pill}
      </div>
    </div>
  );
}

function Footer({ left }: { left: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", height: u(FOOTER_H), marginTop: u(14), fontSize: u(11.5), fontWeight: 500, color: KICKER, whiteSpace: "nowrap" }}>
      <div style={{ display: "flex" }}>{left}</div>
      <div style={{ display: "flex" }}>gameshuffle.co/daily</div>
    </div>
  );
}

function Ground({ h, children }: { h: number; children: ReactNode }) {
  return (
    <div style={{ width: u(W), height: u(h), display: "flex", position: "relative", color: "#ffffff", fontFamily: "Outfit", background: "#12153f" }}>
      <div style={{ position: "absolute", top: 0, left: 0, width: u(W), height: u(h), display: "flex", background: "radial-gradient(circle at 0% 0%, #2a3fb8 0%, #1a2063 48%, #12153f 100%)" }} />
      {/* eslint-disable-next-line @next/next/no-img-element -- drawn by ImageResponse */}
      <img src={svgUri(fieldSvg(FIELD, u(W), u(h), u(56)))} width={u(W)} height={u(h)} style={{ position: "absolute", top: 0, left: 0 }} alt="" />
      <div style={{ position: "absolute", top: u(PAD), left: u(PAD), width: u(W - PAD * 2), display: "flex", flexDirection: "column" }}>
        {children}
      </div>
    </div>
  );
}

async function draw(el: ReactElement, h: number): Promise<Buffer> {
  const [gabarito, outfit500, outfit600] = await fonts();
  const res = new ImageResponse(el, {
    width: u(W),
    height: u(h),
    fonts: [
      { name: "Gabarito", data: gabarito, weight: 700, style: "normal" },
      { name: "Outfit", data: outfit500, weight: 500, style: "normal" },
      { name: "Outfit", data: outfit600, weight: 600, style: "normal" },
    ],
  });
  return Buffer.from(await res.arrayBuffer());
}

const where = (number: number, channel: string | null) => (channel ? `#${number} in #${clip(channel, 18)}` : `The Daily #${number}`);

// ---------------------------------------------------------------- today's card

const TILE_H = 74;
const TILE_GAP_X = 10;
const TILE_GAP_Y = 8;
const TILE_W = (W - PAD * 2 - TILE_GAP_X) / 2;
/** Most faces on one card; the footer counts the rest. */
export const CARD_MAX_FACES = 12;

export async function renderDailyCard(input: {
  number: number;
  game: string;
  channel: string | null;
  max: number;
  /** Squares per row (the puzzle's columns). */
  cols: number;
  /** Already sorted; only the first CARD_MAX_FACES are drawn. */
  players: CardPlayer[];
}): Promise<Buffer> {
  const shown = input.players.slice(0, CARD_MAX_FACES);
  const extra = input.players.length - shown.length;
  const finished = input.players.filter((p) => p.finished).length;
  const faces = await Promise.all(shown.map((p) => facePng(p.avatar, 96)));
  const rows = Math.ceil(shown.length / 2);
  // Tile width less its padding and border, the face, the gaps either side of the text and the squares.
  const textW = TILE_W - 22 - 42 - 20 - (input.cols * 8 + (input.cols - 1) * 2);
  const h = PAD + HEADER_H + 14 + rows * TILE_H + (rows - 1) * TILE_GAP_Y + 14 + FOOTER_H + PAD;
  const played = input.players.length;
  const left = `${played} played · ${finished} finished${extra > 0 ? ` · ${extra} more not shown` : ""}`;

  return draw(
    <Ground h={h}>
      <Header kicker="The Daily Shuffle" title={where(input.number, input.channel)} pill={clip(input.game, 26)} />
      <div style={{ display: "flex", flexWrap: "wrap", marginTop: u(14), width: u(W - PAD * 2) }}>
        {shown.map((p, i) => {
          const ring = p.finished ? (p.solved ? RING.solved : RING.out) : RING.playing;
          return (
            <div key={i} style={{ width: u(TILE_W), height: u(TILE_H), marginLeft: i % 2 ? u(TILE_GAP_X) : 0, marginTop: i >= 2 ? u(TILE_GAP_Y) : 0, display: "flex", alignItems: "center", padding: `0 ${u(10)}px`, borderRadius: u(12), background: "rgba(255,255,255,0.07)", border: `${u(1)}px solid rgba(255,255,255,0.1)` }}>
              <Avatar png={faces[i]} name={p.name} size={42} ring={ring} fire={p.streak >= 3} />
              <div style={{ display: "flex", flexDirection: "column", width: u(textW), margin: `0 ${u(10)}px`, overflow: "hidden" }}>
                <Line text={clip(p.name, 24)} width={textW} size={14} />
                <Line text={vibe(p, input.max)} width={textW} size={12} weight={500} color={SOFT} mt={3} />
              </div>
              <Squares rows={p.rows.slice(0, input.max)} cols={input.cols} />
            </div>
          );
        })}
      </div>
      <Footer left={left} />
    </Ground>,
    h,
  );
}

// ---------------------------------------------------------------- the morning podium

const PODIUM_H = 196;
const STEP = [
  { place: 1, width: 180, face: 64, ring: "#ffd34d", ringWidth: 3, block: 70, fill: "linear-gradient(180deg, rgba(255,211,77,0.38), rgba(255,211,77,0.12))" },
  { place: 2, width: 160, face: 52, ring: "#c9d1e6", ringWidth: 2, block: 50, fill: "rgba(255,255,255,0.10)" },
  { place: 3, width: 160, face: 52, ring: "#d9945a", ringWidth: 2, block: 36, fill: "rgba(255,255,255,0.08)" },
];

export async function renderPodium(input: {
  number: number;
  game: string;
  channel: string | null;
  /** The best solvers, best first (up to 3). */
  top: CardPlayer[];
  played: number;
  solved: number;
  /** Days in a row someone in this channel solved it. */
  streak: number;
}): Promise<Buffer> {
  const top = input.top.slice(0, 3);
  const faces = await Promise.all(top.map((p) => facePng(p.avatar, 128)));
  const showStreak = input.streak >= 2;
  const h = PAD + HEADER_H + 14 + PODIUM_H + (showStreak ? 14 + 36 : 0) + 14 + FOOTER_H + PAD;
  // Second, first, third, left to right.
  const order = [1, 0, 2];

  return draw(
    <Ground h={h}>
      <Header kicker="Yesterday's Daily" title={where(input.number, input.channel)} pill={clip(input.game, 26)} />
      <div style={{ display: "flex", justifyContent: "center", alignItems: "flex-end", marginTop: u(14), height: u(PODIUM_H) }}>
        {order.map((idx, col) => {
          const step = STEP[idx];
          const p = top[idx];
          return (
            <div key={col} style={{ width: u(step.width), height: u(PODIUM_H), marginLeft: col ? u(12) : 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end" }}>
              {p && <Avatar png={faces[idx]} name={p.name} size={step.face} ring={step.ring} ringWidth={step.ringWidth} fire={p.streak >= 3} />}
              {p && <Line text={clip(p.name, 24)} width={step.width - 8} size={14} center mt={8} />}
              {p && <Line text={`in ${p.guesses}`} width={step.width - 8} size={12} weight={500} color={SOFT} center mt={2} />}
              <div style={{ display: "flex", marginTop: u(8), width: u(step.width), height: u(step.block), alignItems: "center", justifyContent: "center", borderRadius: `${u(10)}px ${u(10)}px ${u(4)}px ${u(4)}px`, background: p ? step.fill : "rgba(255,255,255,0.04)", border: `${u(1)}px solid rgba(255,255,255,${p ? 0.16 : 0.08})`, fontFamily: "Gabarito", fontSize: u(20), color: p ? "#ffffff" : "rgba(255,255,255,0.35)" }}>
                {String(step.place)}
              </div>
            </div>
          );
        })}
      </div>
      {showStreak && (
        <div style={{ display: "flex", alignItems: "center", marginTop: u(14), height: u(36), padding: `0 ${u(12)}px`, borderRadius: u(10), background: "rgba(255,140,60,0.16)", border: `${u(1)}px solid rgba(255,160,80,0.3)`, fontSize: u(13), fontWeight: 600, whiteSpace: "nowrap" }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- drawn by ImageResponse */}
          <img src={svgUri(glyphSvg("flame", "#ff9a4d", 2.2))} width={u(16)} height={u(16)} style={{ marginRight: u(8) }} alt="" />
          <Line text={`${input.channel ? `#${clip(input.channel, 22)}` : "This channel"} has solved it ${input.streak} days running`} width={W - PAD * 2 - 24 - 24 - 2} size={13} />
        </div>
      )}
      <Footer left={`${input.played} played · ${input.solved} solved`} />
    </Ground>,
    h,
  );
}
