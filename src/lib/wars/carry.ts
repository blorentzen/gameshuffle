/**
 * Carrying a war over from another bot partway through (team sizes picks 2026-11-10, all as recommended). Pure,
 * client-safe. Reads the running score each war bot posts, as text: Apps ▸ Continue in GameShuffle turns the
 * message's embeds into text (Discord sends a bot the message someone uses a message command on, so no extra
 * permissions), and /war continue takes the same text pasted (desktop Discord lets people select an embed's text).
 *
 * What each bot's message holds (read from their source):
 *   Quaxly: "Total Score after Race 5", both tags with totals, Penalties ("KC: -15"), and a Races block with every
 *     race's swing, places and track name (" 1: +10 | 1,4,6,7,8,9 (Mario Kart Stadium)"). Two teams, 6v6.
 *   Toad Bot: the same title and totals; "Race Scores (first 12)" with each race's points only
 *     (" 1 | 46 - 36 (+10) (MKS)"), and penalties as "Race 3: KC -15". Two teams of 2 to 6: the size comes from the
 *     points a race adds up to (82 is 6v6, 39 is 4v4 …).
 *   Kiwi (Mario Kart World): "KC vs NOR", "222 - 188 (+34)", a field per race ("1 - Peach Beach (GCN) - rPB" /
 *     "46 : 36 (+10) | 1, 4, 6, 7, 8, 9"), Penalties ("KC: -15 punti").
 *   Sokuji: "Sokuji 6v6" then the tags ("KC - NOR"), the totals and races left ("222 : 188(+34)  @7"), a field per
 *     race ("1  - MKS" / "46 : 36(+10) | 1,4,6,7,8,9") with every team's points and the first team's places, and
 *     Penalty or Repick fields ("-15 : 0"). Its smaller formats share a 12-player room (four teams of 3 …).
 *
 * Races with every place come over as places; races with only points (Toad Bot, Sokuji's other teams) come over
 * as points. The check (carryBlock) writes the war in GameShuffle's own short form, which people can fix by hand
 * and which Continue here reads back (readBlock), so nothing waits on the server between the check and the card.
 */

import { readTrack, type WarGame } from "./rules";
import { DEFAULT_FORMAT, formatLabel, formatProblem, pointsTable, raceTotal, roomOf, teamScores, type WarFormat } from "./format";
import { plainDiscord, trackFor } from "@/lib/timeTrials/quaxly";
import { trackCode } from "@/lib/timeTrials/codes";
import { ttTracks } from "@/lib/timeTrials/tracks";

export type CarryFrom = "Quaxly" | "Toad Bot" | "Kiwi" | "Sokuji";
export const CARRY_FROM: readonly CarryFrom[] = ["Quaxly", "Toad Bot", "Kiwi", "Sokuji"];

export interface CarryRace {
  n: number;
  /** The first team's places (empty when the race only has points). */
  spots: number[];
  /** Several teams: the other teams' places, when the message has them. */
  places?: number[][];
  /** Every team's points, when the message has points but not every place. */
  scores?: number[];
  /** The track's id, and what the message called it when GameShuffle couldn't tell which track it was. */
  track: string | null;
  trackText: string | null;
}

export interface CarryWar {
  from: CarryFrom;
  game: WarGame;
  format: WarFormat;
  tags: string[];
  races: CarryRace[];
  /** Points off each team (by its number). */
  penalties: { team: number; points: number }[];
  racesTotal: number;
  /** Each team's total as the other bot showed it, to check against (null when it didn't show them). */
  totals: number[] | null;
}

export type CarryRead = { ok: true; war: CarryWar; notes: string[] } | { ok: false; error: string };

// ── Lines and tracks ──────────────────────────────────────────────────────────────────────────────

