/**
 * War tables in Lorenzi's text format (war tools pick 4A: what people already paste into Ice Mario and gb.hlorenzi.com).
 * Pure, client-safe.
 *   #title Kart Club vs Night Owls      settings start with # (#title and #date are used; the rest are kept as is)
 *   KC - Kart Club #1f5f9a              a team: its tag, then " - " and a name, then a color, both optional
 *   Riley [us] 118                      a player: name, an optional flag code, and a score (70+20+8 adds up, | splits GPs)
 *   Penalty -15                         points off the team above
 * A line that isn't a setting, a player or a penalty starts a team, which is how Ice Mario's headers work ("INTWARD").
 */

export interface TablePlayer { name: string; flag: string | null; score: number }
export interface TableTeam { tag: string; name: string | null; color: string | null; players: TablePlayer[]; penalty: number }
export interface TableModel { title: string | null; date: string | null; settings: string[]; teams: TableTeam[]; skipped: string[] }

const PLAYER = /^(.+?)\s*(?:\[([a-z]{2,10}(?:_[a-z]{2,3})?)\])?\s+([+-]?\d{1,4}(?:\s*[+\-|]\s*\d{1,4})*)$/i;
const PENALTY = /^(?:penalty|pen)\s*:?\s*([+-]?\d{1,4})$/i;
const TEAM = /^(.+?)(?:\s+-\s+(.+?))?(?:\s+(#[0-9a-f]{6}))?$/i;

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
    const t = TEAM.exec(line);
    if (t && line.length <= 80) {
      team = { tag: t[1].trim().slice(0, 12).trim(), name: t[2]?.trim().slice(0, 60) || null, color: t[3]?.toLowerCase() ?? null, players: [], penalty: 0 };
      model.teams.push(team);
      continue;
    }
    model.skipped.push(line);
  }
  return model;
}

export function formatTable(model: TableModel): string {
  const out: string[] = [];
  if (model.title) out.push(`#title ${model.title}`);
  if (model.date) out.push(`#date ${model.date}`);
  out.push(...model.settings);
  for (const t of model.teams) {
    out.push(`${t.tag}${t.name && t.name !== t.tag ? ` - ${t.name}` : ""}${t.color ? ` ${t.color}` : ""}`);
    for (const p of t.players) out.push(`${p.name}${p.flag ? ` [${p.flag}]` : ""} ${p.score}`);
    if (t.penalty) out.push(`Penalty -${t.penalty}`);
  }
  return out.join("\n");
}

export const teamTotal = (t: TableTeam) => t.players.reduce((a, p) => a + p.score, 0) - t.penalty;

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
export function tableIssues(model: TableModel, war: { totals: Record<string, number>; team: number } | null): TableIssue[] {
  const issues: TableIssue[] = [];
  if (model.teams.length < 2) issues.push({ kind: "missing", text: "A table needs two teams, each starting with its tag on a line of its own." });
  for (const t of model.teams) {
    if (t.tag === "?") issues.push({ kind: "unnamed", text: "Some players come before any team's tag." });
    if (!t.players.length) { issues.push({ kind: "missing", text: `${t.name || t.tag} has no players yet.` }); continue; }
    if (war && t.players.length < war.team) issues.push({ kind: "count", text: `${t.name || t.tag} has ${t.players.length} of ${war.team} players.` });
    const want = war?.totals[t.tag.toLowerCase()];
    const got = teamTotal(t);
    if (want != null && got !== want) issues.push({ kind: "total", text: `${t.name || t.tag} adds up to ${got}; the war says ${want} (${got < want ? `${want - got} short` : `${got - want} over`}). A score was likely misread.` });
  }
  if (model.skipped.length) issues.push({ kind: "skipped", text: `Couldn't read ${model.skipped.length === 1 ? "this line" : "these lines"}: ${model.skipped.slice(0, 3).map((s) => `"${s.slice(0, 30)}"`).join(", ")}.` });
  return issues;
}

/** Rows read from a results screenshot, sorted into the table's teams that have no players yet. */
export interface ReadRow { name: string; score: number; color: string | null }

const escapeRe = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const SEP = "[\\s\\-_.|★☆*:]";
const hasTag = (name: string, tag: string) => new RegExp(`^${escapeRe(tag)}(?:${SEP}|$)`, "i").test(name.trim());
/** A name without a leading team tag ("KC Riley" → "Riley"). */
export const withoutTag = (name: string, tag?: string) =>
  (tag ? name.trim().replace(new RegExp(`^${escapeRe(tag)}${SEP}+`, "i"), "") : name.trim().replace(new RegExp(`^\\S{1,5}${SEP}+`), "")).trim() || name.trim();

/**
 * Fills the teams that have no players from a results screenshot's rows. A row belongs to a team that already has
 * players when it carries that team's tag or one of its players' names, and so does every row of the same color; the
 * rest go to the empty teams by tag, then by row color (`guessed` when a color had nothing else to go on).
 */
export function fillFromRows(model: TableModel, rows: ReadRow[]): { model: TableModel; guessed: boolean } {
  const empty = model.teams.filter((t) => !t.players.length);
  if (!empty.length || !rows.length) return { model, guessed: false };
  const known = new Set(model.teams.flatMap((t) => t.players.map((p) => withoutTag(p.name).toLowerCase())));
  const filledColors = new Set<string>();
  const byTeam = new Map<TableTeam, ReadRow[]>();
  const rest: ReadRow[] = [];
  for (const r of rows) {
    const tagTeam = model.teams.find((t) => hasTag(r.name, t.tag));
    if ((tagTeam && tagTeam.players.length) || known.has(withoutTag(r.name).toLowerCase()) || known.has(r.name.toLowerCase())) { if (r.color) filledColors.add(r.color); continue; }
    if (tagTeam) byTeam.set(tagTeam, [...(byTeam.get(tagTeam) ?? []), r]);
    else rest.push(r);
  }
  let guessed = false;
  for (const color of [...new Set(rest.map((r) => r.color ?? "none"))]) {
    if (color !== "none" && filledColors.has(color)) continue;
    const group = rest.filter((r) => (r.color ?? "none") === color);
    const tagged = empty.find((t) => (byTeam.get(t) ?? []).some((r) => (r.color ?? "none") === color));
    const target = tagged ?? empty.find((t) => !(byTeam.get(t)?.length)) ?? empty[0];
    if (!tagged) guessed = true;
    byTeam.set(target, [...(byTeam.get(target) ?? []), ...group]);
  }
  const teams = model.teams.map((t) => (byTeam.has(t) ? { ...t, players: byTeam.get(t)!.map((r) => ({ name: withoutTag(r.name, t.tag).slice(0, 32), flag: null, score: r.score })) } : t));
  return { model: { ...model, teams }, guessed };
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
