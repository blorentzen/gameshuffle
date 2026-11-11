/**
 * The war card's picture (war tools walkthrough https://claude.ai/artifact/TGuceXNmWkKrh5BVpgJNBT, picked
 * 2026-10-31): both teams with their logos and totals, this race's places with ours lit, a marker per race,
 * and the comeback line ("Night Owls need to average +15 a race · 6 left", or who can't be caught). Black and
 * ice with the competitive app's checkered corner. Drawn at twice the size; every text has a fixed box.
 *
 * Other formats (team sizes picks 2026-11-10): the room's own places (two rows of 12 in a 24-player room). With
 * several teams, standings with the gap to the leader replace the two scores, the race's places wear each team's
 * color, and each race's marker the color of the team that won it.
 */

import { symbolFonts } from "@/lib/og/symbolFonts";
import "server-only";
import type { ReactElement } from "react";
import { ImageResponse } from "next/og";
import sharp from "sharp";
import { fonts, svgUri } from "@/lib/og/eventCard";
import { trackTitle } from "@/lib/timeTrials/codes";
import { signed, warTrack, type Standing, type WarSide } from "./rules";
import { formatLabel, isDefaultFormat, placesOf, placePoints, pointsTable, raceWinner, roomOf, teamColor, teamScores } from "./format";
import { warStanding, warTeams, type War, type WarTeamRef } from "./store";

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

/** A marker per race: won or lost (two teams), or the winning team's color (several). */
function Pips({ colors, total }: { colors: (string | undefined)[]; total: number }) {
  const gap = total > 16 ? 2 : 4;
  const w = (INNER - gap * (total - 1)) / total;
  return (
    <div style={{ display: "flex", width: u(INNER) }}>
      {Array.from({ length: total }, (_, i) => (
        <div key={i} style={{ width: u(w), height: u(7), borderRadius: u(4), background: colors[i] ?? "rgba(255,255,255,0.08)", marginLeft: i ? u(gap) : 0 }} />
      ))}
    </div>
  );
}

const TIE = "#6c7a8a";
function pipColors(war: War, s: Standing): string[] {
  if (war.format.teams === 2) return s.diffs.map((d) => (d > 0 ? WIN : d < 0 ? LOSS : TIE));
  return [...war.races].sort((a, b) => a.n - b.n).map((r) => {
    const t = raceWinner(r, war.game, war.format);
    return t == null ? TIE : teamColor(t);
  });
}