const EMOJI = /[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu;
// A code block that starts on its opening line ("```Race 2: NOR -2", Toad Bot's penalties) would lose its first word
// as a language name, so the opening fence gets its own line first.
const lines = (text: string) => plainDiscord(text.replace(/```(?!\n)/g, "```\n")).replace(EMOJI, "").split(/\r?\n/).map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);
const int = (s: string) => (/^[+-]?\d+$/.test(s.trim()) ? Number(s.trim()) : null);
const list = (s: string) => s.split(/[,\s]+/).filter(Boolean).map(Number).filter((n) => Number.isInteger(n) && n > 0);

/** A track from what a bot called it: a code ("MKS"), a name ending in its code ("Peach Beach (GCN) - rPB"), or a name. */
function findTrack(raw: string, game: WarGame): { track: string | null; trackText: string | null } {
  const text = raw.trim();
  if (!text) return { track: null, trackText: null };
  const tail = text.includes(" - ") ? text.slice(text.lastIndexOf(" - ") + 3).trim() : null;
  const t = (tail && readTrack(game, tail)) || readTrack(game, text) || trackFor(text, game) || (tail ? trackFor(tail, game) : null);
  return t ? { track: t.id, trackText: null } : { track: null, trackText: text.slice(0, 40) };
}

const codeOf = (game: WarGame, id: string | null) => {
  const t = id ? ttTracks(game).find((x) => x.id === id) : null;
  return t ? trackCode(t) ?? t.name : null;
};

/** The other team's places in a two-team race: the rest of the room. */
const rest = (spots: number[], room: number) => Array.from({ length: room }, (_, k) => k + 1).filter((p) => !spots.includes(p));

/** The two-team size whose race adds up to `sum` (82 is 6v6 in a 12-player room). */
function sizeFromSum(sum: number): number | null {
  for (const size of [6, 5, 4, 3, 2]) {
    const t = pointsTable("mk8dx", size * 2);
    if (t && raceTotal(t) === sum) return size;
  }
  return null;
}

// ── Quaxly and Toad Bot ───────────────────────────────────────────────────────────────────────────

const QUAXLY_RACE = /^(\d{1,2}):\s*([+-]?\d+)\s*\|\s*([0-9,]+)\s*(?:\((.*)\))?$/;
const TOAD_RACE = /^(\d{1,2})\s*\|\s*(\d+)\s*-\s*(\d+)\s*\(([+-]?\d+)\)\s*(?:\((.*)\))?$/;

function totalScore(all: string[], game: WarGame): CarryRead | null {
  const at = all.findIndex((l) => /^Total Score after Race \d+$/i.test(l));
  if (at < 0) return null;
  const played = Number(all[at].match(/\d+$/)![0]);
  const after = all.slice(at + 1);
  // The two teams: a tag line, then its total, before "Difference".
  const tags: string[] = [];
  const totals: number[] = [];
  for (let i = 0; i < after.length - 1 && tags.length < 2; i++) {
    if (/^difference$/i.test(after[i])) break;
    const v = int(after[i + 1]);
    if (v != null && int(after[i]) == null) { tags.push(after[i].slice(0, 12)); totals.push(v); i++; }
  }
  if (tags.length < 2) return { ok: false, error: "I found the score but not both teams in it." };

  const quaxly = after.map((l) => QUAXLY_RACE.exec(l)).filter((m): m is RegExpExecArray => !!m);
  const toad = after.map((l) => TOAD_RACE.exec(l)).filter((m): m is RegExpExecArray => !!m);
  const notes: string[] = [];
  const penalties: CarryWar["penalties"] = [];
  const teamOf = (tag: string) => tags.findIndex((t) => t.toLowerCase() === tag.trim().toLowerCase());

  if (quaxly.length >= toad.length && quaxly.length) {
    // Quaxly: "KC: -15" lines after Penalties.
    const pi = after.findIndex((l) => /^penalties$/i.test(l));
    if (pi >= 0) {
      for (const l of after.slice(pi + 1)) {
        const m = /^(.+?):\s*-(\d+)$/.exec(l);
        if (!m) break;
        const t = teamOf(m[1]);
        if (t >= 0) penalties.push({ team: t, points: Number(m[2]) });
      }
    }
    const races: CarryRace[] = quaxly.map((m) => ({ n: Number(m[1]), spots: list(m[3]).filter((p) => p <= 12), ...findTrack(m[4] ?? "", game) }));
    return finishRead({ from: "Quaxly", game, format: DEFAULT_FORMAT, tags, races, penalties, racesTotal: Math.max(12, played), totals }, played, notes);
  }
  if (toad.length) {
    // Toad Bot: points only. "Race 3: KC -15" lines are penalties.
    for (const l of after) {
      const m = /^Race \d+:\s*(.+?)\s+-(\d+)$/i.exec(l);
      if (!m) continue;
      const t = teamOf(m[1]);
      if (t >= 0) penalties.push({ team: t, points: Number(m[2]) });
    }
    const sum = Number(toad[0][2]) + Number(toad[0][3]);
    const size = sizeFromSum(sum);
    if (!size) return { ok: false, error: `Toad Bot's races add up to ${sum} points, which isn't a Mario Kart 8 Deluxe or Mario Kart World room GameShuffle knows.` };
    const races: CarryRace[] = toad.map((m) => ({ n: Number(m[1]), spots: [], scores: [Number(m[2]), Number(m[3])], ...findTrack(m[5] ?? "", game) }));
    if (played > 12 && races.length === 12) notes.push(`Toad Bot only shows the first 12 races, so races 13 to ${played} aren't here. Add them on the card after it's carried.`);
    return finishRead({ from: "Toad Bot", game, format: { size, teams: 2 }, tags, races, penalties, racesTotal: Math.max(12, played), totals }, played, notes);
  }
  return { ok: false, error: "That score shows the totals but not each race. In Toad Bot, turn on race scores and use its next score message." };
}

// ── Kiwi ──────────────────────────────────────────────────────────────────────────────────────────

function kiwi(all: string[]): CarryRead | null {
  const ti = all.findIndex((l, i) => /^(.+?) vs (.+)$/.test(l) && /^(\d+) - (\d+) \(([+-]?\d+)\)$/.test(all[i + 1] ?? ""));
  if (ti < 0) return null;
  const [, a, b] = /^(.+?) vs (.+)$/.exec(all[ti])!;
  const [, ta, tb] = /^(\d+) - (\d+)/.exec(all[ti + 1])!;
  const tags = [a.slice(0, 12), b.slice(0, 12)];
  const races: CarryRace[] = [];
  const penalties: CarryWar["penalties"] = [];
  for (let i = ti + 2; i < all.length - 1; i++) {
    const name = /^(\d{1,2}) - (.*)$/.exec(all[i]);
    const value = /^(\d+) : (\d+) \(([+-]?\d+)\) \| ([\d,\s]+)$/.exec(all[i + 1]);
    if (name && value) { races.push({ n: Number(name[1]), spots: list(value[4]), ...findTrack(name[2], "mkworld") }); i++; continue; }
    const pen = /^(.+?): -(\d+)(?: punti)?$/.exec(all[i]);
    if (pen) {
      const t = tags.findIndex((x) => x.toLowerCase() === pen[1].trim().toLowerCase());
      if (t >= 0) penalties.push({ team: t, points: Number(pen[2]) });
    }
  }
  if (!races.length) return { ok: false, error: "I found Kiwi's war but no races in it yet." };
  return finishRead({ from: "Kiwi", game: "mkworld", format: DEFAULT_FORMAT, tags, races, penalties, racesTotal: Math.max(12, races.length), totals: [Number(ta), Number(tb)] }, races.length, []);
}

// ── Sokuji ────────────────────────────────────────────────────────────────────────────────────────

/** "222 : 188(+34)" or "a : b : c : d : e : f": each team's number. */
const sokujiScores = (s: string) => s.split(" : ").map((x) => int(x.split("(")[0]) ?? NaN);

function sokuji(all: string[], game: WarGame): CarryRead | null {
  const ti = all.findIndex((l) => /^(Sokuji|即時集計) (\d)v\d$/.test(l));
  if (ti < 0) return null;
  const size = Number(/(\d)v\d$/.exec(all[ti])![1]);
  const tags = (all[ti + 1] ?? "").split(" - ").map((t) => t.trim().slice(0, 12)).filter(Boolean);
  const teams = 12 / size;
  if (!Number.isInteger(teams) || tags.length !== teams) return { ok: false, error: "I found Sokuji's war but couldn't read its teams." };
  const desc = /^(.+?)\s+@(\d+)$/.exec(all[ti + 2] ?? "");
  const totals = desc ? sokujiScores(desc[1]) : null;
  const left = desc ? Number(desc[2]) : null;
  const races: CarryRace[] = [];
  const penalties: CarryWar["penalties"] = [];
  const notes: string[] = [];
  for (let i = ti + 3; i < all.length - 1; i++) {
    const name = /^(\d{1,2})(?:\s+-\s+(.*))?$/.exec(all[i]);
    const value = /^(.+?)\s*\|\s*([\d,]+)$/.exec(all[i + 1]);
    if (name && value) {
      const scores = sokujiScores(value[1]);
      const spots = list(value[2]).filter((p) => p <= 12);
      races.push({ n: Number(name[1]), spots, ...(size === 6 ? {} : { scores }), ...findTrack(name[2] ?? "", game) });
      i++;
      continue;
    }
    if (/^(Penalty|Repick)$/i.test(all[i])) {
      const scores = sokujiScores(all[i + 1] ?? "");
      scores.forEach((v, t) => {
        if (v < 0) penalties.push({ team: t, points: -v });
        else if (v > 0) notes.push(`Sokuji gave ${tags[t]} ${v} extra points; GameShuffle carries penalties only, so that was left out.`);
      });
      i++;
    }
  }
  if (!races.length) return { ok: false, error: "I found Sokuji's war but no races in it yet." };
  const played = races.length;
  return finishRead({ from: "Sokuji", game, format: { size, teams }, tags, races, penalties, racesTotal: left != null ? played + left : 12, totals: totals?.every(Number.isFinite) ? totals : null }, played, notes);
}

// ── Checking what was read ────────────────────────────────────────────────────────────────────────

/** Races in order and numbered from 1, places checked against the room, and the totals compared with the bot's. */
function finishRead(war: CarryWar, played: number, notes: string[]): CarryRead {
  const room = roomOf(war.format);
  war.races = war.races.filter((r, i, a) => a.findIndex((x) => x.n === r.n) === i).sort((a, b) => a.n - b.n);
  if (war.races.some((r, i) => r.n !== i + 1)) return { ok: false, error: `Race ${war.races.find((r, i) => r.n !== i + 1)?.n ?? 1} is out of order or a race is missing. Paste the whole score message.` };
  for (const r of war.races) {
    if (r.spots.length && r.spots.length !== war.format.size) return { ok: false, error: `Race ${r.n} has ${r.spots.length} places; a team in this war has ${war.format.size}.` };
    if (r.spots.some((p) => p > room)) return { ok: false, error: `Race ${r.n} has a place past ${room}th.` };
  }
  if (war.races.length < played) notes.push(`The message says ${played} races, but only ${war.races.length} were in it. The rest can go in on the card.`);
  const missing = war.races.filter((r) => r.trackText);
  if (missing.length) notes.push(`I couldn't tell which track ${missing.map((r) => `race ${r.n} (${r.trackText})`).join(", ")} was. Fix it here or on the card later.`);
  const ours = carryTotals(war);
  if (war.totals && ours.some((v, i) => v !== war.totals![i])) {
    notes.push(`${war.from} shows ${war.totals.join(" to ")}, but these races and penalties add up to ${ours.join(" to ")}. Check the races before you continue.`);
  }
  return { ok: true, war, notes };
}

/** Each team's total from the races and penalties. */
export function carryTotals(war: Pick<CarryWar, "races" | "penalties" | "game" | "format">): number[] {
  const totals = Array.from({ length: war.format.teams }, () => 0);
  for (const r of war.races) teamScores(r, war.game, war.format).forEach((v, i) => { totals[i] += v; });
  for (const p of war.penalties) if (p.team < totals.length) totals[p.team] -= p.points;
  return totals;
}

/**
 * Reads another bot's score message. `game` is the channel's (Kiwi is always Mario Kart World). `us`: the channel's
 * own tag; when it's the second of two teams, the war is turned around so it's first, like every GameShuffle war.
 */
export function readCarry(text: string, game: WarGame, us: string | null = null): CarryRead {
  const all = lines(text);
  if (!all.length) return { ok: false, error: "Paste the other bot's score message." };
  if (all.some((l) => /^Sokuji/i.test(l) || /^即時集計/.test(l)) && !all.some((l) => /^(Sokuji|即時集計) \dv\d$/.test(l))) {
    return { ok: false, error: "I found Sokuji's war but couldn't read its title." };
  }
  const read = totalScore(all, game) ?? sokuji(all, game) ?? kiwi(all);
  if (!read) {
    if (all.some((l) => /^#?title\b|^[A-Z0-9]{1,5}\s*$/i.test(l)) && all.some((l) => /\s\d{1,3}$/.test(l))) {
      return { ok: false, error: "That looks like a table: it has each player's points but not each race. Use the other bot's score message instead." };
    }
    return { ok: false, error: "I couldn't find a war score in that. Use Continue in GameShuffle on Quaxly's, Toad Bot's, Kiwi's or Sokuji's score message." };
  }
  if (!read.ok) return read;
  return { ...read, war: us ? usFirst(read.war, us) : read.war };
}

/** Puts the channel's own team first in a two-team war (its places become the rest of the room). */
function usFirst(war: CarryWar, us: string): CarryWar {
  if (war.format.teams !== 2 || war.tags[1]?.toLowerCase() !== us.toLowerCase()) return war;
  const room = roomOf(war.format);
  return {
    ...war,
    tags: [war.tags[1], war.tags[0]],
    totals: war.totals ? [war.totals[1], war.totals[0]] : null,
    penalties: war.penalties.map((p) => ({ ...p, team: p.team === 0 ? 1 : 0 })),
    races: war.races.map((r) => ({ ...r, spots: r.spots.length ? rest(r.spots, room) : [], ...(r.scores ? { scores: [r.scores[1], r.scores[0]] } : {}) })),
  };
}

// ── GameShuffle's own short form (the check, Fix a race, Continue here) ─────────────────────────

const GAME_NAMES: Record<WarGame, string> = { mk8dx: "Mario Kart 8 Deluxe", mkworld: "Mario Kart World" };

/** One race in the check: "Race 1: 1,4,6,7,8,9 (MKS)", "Race 3: 46-36 points", "Race 1: 1,2,6,9 / 3,4,7,12 / 5,8,10,11", "Race 2: 1,2,6,9 · 38-26-18 points". */
function raceText(r: CarryRace, war: CarryWar): string {
  const several = war.format.teams > 2;
  const places = r.spots.length
    ? several && r.places?.length ? [r.spots, ...r.places].map((l) => l.join(",")).join(" / ") : r.spots.join(",")
    : "";
  const points = r.scores && (!r.spots.length || (several && !r.places?.length)) ? `${r.scores.join("-")} points` : "";
  // A name GameShuffle couldn't place keeps its words, without brackets so the line still reads back.
  const track = codeOf(war.game, r.track) ?? (r.trackText ? `? ${r.trackText.replace(/[()]/g, "")}` : null);
  return `Race ${r.n}: ${[places, points].filter(Boolean).join(" · ")}${track ? ` (${track})` : ""}`;
}

/** The war as the check shows it, and as Fix a race opens it. */
export function carryBlock(war: CarryWar): string {
  return [
    `From ${war.from} · ${GAME_NAMES[war.game]} · ${formatLabel(war.format)} · ${war.racesTotal} races`,
    `Teams: ${war.tags.join(" · ")}`,
    ...war.races.map((r) => raceText(r, war)),
    ...war.penalties.map((p) => `Penalty: ${war.tags[p.team]} ${p.points}`),
  ].join("\n");
}

/** Reads the check's block back (after Fix a race, or for Continue here). */
export function readBlock(text: string): CarryRead {
  const all = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const head = /^From (Quaxly|Toad Bot|Kiwi|Sokuji) · (Mario Kart 8 Deluxe|Mario Kart World) · (\d{1,2})v\d{1,2}(?: · (\d{1,2}) teams)? · (\d{1,2}) races$/.exec(all[0] ?? "");
  if (!head) return { ok: false, error: "The first line has to stay as it was: From …, the game, the format and the races." };
  const game: WarGame = head[2] === "Mario Kart World" ? "mkworld" : "mk8dx";
  const format: WarFormat = { size: Number(head[3]), teams: head[4] ? Number(head[4]) : 2 };
  const problem = formatProblem(game, format);
  if (problem) return { ok: false, error: problem };
  const racesTotal = Number(head[5]);
  if (racesTotal < 1 || racesTotal > 32) return { ok: false, error: "A war runs 1 to 32 races." };
  const teamLine = /^Teams: (.+)$/.exec(all[1] ?? "");
  const tags = teamLine ? teamLine[1].split(" · ").map((t) => t.trim().slice(0, 12)).filter(Boolean) : [];
  if (tags.length !== format.teams) return { ok: false, error: `The Teams line needs ${format.teams} tags with " · " between them.` };
  if (new Set(tags.map((t) => t.toLowerCase())).size !== tags.length) return { ok: false, error: "Two teams have the same tag." };
  const room = roomOf(format);
  const war: CarryWar = { from: head[1] as CarryFrom, game, format, tags, races: [], penalties: [], racesTotal, totals: null };
  for (const line of all.slice(2)) {
    const pen = /^Penalty: (.+) (\d{1,3})$/.exec(line);
    if (pen) {
      const t = tags.findIndex((x) => x.toLowerCase() === pen[1].trim().toLowerCase());
      if (t < 0) return { ok: false, error: `"${line}": ${pen[1]} isn't one of the teams.` };
      war.penalties.push({ team: t, points: Number(pen[2]) });
      continue;
    }
    const m = /^Race (\d{1,2}):\s*(.*?)(?:\s*\(([^()]*)\))?$/.exec(line);
    if (!m) return { ok: false, error: `"${line.slice(0, 40)}" isn't a race or a penalty. Races look like Race 1: 1,4,6,7,8,9 (MKS).` };
    const n = Number(m[1]);
    const [placesText, pointsText] = m[2].includes("points")
      ? m[2].includes("·") ? m[2].split("·").map((s) => s.trim()) : ["", m[2]]
      : [m[2], ""];
    const groups = placesText ? placesText.split("/").map((g) => list(g)) : [];
    const scores = pointsText ? pointsText.replace(/points/i, "").trim().split("-").map((x) => int(x)) : null;
    if (scores && (scores.length !== format.teams || scores.some((v) => v == null))) return { ok: false, error: `Race ${n}'s points need one number for each of the ${format.teams} teams, like 46-36.` };
    if (!groups.length && !scores) return { ok: false, error: `Race ${n} needs places or points.` };
    if (groups.some((g) => g.length !== format.size || g.some((p) => p > room))) return { ok: false, error: `Race ${n}: each team has ${format.size} places from 1 to ${room}.` };
    const flat = groups.flat();
    if (new Set(flat).size !== flat.length) return { ok: false, error: `Race ${n} has a place twice.` };
    const trackRaw = (m[3] ?? "").replace(/^\?\s*/, "");
    const found = trackRaw ? findTrack(trackRaw, game) : { track: null, trackText: null };
    war.races.push({
      n,
      spots: groups[0] ?? [],
      ...(format.teams > 2 && groups.length === format.teams ? { places: groups.slice(1) } : {}),
      ...(scores && !(groups.length === format.teams || (format.teams === 2 && groups.length === 1)) ? { scores: scores as number[] } : {}),
      ...found,
    });
  }
  if (!war.races.length) return { ok: false, error: "There are no races to carry over." };
  if (war.races.length > racesTotal) return { ok: false, error: `That's ${war.races.length} races in a ${racesTotal}-race war.` };
  return finishRead(war, war.races.length, []);
}

/** The check's sentence: "Mario Kart 8 Deluxe · 6v6 · 12 races. 5 races read with their places and tracks; no penalties. Race 6 is next." */
export function carrySummary(war: CarryWar): string {
  const withPlaces = war.races.filter((r) => r.spots.length && !r.scores).length;
  const withPoints = war.races.length - withPlaces;
  const tracks = war.races.filter((r) => r.track).length;
  const parts = [
    withPlaces ? `${withPlaces} ${withPlaces === 1 ? "race" : "races"} with places` : "",
    withPoints ? `${withPoints} with points only` : "",
  ].filter(Boolean).join(" and ");
  const trackNote = tracks === war.races.length ? " and tracks" : tracks ? `, ${tracks} with tracks` : "";
  const pens = war.penalties.length ? `${war.penalties.length} ${war.penalties.length === 1 ? "penalty" : "penalties"}` : "no penalties";
  const next = war.races.length < war.racesTotal ? ` Race ${war.races.length + 1} is next.` : " Every race is in.";
  return `${GAME_NAMES[war.game]} · ${formatLabel(war.format)} · ${war.racesTotal} races. ${parts}${trackNote}; ${pens}.${next}`;
}
