/**
 * War tables in Lorenzi's text format (war tools pick 4A: what people already paste into Ice Mario and gb.hlorenzi.com).
 * Pure, client-safe.
 *   #title Kart Club vs Night Owls      settings start with # (#title and #date are used; the rest are kept as is)
 *   KC - Kart Club #1f5f9a              a team: its tag, then " - " and a name, then a color, both optional
 *   KC - Kart Club https://…/kc.webp    a logo for this table only, at the end of the team's line (doc asks pick 1, 2026-11-10)
 *   https://…/ak.png - Another Kart     Ice Mario's way: an image link in place of the tag (the tag comes from the name)
 *   Riley [us] 118                      a player: name, an optional flag code, and a score (70+20+8 adds up, | splits GPs)
 *   Penalty -15                         points off the team above
 * A line that isn't a setting, a player or a penalty starts a team, which is how Ice Mario's headers work ("INTWARD").
 */

import { bestSplit, groupByTag, samePlayer, stripTag, tagAt, tagKey, type TagGroup } from "./tags";

export { withoutTag } from "./tags";

export interface TablePlayer { name: string; flag: string | null; score: number }
export interface TableTeam {
  tag: string; name: string | null; color: string | null; players: TablePlayer[]; penalty: number;
  /** A logo for this table only (a link at the end of the team's line, or in place of its tag). */
  logo?: string | null;
}
export interface TableModel { title: string | null; date: string | null; settings: string[]; teams: TableTeam[]; skipped: string[] }

const PLAYER = /^(.+?)\s*(?:\[([a-z]{2,10}(?:_[a-z]{2,3})?)\])?\s+([+-]?\d{1,4}(?:\s*[+\-|]\s*\d{1,4})*)$/i;
const PENALTY = /^(?:penalty|pen)\s*:?\s*([+-]?\d{1,4})$/i;
const TEAM = /^(.+?)(?:\s+-\s+(.+?))?(?:\s+(#[0-9a-f]{6}))?$/i;
const LINK = /^https?:\/\/\S+$/i;

/** A tag for a team named only by its logo link: its name's initials ("Another Kart" → AK), else its first letters. */
export function tagFromName(name: string | null): string {
  const words = (name ?? "").normalize("NFKD").replace(/[^A-Za-z0-9 ]+/g, " ").split(/\s+/).filter(Boolean);
  if (!words.length) return "?";
  return (words.length > 1 ? words.map((w) => w[0]).join("") : words[0].slice(0, 3)).toUpperCase().slice(0, 5);
}

/** A team line: "TAG - Name #color", with a logo link at its end, or Ice Mario's link in place of the tag. */
function teamLine(line: string): TableTeam | null {
  const parts = line.split(/\s+/);
  let logo: string | null = null;
  let rest = line;
  if (LINK.test(parts[0])) {
    logo = parts[0];
    const after = line.slice(parts[0].length).trim().replace(/^-\s*/, "");
    const t = TEAM.exec(after || "?");
    const name = after ? (t?.[1] ?? after).trim().slice(0, 60) : null;
    return { tag: tagFromName(name), name, color: t?.[3]?.toLowerCase() ?? null, players: [], penalty: 0, logo };
  }
  if (parts.length > 1 && LINK.test(parts[parts.length - 1])) {
    logo = parts[parts.length - 1];
    rest = line.slice(0, line.length - logo.length).trim();
  }
  const t = TEAM.exec(rest);
  if (!t || rest.length > 80) return null;
  return { tag: t[1].trim().slice(0, 12).trim(), name: t[2]?.trim().slice(0, 60) || null, color: t[3]?.toLowerCase() ?? null, players: [], penalty: 0, ...(logo ? { logo } : {}) };
}

/** "70+20+8" or "60|40-10": the parts added up. */
function scoreOf(expr: string): number {
  return (expr.replace(/\s+/g, "").replace(/\|/g, "+").match(/[+-]?\d+/g) ?? []).reduce((a, n) => a + Number(n), 0);
}

export function parseTable(text: string): TableModel {
  const model: TableModel = { title: null, date: null, settings: [], teams: [], skipped: [] };
  let team: TableTeam | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("#")) {
      const [key, ...rest] = line.slice(1).split(/\s+/);
      const value = rest.join(" ").trim();
      if (key.toLowerCase() === "title") model.title = value.slice(0, 80) || null;
      else if (key.toLowerCase() === "date") model.date = value.slice(0, 30) || null;
      else model.settings.push(line);
      continue;
    }
    const pen = PENALTY.exec(line);
    if (pen) {
      if (team) team.penalty += Math.abs(Number(pen[1]));
      else model.skipped.push(line);
      continue;
    }
    const p = PLAYER.exec(line);
    if (p && team) {
      team.players.push({ name: p[1].trim().slice(0, 32), flag: p[2] ? p[2].toLowerCase() : null, score: scoreOf(p[3]) });
      continue;
    }
    if (p && !team) {
      // Players before any team: an unnamed team, so nothing is lost (the check says so).
      team = { tag: "?", name: null, color: null, players: [], penalty: 0 };
      model.teams.push(team);
      team.players.push({ name: p[1].trim().slice(0, 32), flag: p[2] ? p[2].toLowerCase() : null, score: scoreOf(p[3]) });
      continue;
    }
    const t = teamLine(line);
    if (t) {
      team = t;
      model.teams.push(team);
      continue;
    }
    model.skipped.push(line);
  }
  return model;
}

