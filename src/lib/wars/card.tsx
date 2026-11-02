/**
 * The war card's picture (war tools walkthrough https://claude.ai/artifact/TGuceXNmWkKrh5BVpgJNBT, picked
 * 2026-10-31): both teams with their logos and totals, this race's 12 places with ours lit, a marker per race,
 * and the comeback line ("Night Owls need to average +15 a race · 6 left", or who can't be caught). Black and
 * ice with the competitive app's checkered corner. Drawn at twice the size; every text has a fixed box.
 */

import "server-only";
import type { ReactElement } from "react";
import { ImageResponse } from "next/og";
import sharp from "sharp";
import { fonts, svgUri } from "@/lib/og/eventCard";
import { trackTitle } from "@/lib/timeTrials/codes";
import { raceScore, signed, standing, warTrack, type WarSide } from "./rules";
import type { War, WarTeamRef } from "./store";

const S = 2;
const u = (n: number) => n * S;
const W = 560;
const PAD = 16;
const INNER = W - PAD * 2;

const INK = "#eef4f8";
const SOFT = "#a3b6c6";
const ICE = "#8cc8f0";
const GROUND = "#020406";
const PANEL = "rgba(16,26,40,0.92)";
const WIN = "#2fa36b";
const LOSS = "#c8484b";
const TINTS = ["#1f5f9a", "#5b2a8a", "#2b6a4a", "#8a3b1f", "#3b3f8f", "#7a6a12", "#6a1f2a", "#1f4f6a"];
const tint = (tag: string) => TINTS[[...tag].reduce((a, c) => a + c.charCodeAt(0), 0) % TINTS.length];

const clip = (s: string, n: number) => {
  const chars = [...s.trim()];
  return chars.length > n ? `${chars.slice(0, n - 1).join("").trimEnd()}…` : chars.join("");
};
const teamName = (t: WarTeamRef) => t.name || t.tag;