/** One row of places, or two rows of 12 in a 24-player room. `owner[k]` is the team at place k + 1 (-1: none). */
function Strip({ owner, lit }: { owner: number[]; lit: (team: number) => string | null }) {
  const gap = 4;
  const per = owner.length > 12 ? 12 : owner.length;
  const w = (INNER - gap * (per - 1)) / per;
  const rows = Array.from({ length: Math.ceil(owner.length / per) }, (_, r) => owner.slice(r * per, (r + 1) * per));
  return (
    <div style={{ display: "flex", flexDirection: "column", width: u(INNER) }}>
      {rows.map((list, r) => (
        <div key={r} style={{ display: "flex", width: u(INNER), marginTop: r ? u(gap) : 0 }}>
          {list.map((t, i) => {
            const bg = t >= 0 ? lit(t) : null;
            return (
              <div key={i} style={{ width: u(w), height: u(24), marginLeft: i ? u(gap) : 0, borderRadius: u(5), background: bg ?? "rgba(255,255,255,0.06)", color: bg ? "#04121e" : "#6c8095", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Gabarito", fontSize: u(12) }}>
                {String(r * per + i + 1)}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

const stripHeight = (room: number) => (room > 12 ? 24 * 2 + 4 : 24);

/** The team at each place of a race (-1 for a race that only has points). */
function owners(war: War, race: War["races"][number]): number[] {
  const room = roomOf(war.format);
  const all = placesOf(race, war.format);
  const out = Array.from({ length: room }, () => -1);
  all?.forEach((list, t) => list.forEach((p) => { if (p >= 1 && p <= room) out[p - 1] = t; }));
  return out;
}

/** Several teams: every team's total, best first, with its gap to the leader; yours lit. */
function Standings({ war, s, logos }: { war: War; s: Standing; logos: (string | null)[] }) {
  const teams = warTeams(war);
  const two = teams.length > 6;
  const colW = two ? (INNER - 24 - 8) / 2 : INNER - 24;
  const rowsPer = Math.ceil(teams.length / (two ? 2 : 1));
  const cols = two ? [s.order.slice(0, rowsPer), s.order.slice(rowsPer)] : [s.order];
  const lead = s.totals[s.order[0]] ?? 0;
  // Only picture logos here: a lettered tile at this size can't hold a tag, and the name is beside it anyway.
  const slot = logos.some(Boolean) ? 26 : 0;
  return (
    <div style={{ display: "flex", width: u(INNER), padding: `${u(8)}px ${u(12)}px`, borderRadius: u(12), background: PANEL, border: `${u(1)}px solid rgba(140,200,240,0.14)` }}>
      {cols.map((list, c) => (
        <div key={c} style={{ display: "flex", flexDirection: "column", width: u(colW), marginLeft: c ? u(8) : 0 }}>
          {list.map((t, i) => {
            const rank = c * rowsPer + i + 1;
            const gap = s.totals[t] - lead;
            const ours = t === 0;
            return (
              <div key={t} style={{ display: "flex", alignItems: "center", width: u(colW), height: u(28), marginTop: i ? u(4) : 0, padding: `0 ${u(6)}px`, borderRadius: u(8), background: ours ? "rgba(140,200,240,0.12)" : "transparent" }}>
                <Line text={String(rank)} width={16} size={13} color={SOFT} family="Gabarito" />
                <div style={{ width: u(8), height: u(8), borderRadius: u(4), background: teamColor(t), marginRight: u(6), flexShrink: 0 }} />
                {slot > 0 && (logos[t] ? <Logo team={teams[t]} png={logos[t]} size={20} /> : <div style={{ width: u(20), flexShrink: 0 }} />)}
                <div style={{ display: "flex", marginLeft: slot ? u(6) : 0 }}><Line text={teamName(teams[t])} width={colW - 12 - 16 - 14 - slot - 44 - 44} size={13} /></div>
                <Line text={String(s.totals[t])} width={44} size={15} family="Gabarito" align="right" />
                <Line text={rank === 1 ? "" : signed(gap)} width={44} size={12} weight={500} color={SOFT} align="right" />
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

const standingsHeight = (teams: number) => 8 * 2 + Math.ceil(teams / (teams > 6 ? 2 : 1)) * 32 - 4 + 2;

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
/** A side's name: yours, or `them` = the other team (two teams) or the standing's rival (several). */
const sideName = (war: War, side: WarSide, s?: Standing) => teamName(side === "us" ? war.us : warTeams(war)[s?.rival ?? 1] ?? war.them);

/** Who scored most when every race was tapped in by the players themselves. */
export function topScorer(war: War): { name: string; points: number } | null {
  if (!war.races.length || war.races.some((r) => !r.players?.length)) return null;
  const table = pointsTable(war.game, roomOf(war.format)) ?? [];
  const pts = new Map<string, { name: string; points: number }>();
  for (const r of war.races) {
    for (const p of r.players ?? []) {
      const now = pts.get(p.id) ?? { name: p.name, points: 0 };
      now.points += placePoints(table, p.place);
      pts.set(p.id, now);
    }
  }
  return [...pts.values()].sort((a, b) => b.points - a.points)[0] ?? null;
}

/** A race's swing for your team: against the other team, or against the rival with several teams. */
const raceDiff = (war: War, r: War["races"][number], rival: number) => {
  const sc = teamScores(r, war.game, war.format);
  return (sc[0] ?? 0) - (sc[rival] ?? 0);
};

export interface WarPicture { png: Buffer; alt: string }

/** `frame` (in card units, e.g. 600 × 315 for a link preview): draw the card centered on a box of that size. */
export async function renderWarCard(war: War, opts: { frame?: { w: number; h: number } } = {}): Promise<WarPicture> {
  const s = warStanding(war);
  const teams = warTeams(war);
  const several = war.format.teams > 2;
  const allLogos = await Promise.all(teams.map((t) => logoPng(t.logo, u(several ? 20 : 40))));
  const logos = [allLogos[0] ?? null, allLogos[1] ?? null] as [string | null, string | null];
  const last = war.races[war.races.length - 1] ?? null;
  const over = war.status !== "live";
  const pillColor = s.diff > 0 ? { bg: "rgba(47,163,107,0.18)", fg: "#57d49a" } : s.diff < 0 ? { bg: "rgba(200,72,75,0.2)", fg: "#ff8f8f" } : { bg: "rgba(140,200,240,0.14)", fg: ICE };
  const vs = several ? formatLabel(war.format) : `${teamName(war.us)} vs ${teamName(war.them)}`;
  const room = roomOf(war.format);
  const fmtText = `${GAME_LABEL[war.game]} · ${formatLabel(war.format)} · ${war.racesTotal} races`;
  // A two-team war of another size says so beside the race (several teams say it on the right).
  const sizeTag = !several && !isDefaultFormat(war.format) ? ` · ${formatLabel(war.format)}` : "";
  /** The scores in the middle: the two teams, or the standings. */
  const scores = (pill: string, pc: { bg: string; fg: string }, us: number, them: number) => (several ? <Standings war={war} s={s} logos={allLogos} /> : <ScoreRow war={war} us={us} them={them} pill={pill} pillColor={pc} logos={logos} />);
  const midH = several ? standingsHeight(teams.length) : 54;
  const standingsAlt = () => s.order.map((t, i) => `${i + 1}. ${teams[t].tag} ${s.totals[t]}`).join(", ");
  const pips = pipColors(war, s);

  let body: ReactElement;
  let h: number;
  let alt: string;

  if (over) {
    const winner = s.diff > 0 ? "us" : s.diff < 0 ? "them" : null;
    const lead = teams[s.order[0]];
    const tiedTop = several && s.order.length > 1 && s.totals[s.order[0]] === s.totals[s.order[1]];
    const headline = several
      ? war.status === "ended" && war.races.length < war.racesTotal
        ? `Ended after race ${war.races.length}: ${tiedTop ? `level at the top on ${s.totals[s.order[0]]}` : `${teamName(lead)} led with ${s.totals[s.order[0]]}`}`
        : tiedTop ? `A tie at the top on ${s.totals[s.order[0]]}` : `${teamName(lead)} won with ${s.totals[s.order[0]]}`
      : war.status === "ended" && war.races.length < war.racesTotal
        ? `Ended after race ${war.races.length}: ${winner ? `${sideName(war, winner)} led ${Math.max(s.us, s.them)} to ${Math.min(s.us, s.them)}` : `level at ${s.us}`}`
        : winner ? `${sideName(war, winner)} won ${Math.max(s.us, s.them)} to ${Math.min(s.us, s.them)}` : `A tie, ${s.us} to ${s.them}`;
    const best = war.races.length ? war.races.reduce((a, r) => (raceDiff(war, r, s.rival) > raceDiff(war, a, s.rival) ? r : a)) : null;
    const bestText = best ? `Best race: race ${best.n}, ${signed(raceDiff(war, best, s.rival))}${best.track ? ` · ${trackLabelShort(war, best.track)}` : ""}` : "";
    const top = topScorer(war);
    h = PAD + 20 + 10 + midH + 12 + 30 + 10 + 7 + 12 + 18 + PAD;
    alt = several
      ? `${fmtText}, final: ${standingsAlt()}. ${headline}.${bestText ? ` ${bestText}.` : ""}${top ? ` Top scorer: ${top.name}, ${top.points}.` : ""}`
      : `${vs}, final: ${war.us.tag} ${s.us}, ${war.them.tag} ${s.them}. ${headline}.${bestText ? ` ${bestText}.` : ""}${top ? ` Top scorer: ${top.name}, ${top.points}.` : ""}`;
    body = (
      <div style={{ display: "flex", flexDirection: "column", width: u(INNER) }}>
        <div style={{ display: "flex", width: u(INNER) }}>
          <Line text={(war.status === "done" ? `Final · ${war.racesTotal} races` : "Final") + sizeTag} width={INNER * 0.45} size={13} />
          <Line text={vs} width={INNER * 0.55} size={13} weight={500} color={SOFT} align="right" />
        </div>
        <div style={{ display: "flex", marginTop: u(10) }}>{scores(signed(s.diff), pillColor, s.us, s.them)}</div>
        <div style={{ display: "flex", marginTop: u(12) }}><Line text={headline} width={INNER} size={22} family="Gabarito" /></div>
        <div style={{ display: "flex", marginTop: u(10) }}><Pips colors={pips} total={war.racesTotal} /></div>
        <div style={{ display: "flex", marginTop: u(12), width: u(INNER) }}>
          <Line text={bestText} width={INNER * 0.6} size={13} weight={500} color={SOFT} />
          <Line text={top ? `Top scorer: ${top.name}, ${top.points}` : ""} width={INNER * 0.4} size={13} weight={500} color={SOFT} align="right" />
        </div>
      </div>
    );
  } else if (!last) {
    h = PAD + 20 + 10 + midH + 12 + 18 + 10 + 7 + PAD;
    alt = several
      ? `${teams.map((t) => t.tag).join(", ")}: ${fmtText}. No races in yet.`
      : `${vs} is on: ${GAME_LABEL[war.game]}${isDefaultFormat(war.format) ? "" : `, ${formatLabel(war.format)}`}, ${war.racesTotal} races. No races in yet.`;
    body = (
      <div style={{ display: "flex", flexDirection: "column", width: u(INNER) }}>
        <div style={{ display: "flex", width: u(INNER) }}>
          <Line text={several ? "Race 1 is next" : vs} width={INNER * 0.4} size={13} />
          <Line text={fmtText} width={INNER * 0.6} size={13} weight={500} color={SOFT} align="right" />
        </div>
        <div style={{ display: "flex", marginTop: u(10) }}>{scores("Race 1", { bg: "rgba(140,200,240,0.14)", fg: ICE }, 0, 0)}</div>
        <div style={{ display: "flex", marginTop: u(12) }}><Line text={`Started by ${war.startedByName ?? "someone"}`} width={INNER} size={13} weight={500} color={SOFT} /></div>
        <div style={{ display: "flex", marginTop: u(10) }}><Pips colors={[]} total={war.racesTotal} /></div>
      </div>
    );
  } else {
    const raceSwing = raceDiff(war, last, s.rival);
    const pointsOnly = !last.spots.length;
    const comeback = s.decided
      ? `${sideName(war, s.decided, s)} can't be caught: up ${Math.abs(s.diff)} with ${s.left === 1 ? "one race" : `${s.left} races`} left`
      : s.need ? `${sideName(war, s.need.side, s)} need to average ${signed(s.need.avg)} a race · ${s.left} left` : `Level · ${s.left} left`;
    const trackText = last.track ? ` · ${trackLabelLong(war, last.track)}` : "";
    const owner = owners(war, last);
    // Two teams: only your places lit, as always. Several: each team's in its color.
    const lit = (t: number) => (several ? teamColor(t) : t === 0 ? ICE : null);
    const raceScoresText = teamScores(last, war.game, war.format).map((v, t) => `${teams[t]?.tag} ${v}`).join(", ");
    h = PAD + 20 + 10 + midH + 12 + (pointsOnly ? 24 : stripHeight(room)) + 10 + 18 + 10 + 7 + PAD;
    alt = several
      ? `After race ${last.n} of ${war.racesTotal}${trackText}: ${standingsAlt()}. This race: ${raceScoresText}. ${comeback}.`
      : `After race ${last.n} of ${war.racesTotal}${trackText}: ${war.us.tag} ${s.us}, ${war.them.tag} ${s.them} (${signed(s.diff)}). ${pointsOnly ? `This race: ${raceScoresText}` : `${war.us.tag} placed ${last.spots.join(", ")}`}, ${signed(raceSwing)} this race. ${comeback}.`;
    body = (
      <div style={{ display: "flex", flexDirection: "column", width: u(INNER) }}>
        <div style={{ display: "flex", width: u(INNER) }}>
          <Line text={`Race ${last.n} of ${war.racesTotal}${sizeTag}${trackText}`} width={INNER * 0.6} size={13} />
          <Line text={vs} width={INNER * 0.4} size={13} weight={500} color={SOFT} align="right" />
        </div>
        <div style={{ display: "flex", marginTop: u(10) }}>{scores(signed(s.diff), pillColor, s.us, s.them)}</div>
        <div style={{ display: "flex", marginTop: u(12) }}>
          {pointsOnly ? <Line text={`Points only (carried over): ${raceScoresText}`} width={INNER} size={13} weight={500} color={SOFT} /> : <Strip owner={owner} lit={lit} />}
        </div>
        <div style={{ display: "flex", marginTop: u(10), width: u(INNER) }}>
          <Line text={`${signed(raceSwing)} this race`} width={110} size={13} color={raceSwing > 0 ? "#57d49a" : raceSwing < 0 ? "#ff8f8f" : SOFT} />
          <Line text={comeback} width={INNER - 110} size={13} weight={500} color={s.decided ? "#f2c14e" : "#c9d6e1"} align="right" />
        </div>
        <div style={{ display: "flex", marginTop: u(10) }}><Pips colors={pips} total={war.racesTotal} /></div>
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
      ...(await symbolFonts()),
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