/**
 * Table text pasted from another tool (overrides pick 8): Ice Mario's block (a first line of !table or !tablel and its
 * style words, a "-vx" for no logo on a team line) and a Lounge !submit block (no team lines; players come in teams of
 * the size given, each team's tag found in its names), as well as Lorenzi's text. Anything else reads as parseTable does.
 */
export function parsePasted(text: string): TableModel {
  const lines = text.split(/\r?\n/);
  const first = (lines.find((l) => l.trim()) ?? "").trim();
  const submit = /^!submit\s+(\d{1,2})(?:\s+\S+)?\s*$/i.exec(first);
  if (/^!tablel?(\s|$)/i.test(first) || submit) lines.splice(lines.indexOf(lines.find((l) => l.trim())!), 1);
  const model = parseTable(lines.map((l) => l.replace(/\s+-vx\s*$/i, "")).join("\n"));
  const size = submit ? Number(submit[1]) : 0;
  if (!size || model.teams.length !== 1 || model.teams[0].tag !== "?" || model.teams[0].players.length <= size) return splitTyped(model);
  const players = model.teams[0].players;
  const teams: TableTeam[] = [];
  for (let i = 0; i < players.length; i += size) {
    const chunk = players.slice(i, i + size);
    const { groups } = groupByTag(chunk.map((p) => p.name), chunk.length);
    const g = groups.find((x) => x.rows.length * 2 >= chunk.length);
    teams.push({
      tag: g ? g.tag.slice(0, 12) : "?", name: null, color: null, penalty: 0,
      players: chunk.map((p, j) => { const at = g ? g.rows.indexOf(j) : -1; return at >= 0 ? { ...p, name: g!.names[at].slice(0, 32) } : p; }),
    });
  }
  return { ...model, teams };
}

export function formatTable(model: TableModel): string {
  const out: string[] = [];
  if (model.title) out.push(`#title ${model.title}`);
  if (model.date) out.push(`#date ${model.date}`);
  out.push(...model.settings);
  for (const t of model.teams) {
    out.push(`${t.tag}${t.name && t.name !== t.tag ? ` - ${t.name}` : ""}${t.color ? ` ${t.color}` : ""}${t.logo ? ` ${t.logo}` : ""}`);
    for (const p of t.players) out.push(`${p.name}${p.flag ? ` [${p.flag}]` : ""} ${p.score}`);
    if (t.penalty) out.push(`Penalty -${t.penalty}`);
  }
  return out.join("\n");
}

export const teamTotal = (t: TableTeam) => t.players.reduce((a, p) => a + p.score, 0) - t.penalty;

/**
 * Each team's players best score first, as the table is drawn (Umiko's ask, 2026-11-10: typed in any order, the best
 * player still lands on top). Ties keep the order they were typed; teams keep theirs. The text itself isn't reordered,
 * since a pasted Lounge block reads its teams from the order of its lines.
 */
export function byScore(model: TableModel): TableModel {
  return { ...model, teams: model.teams.map((t) => ({ ...t, players: [...t.players].sort((a, b) => b.score - a.score) })) };
}

/** Each player's place across the whole room (ties share a place). */
export function placesOf(model: TableModel): Map<TablePlayer, number> {
  const all = model.teams.flatMap((t) => t.players).sort((a, b) => b.score - a.score);
  const out = new Map<TablePlayer, number>();
  all.forEach((p, i) => out.set(p, i > 0 && all[i - 1].score === p.score ? out.get(all[i - 1])! : i + 1));
  return out;
}