function Line({ text, width, size, weight = 600, color = INK, align = "left", family }: {
  text: string; width: number; size: number; weight?: number; color?: string; align?: "left" | "right"; family?: string;
}) {
  return (
    <div style={{ display: "flex", width: u(width), justifyContent: align === "right" ? "flex-end" : "flex-start", flexShrink: 0 }}>
      <div style={{ display: "flex", maxWidth: u(width), fontSize: u(size), fontWeight: weight, color, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis", ...(family ? { fontFamily: family } : {}) }}>{text}</div>
    </div>
  );
}

/** One even checkerboard, faded from the top-right corner (no grey: ice squares on black under a mask). */
function checker(w: number, h: number): string {
  const sq = u(8);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${u(w)}" height="${u(h)}">
<defs>
<pattern id="p" width="${sq * 2}" height="${sq * 2}" patternUnits="userSpaceOnUse"><rect width="${sq}" height="${sq}" fill="${ICE}"/><rect x="${sq}" y="${sq}" width="${sq}" height="${sq}" fill="${ICE}"/></pattern>
<radialGradient id="g" cx="1" cy="0" r="0.75"><stop offset="0" stop-color="#fff" stop-opacity="0.26"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
<mask id="m"><rect width="100%" height="100%" fill="url(#g)"/></mask>
</defs>
<rect width="100%" height="100%" fill="url(#p)" mask="url(#m)"/>
</svg>`;
}

const logoCache = new Map<string, Promise<string | null>>();
/** A team's logo as a PNG data URI at `px` (only MKCentral's registry and our own storage are fetched). */
export function logoPng(url: string | null, px = u(40)): Promise<string | null> {
  if (!url) return Promise.resolve(null);
  let host: string;
  try { host = new URL(url).host; } catch { return Promise.resolve(null); }
  if (!["mkcentral.com", "gs-ugc.empac.co", "cdn.empac.co"].includes(host)) return Promise.resolve(null);
  const key = `${px}|${url}`;
  if (!logoCache.has(key)) {
    logoCache.set(key, (async () => {
      const res = await fetch(url, { signal: AbortSignal.timeout(2500) }).catch(() => null);
      if (!res?.ok) return null;
      const buf = Buffer.from(await res.arrayBuffer());
      const png = await sharp(buf).resize(px, px, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer().catch(() => null);
      return png ? `data:image/png;base64,${png.toString("base64")}` : null;
    })());
    if (logoCache.size > 300) logoCache.delete(logoCache.keys().next().value!);
  }
  return logoCache.get(key)!;
}

function Logo({ team, png, size = 36 }: { team: WarTeamRef; png: string | null; size?: number }) {
  return png ? (
    // eslint-disable-next-line @next/next/no-img-element -- drawn by ImageResponse, not a browser
    <img src={png} width={u(size)} height={u(size)} style={{ borderRadius: u(size), flexShrink: 0 }} alt="" />
  ) : (
    <div style={{ width: u(size), height: u(size), borderRadius: u(size), background: tint(team.tag), display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontFamily: "Gabarito", fontSize: u(team.tag.length > 3 ? 9 : 11), color: "#ffffff" }}>
      {clip(team.tag, 4)}
    </div>
  );
}

function Pips({ diffs, total }: { diffs: number[]; total: number }) {
  const gap = 4;
  const w = (INNER - gap * (total - 1)) / total;
  return (
    <div style={{ display: "flex", width: u(INNER) }}>
      {Array.from({ length: total }, (_, i) => {
        const d = diffs[i];
        const bg = d === undefined ? "rgba(255,255,255,0.08)" : d > 0 ? WIN : d < 0 ? LOSS : "#6c7a8a";
        return <div key={i} style={{ width: u(w), height: u(7), borderRadius: u(4), background: bg, marginLeft: i ? u(gap) : 0 }} />;
      })}
    </div>
  );
}

function Strip({ spots }: { spots: number[] }) {
  const gap = 4;
  const w = (INNER - gap * 11) / 12;
  return (
    <div style={{ display: "flex", width: u(INNER) }}>
      {Array.from({ length: 12 }, (_, i) => {
        const ours = spots.includes(i + 1);
        return (
          <div key={i} style={{ width: u(w), height: u(24), marginLeft: i ? u(gap) : 0, borderRadius: u(5), background: ours ? ICE : "rgba(255,255,255,0.06)", color: ours ? "#04121e" : "#6c8095", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Gabarito", fontSize: u(12) }}>
            {String(i + 1)}
          </div>
        );
      })}
    </div>
  );
}

/** Over the total: the team's name, or its tag when the logo is a picture (a lettered logo already says the tag). */
const label = (t: WarTeamRef, png: string | null) => (t.name && t.name !== t.tag ? t.name : png ? t.tag : "");

function ScoreRow({ war, us, them, pill, pillColor, logos }: { war: War; us: number; them: number; pill: string; pillColor: { bg: string; fg: string }; logos: [string | null, string | null] }) {
  const side = (INNER - 24 - 96) / 2;
  return (
    <div style={{ display: "flex", alignItems: "center", width: u(INNER), height: u(54), padding: `0 ${u(12)}px`, borderRadius: u(12), background: PANEL, border: `${u(1)}px solid rgba(140,200,240,0.14)` }}>
      <div style={{ display: "flex", alignItems: "center", width: u(side) }}>
        <Logo team={war.us} png={logos[0]} />
        <div style={{ display: "flex", flexDirection: "column", marginLeft: u(8) }}>
          <Line text={label(war.us, logos[0])} width={side - 46} size={11} color={SOFT} />
          <Line text={String(us)} width={side - 46} size={24} family="Gabarito" />
        </div>
      </div>
      <div style={{ display: "flex", width: u(96), justifyContent: "center" }}>
        <div style={{ display: "flex", padding: `${u(5)}px ${u(12)}px`, borderRadius: u(20), background: pillColor.bg, color: pillColor.fg, fontFamily: "Gabarito", fontSize: u(15) }}>{pill}</div>
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", width: u(side) }}>
        <div style={{ display: "flex", flexDirection: "column", marginRight: u(8), alignItems: "flex-end" }}>
          <Line text={label(war.them, logos[1])} width={side - 46} size={11} color={SOFT} align="right" />
          <Line text={String(them)} width={side - 46} size={24} family="Gabarito" align="right" />
        </div>
        <Logo team={war.them} png={logos[1]} />
      </div>
    </div>
  );
}

const GAME_LABEL: Record<War["game"], string> = { mk8dx: "Mario Kart 8 Deluxe", mkworld: "Mario Kart World" };
const sideName = (war: War, side: WarSide) => teamName(side === "us" ? war.us : war.them);

/** Who scored most when every race was tapped in by the players themselves. */
export function topScorer(war: War): { name: string; points: number } | null {
  if (!war.races.length || war.races.some((r) => !r.players?.length)) return null;
  const pts = new Map<string, { name: string; points: number }>();
  for (const r of war.races) {
    for (const p of r.players ?? []) {
      const now = pts.get(p.id) ?? { name: p.name, points: 0 };
      now.points += [15, 12, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1][p.place - 1] ?? 0;
      pts.set(p.id, now);
    }
  }
  return [...pts.values()].sort((a, b) => b.points - a.points)[0] ?? null;
}

export interface WarPicture { png: Buffer; alt: string }

/** `frame` (in card units, e.g. 600 × 315 for a link preview): draw the card centered on a box of that size. */
export async function renderWarCard(war: War, opts: { frame?: { w: number; h: number } } = {}): Promise<WarPicture> {
  const s = standing(war.races, war.penalties, war.racesTotal);
  const logos = await Promise.all([logoPng(war.us.logo), logoPng(war.them.logo)]) as [string | null, string | null];
  const last = war.races[war.races.length - 1] ?? null;
  const over = war.status !== "live";
  const pillColor = s.diff > 0 ? { bg: "rgba(47,163,107,0.18)", fg: "#57d49a" } : s.diff < 0 ? { bg: "rgba(200,72,75,0.2)", fg: "#ff8f8f" } : { bg: "rgba(140,200,240,0.14)", fg: ICE };
  const vs = `${teamName(war.us)} vs ${teamName(war.them)}`;

  let body: ReactElement;
  let h: number;
  let alt: string;

  if (over) {
    const winner = s.diff > 0 ? "us" : s.diff < 0 ? "them" : null;
    const headline = war.status === "ended" && war.races.length < war.racesTotal
      ? `Ended after race ${war.races.length}: ${winner ? `${sideName(war, winner)} led ${Math.max(s.us, s.them)} to ${Math.min(s.us, s.them)}` : `level at ${s.us}`}`
      : winner ? `${sideName(war, winner)} won ${Math.max(s.us, s.them)} to ${Math.min(s.us, s.them)}` : `A tie, ${s.us} to ${s.them}`;
    const best = war.races.length ? war.races.reduce((a, r) => (raceScore(r.spots).diff > raceScore(a.spots).diff ? r : a)) : null;
    const bestText = best ? `Best race: race ${best.n}, ${signed(raceScore(best.spots).diff)}${best.track ? ` · ${trackLabelShort(war, best.track)}` : ""}` : "";
    const top = topScorer(war);
    h = PAD + 20 + 10 + 54 + 12 + 30 + 10 + 7 + 12 + 18 + PAD;
    alt = `${vs}, final: ${war.us.tag} ${s.us}, ${war.them.tag} ${s.them}. ${headline}.${bestText ? ` ${bestText}.` : ""}${top ? ` Top scorer: ${top.name}, ${top.points}.` : ""}`;
    body = (
      <div style={{ display: "flex", flexDirection: "column", width: u(INNER) }}>
        <div style={{ display: "flex", width: u(INNER) }}>
          <Line text={war.status === "done" ? `Final · ${war.racesTotal} races` : "Final"} width={INNER * 0.45} size={13} />
          <Line text={vs} width={INNER * 0.55} size={13} weight={500} color={SOFT} align="right" />
        </div>
        <div style={{ display: "flex", marginTop: u(10) }}><ScoreRow war={war} us={s.us} them={s.them} pill={signed(s.diff)} pillColor={pillColor} logos={logos} /></div>
        <div style={{ display: "flex", marginTop: u(12) }}><Line text={headline} width={INNER} size={22} family="Gabarito" /></div>
        <div style={{ display: "flex", marginTop: u(10) }}><Pips diffs={s.diffs} total={war.racesTotal} /></div>
        <div style={{ display: "flex", marginTop: u(12), width: u(INNER) }}>
          <Line text={bestText} width={INNER * 0.6} size={13} weight={500} color={SOFT} />
          <Line text={top ? `Top scorer: ${top.name}, ${top.points}` : ""} width={INNER * 0.4} size={13} weight={500} color={SOFT} align="right" />
        </div>
      </div>
    );
  } else if (!last) {
    h = PAD + 20 + 10 + 54 + 12 + 18 + 10 + 7 + PAD;
    alt = `${vs} is on: ${GAME_LABEL[war.game]}, ${war.racesTotal} races. No races in yet.`;
    body = (
      <div style={{ display: "flex", flexDirection: "column", width: u(INNER) }}>
        <div style={{ display: "flex", width: u(INNER) }}>
          <Line text={vs} width={INNER * 0.5} size={13} />
          <Line text={`${GAME_LABEL[war.game]} · 6v6 · ${war.racesTotal} races`} width={INNER * 0.5} size={13} weight={500} color={SOFT} align="right" />
        </div>
        <div style={{ display: "flex", marginTop: u(10) }}><ScoreRow war={war} us={0} them={0} pill="Race 1" pillColor={{ bg: "rgba(140,200,240,0.14)", fg: ICE }} logos={logos} /></div>
        <div style={{ display: "flex", marginTop: u(12) }}><Line text={`Started by ${war.startedByName ?? "someone"}`} width={INNER} size={13} weight={500} color={SOFT} /></div>
        <div style={{ display: "flex", marginTop: u(10) }}><Pips diffs={[]} total={war.racesTotal} /></div>
      </div>
    );
  } else {
    const race = raceScore(last.spots);
    const comeback = s.decided
      ? `${sideName(war, s.decided)} can't be caught: up ${Math.abs(s.diff)} with ${s.left === 1 ? "one race" : `${s.left} races`} left`
      : s.need ? `${sideName(war, s.need.side)} need to average ${signed(s.need.avg)} a race · ${s.left} left` : `Level · ${s.left} left`;
    const trackText = last.track ? ` · ${trackLabelLong(war, last.track)}` : "";
    h = PAD + 20 + 10 + 54 + 12 + 24 + 10 + 18 + 10 + 7 + PAD;
    alt = `After race ${last.n} of ${war.racesTotal}${trackText}: ${war.us.tag} ${s.us}, ${war.them.tag} ${s.them} (${signed(s.diff)}). ${war.us.tag} placed ${last.spots.join(", ")}, ${signed(race.diff)} this race. ${comeback}.`;
    body = (
      <div style={{ display: "flex", flexDirection: "column", width: u(INNER) }}>
        <div style={{ display: "flex", width: u(INNER) }}>
          <Line text={`Race ${last.n} of ${war.racesTotal}${trackText}`} width={INNER * 0.6} size={13} />
          <Line text={vs} width={INNER * 0.4} size={13} weight={500} color={SOFT} align="right" />
        </div>
        <div style={{ display: "flex", marginTop: u(10) }}><ScoreRow war={war} us={s.us} them={s.them} pill={signed(s.diff)} pillColor={pillColor} logos={logos} /></div>
        <div style={{ display: "flex", marginTop: u(12) }}><Strip spots={last.spots} /></div>
        <div style={{ display: "flex", marginTop: u(10), width: u(INNER) }}>
          <Line text={`${signed(race.diff)} this race`} width={110} size={13} color={race.diff > 0 ? "#57d49a" : race.diff < 0 ? "#ff8f8f" : SOFT} />
          <Line text={comeback} width={INNER - 110} size={13} weight={500} color={s.decided ? "#f2c14e" : "#c9d6e1"} align="right" />
        </div>
        <div style={{ display: "flex", marginTop: u(10) }}><Pips diffs={s.diffs} total={war.racesTotal} /></div>
      </div>
    );
  }

  const fw = opts.frame?.w ?? W;
  const fh = opts.frame?.h ?? h;
  const el = (
    <div style={{ width: u(fw), height: u(fh), display: "flex", position: "relative", background: GROUND, color: INK, fontFamily: "Outfit" }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- drawn by ImageResponse */}
      <img src={svgUri(checker(fw, fh))} width={u(fw)} height={u(fh)} style={{ position: "absolute", left: 0, top: 0 }} alt="" />
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", padding: u(PAD), width: u(fw), height: u(fh), position: "relative" }}>{body}</div>
    </div>
  );
  const [gabarito, outfit500, outfit600] = await fonts();
  const res = new ImageResponse(el, {
    width: u(fw),
    height: u(fh),
    fonts: [
      { name: "Gabarito", data: gabarito, weight: 700, style: "normal" },
      { name: "Outfit", data: outfit500, weight: 500, style: "normal" },
      { name: "Outfit", data: outfit600, weight: 600, style: "normal" },
    ],
  });
  return { png: Buffer.from(await res.arrayBuffer()), alt: alt.slice(0, 1000) };
}

function trackLabelLong(war: War, id: string): string {
  const t = warTrack(war.game, id);
  return t ? trackTitle(t) : id;
}
function trackLabelShort(war: War, id: string): string {
  const t = warTrack(war.game, id);
  return t ? (trackTitle(t).match(/\(([^)]+)\)$/)?.[1] ?? t.name) : id;
}