export interface TableIssue { kind: "missing" | "total" | "count" | "skipped" | "unnamed"; text: string }

/**
 * What to check before drawing: teams with no players, players per team, each team's total against the war's (when
 * there's a war), and lines that couldn't be read.
 */
export function tableIssues(model: TableModel, war: { totals: Record<string, number>; team: number; order?: number[] } | null): TableIssue[] {
  const issues: TableIssue[] = [];
  if (model.teams.length < 2) issues.push({ kind: "missing", text: "A table needs two teams, each starting with its tag on a line of its own." });
  for (const [i, t] of model.teams.entries()) {
    if (t.tag === "?") issues.push({ kind: "unnamed", text: "A team has no tag yet: put its tag on its own line above its players." });
    if (!t.players.length) { issues.push({ kind: "missing", text: `${t.name || t.tag} has no players yet.` }); continue; }
    if (war && t.players.length < war.team) issues.push({ kind: "count", text: `${t.name || t.tag} has ${t.players.length} of ${war.team} players.` });
    if (war && t.players.length > war.team) issues.push({ kind: "count", text: `${t.name || t.tag} has ${t.players.length} players; a team in this war has ${war.team}. Some of them are likely the other team's.` });
    // A team the screen showed under another tag keeps the war's tag as its name.
    // In order (your team first) when neither its tag nor its name is the war's: a two-team table from the war.
    const want = war?.totals[t.tag.toLowerCase()] ?? (t.name ? war?.totals[t.name.toLowerCase()] : undefined) ?? (model.teams.length === 2 ? war?.order?.[i] : undefined);
    const got = teamTotal(t);
    if (want != null && got !== want) issues.push({ kind: "total", text: `${t.name || t.tag} adds up to ${got}; the war says ${want} (${got < want ? `${want - got} short` : `${got - want} over`}). A score was likely misread.` });
  }
  if (model.skipped.length) issues.push({ kind: "skipped", text: `Couldn't read ${model.skipped.length === 1 ? "this line" : "these lines"}: ${model.skipped.slice(0, 3).map((s) => `"${s.slice(0, 30)}"`).join(", ")}.` });
  return issues;
}

/** A row read from a results screenshot. */
export interface ReadRow { name: string; score: number; color: string | null }

export interface FillOptions {
  /** Other names each tag on the screen goes by, by tagKey: MKCentral's registry team for that tag (its name, then its tag). */
  aliases?: Record<string, string[]>;
}

/** `by`: what sorted the rows ("tags" when the names' tags did it). `guessed`: a team was picked with nothing to go on. */
export interface FillResult { model: TableModel; guessed: boolean; by: "tags" | "colors" | null; tags: string[] }

/** Teams that wear the same tag: the team's own tag or name, MKCentral's name for the tag, or the names its players go by. */
function evidence(g: TagGroup, t: TableTeam, aliases: string[]): number {
  const key = tagKey(g.tag);
  const team = [t.tag, t.name ?? ""].map(tagKey).filter(Boolean);
  if (team.includes(key)) return 3;
  const near = (a: string, b: string) => a === b || (Math.min(a.length, b.length) >= 4 && (a.includes(b) || b.includes(a)));
  if (aliases.map(tagKey).filter(Boolean).some((a) => team.some((k) => near(a, k)))) return 2;
  if (key.length >= 2 && team.some((k) => k.includes(key))) return 2;
  const known = t.players.length ? g.names.filter((n) => t.players.some((p) => samePlayer(n, p.name))).length : 0;
  return known * 2 >= g.names.length && known > 0 ? 2 : 0;
}

/**
 * Fills the teams that have no players from a results screenshot's rows. Tags in the names come first: names sharing a
 * tag at their front or back are one team ("Ω umikofy", "FRVR♪ichor", "FRVRTRA$H"), matched to a table team by its tag,
 * its name, MKCentral's name for the tag or its players; a team the screen shows under another tag takes that tag (its
 * name stays). The team that's left takes the tag that's left. Rows of a team that already has players stay out, and
 * the rest go by row color. Without teams at all, the tags make them.
 */
export function fillFromRows(model: TableModel, rows: ReadRow[], opts: FillOptions = {}): FillResult {
  if (!rows.length) return { model, guessed: false, by: null, tags: [] };
  if (!model.teams.length) return teamsFromRows(model, rows, opts);
  const empty = model.teams.filter((t) => !t.players.length);
  if (!empty.length) return { model, guessed: false, by: null, tags: [] };
  const filled = model.teams.filter((t) => t.players.length);
  const left = rows.length - filled.reduce((a, t) => a + t.players.length, 0);
  const size = left > 0 && left % empty.length === 0 ? left / empty.length : null;
  const { groups, rest } = groupByTag(rows.map((r) => r.name), size);
  const aliasesOf = (g: TagGroup) => opts.aliases?.[tagKey(g.tag)] ?? [];

  const owner = new Map<number, TableTeam>();
  const names = new Map<number, string>();
  const kept = new Set<number>();
  const retag = new Map<TableTeam, string>();
  const taken = new Set<TableTeam>();
  let guessed = false;

  // A tag that's a filled team's: those rows are in already.
  const open: TagGroup[] = [];
  for (const g of groups) {
    const best = filled.map((t) => ({ t, e: evidence(g, t, aliasesOf(g)) })).sort((a, b) => b.e - a.e)[0];
    if (best && best.e > 0 && best.e >= Math.max(0, ...empty.map((t) => evidence(g, t, aliasesOf(g))))) g.rows.forEach((i) => kept.add(i));
    else open.push(g);
  }
  const place = (g: TagGroup, t: TableTeam, matched: boolean) => {
    g.rows.forEach((i, j) => { owner.set(i, t); names.set(i, g.names[j]); });
    taken.add(t);
    if (matched && tagKey(g.tag) !== tagKey(t.tag)) retag.set(t, g.tag);
  };
  const pairs = open.flatMap((g) => empty.map((t) => ({ g, t, e: evidence(g, t, aliasesOf(g)) }))).filter((p) => p.e > 0).sort((a, b) => b.e - a.e);
  const placed = new Set<TagGroup>();
  for (const p of pairs) {
    if (placed.has(p.g) || taken.has(p.t)) continue;
    place(p.g, p.t, true);
    placed.add(p.g);
  }
  const waiting = open.filter((g) => !placed.has(g));
  const free = empty.filter((t) => !taken.has(t));
  // One tag and one team left: it's that team's (nothing else it could be). More than one: in order, as a guess.
  if (waiting.length === 1 && free.length === 1) place(waiting[0], free[0], true);
  else waiting.forEach((g, j) => { if (free[j]) { place(g, free[j], false); guessed = true; } });

  // Names without a shared tag: a team's own tag on the name, a player a team already has, then the row's color.
  const loose: number[] = [];
  for (const i of rest) {
    const r = rows[i];
    const tagged = model.teams.map((t) => ({ t, hit: tagAt(r.name, retag.get(t) ?? t.tag) })).find((x) => x.hit);
    const name = tagged ? stripTag(r.name, tagged.hit!) : r.name.trim();
    if (filled.some((t) => t === tagged?.t || t.players.some((p) => samePlayer(name, p.name)))) { kept.add(i); continue; }
    if (tagged) { owner.set(i, tagged.t); names.set(i, name); continue; }
    loose.push(i);
  }
  const colorOf = (i: number) => rows[i].color ?? "none";
  const colorTeam = new Map<string, TableTeam | "kept" | "both">();
  const mark = (c: string, t: TableTeam | "kept") => colorTeam.set(c, colorTeam.has(c) && colorTeam.get(c) !== t ? "both" : t);
  for (const [i, t] of owner) if (rows[i].color) mark(rows[i].color!, t);
  for (const i of kept) if (rows[i].color) mark(rows[i].color!, "kept");
  const colors = [...new Set(loose.map(colorOf))];
  const unknown = colors.filter((c) => c === "none" || !colorTeam.has(c) || colorTeam.get(c) === "both");
  let usedColors = false;
  for (const c of colors) {
    const group = loose.filter((i) => colorOf(i) === c);
    const known = c === "none" ? undefined : colorTeam.get(c);
    if (known === "kept") continue;
    let target: TableTeam | undefined = known && known !== "both" ? known : undefined;
    if (!target) {
      const room = empty.filter((t) => ![...owner.values()].includes(t));
      target = room[0] ?? empty.reduce((a, t) => ([...owner.values()].filter((x) => x === t).length < [...owner.values()].filter((x) => x === a).length ? t : a), empty[0]);
      if (room.length !== 1 || unknown.length > 1) guessed = true;
      usedColors = usedColors || c !== "none";
    }
    for (const i of group) { owner.set(i, target); names.set(i, rows[i].name.trim()); }
  }

  const teams = model.teams.map((t) => {
    const mine = rows.map((_, i) => i).filter((i) => owner.get(i) === t);
    if (!mine.length) return t;
    const tag = retag.get(t);
    return {
      ...t,
      ...(tag ? { tag: tag.slice(0, 12), name: t.name ?? t.tag } : {}),
      players: mine.map((i) => ({ name: (names.get(i) ?? rows[i].name).slice(0, 32), flag: null, score: rows[i].score })),
    };
  });
  return { model: { ...model, teams }, guessed, by: groups.length ? "tags" : usedColors ? "colors" : null, tags: groups.map((g) => g.tag) };
}

/** No teams given: the tags make them (named from MKCentral when it knows the tag); untagged rows split by color under "?". */
function teamsFromRows(model: TableModel, rows: ReadRow[], opts: FillOptions): FillResult {
  const { groups, rest } = bestSplit(rows.map((r) => r.name));
  const teams: TableTeam[] = groups.map((g) => {
    const alias = (opts.aliases?.[tagKey(g.tag)] ?? []).find((a) => tagKey(a) && tagKey(a) !== tagKey(g.tag)) ?? null;
    return { tag: g.tag.slice(0, 12), name: alias?.slice(0, 60) ?? null, color: null, penalty: 0, players: g.rows.map((i, j) => ({ name: g.names[j].slice(0, 32), flag: null, score: rows[i].score })) };
  });
  const colors = [...new Set(rest.map((i) => rows[i].color ?? "none"))];
  for (const c of colors) {
    teams.push({ tag: "?", name: null, color: null, penalty: 0, players: rest.filter((i) => (rows[i].color ?? "none") === c).map((i) => ({ name: rows[i].name.trim().slice(0, 32), flag: null, score: rows[i].score })) });
  }
  return { model: { ...model, teams }, guessed: colors.length > 1, by: groups.length ? "tags" : colors.length > 1 ? "colors" : null, tags: groups.map((g) => g.tag) };
}

/**
 * Typed players with no team lines (one "?" team): split by their tags the same way, keeping each player's flag.
 * Anything it can't split stays as it was.
 */
export function splitTyped(model: TableModel): TableModel {
  if (model.teams.length !== 1 || model.teams[0].tag !== "?" || model.teams[0].players.length < 4) return model;
  const players = model.teams[0].players;
  const { groups, rest } = bestSplit(players.map((p) => p.name));
  if (!groups.length) return model;
  const teams: TableTeam[] = groups.map((g) => ({ tag: g.tag.slice(0, 12), name: null, color: null, penalty: 0, players: g.rows.map((i, j) => ({ ...players[i], name: g.names[j].slice(0, 32) })) }));
  if (rest.length) teams.push({ tag: "?", name: null, color: null, penalty: model.teams[0].penalty, players: rest.map((i) => players[i]) });
  else teams[teams.length - 1].penalty = model.teams[0].penalty;
  return { ...model, teams };
}

/** Swaps the players of the first two teams (when row colors put them the wrong way round). */
export function swapTeams(model: TableModel): TableModel {
  if (model.teams.length < 2) return model;
  const [a, b, ...rest] = model.teams;
  return { ...model, teams: [{ ...a, players: b.players, penalty: a.penalty }, { ...b, players: a.players, penalty: b.penalty }, ...rest] };
}

/** A flag code as tables read it ("[GB_ENG]" → gb_eng), or null when it isn't one (Lorenzi's shape). */
export function cleanFlagCode(v: unknown): string | null {
  const c = String(v ?? "").trim().replace(/^\[|\]$/g, "").toLowerCase();
  return /^[a-z]{2,10}(_[a-z]{2,3})?$/.test(c) ? c : null;
}

/** A logo file's tag from its name, the way the Logos page reads it: "KC.png" → KC; "KC - Kart Club.png" also names the team. */
export function tagFromFile(fileName: string): { tag: string; name: string } {
  const base = fileName.replace(/\.[a-z0-9]{2,5}$/i, "").replace(/\s+/g, " ").trim();
  const split = /^(.+?)\s+-\s+(.+)$/.exec(base);
  return split ? { tag: split[1].trim(), name: split[2].trim().slice(0, 60) } : { tag: base, name: "" };
}
