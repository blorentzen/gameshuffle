/**
 * Chat Brain rules (pure, client-safe). Spec: specs/gs-originals-chat-brain.md.
 *
 *   normalize    raw answer → the form we group and match on
 *   autoGroup    answers → groups by identical normalized text, plus merge
 *                suggestions for close spellings (staff/AI review decides)
 *   buildBoard   reviewed groups → a board: groups with at least 2 people and
 *                2% of answers, top 8, points scaled to total 100
 *   matchGuess   a guess during play → which board answer it hits, if any
 */

export const MAX_ANSWER_LENGTH = 40;
export const BOARD_MAX_ANSWERS = 8;
export const BOARD_MIN_ANSWERS = 3;
/** A group needs at least this many people and this share to appear on a board. */
export const GROUP_MIN_PEOPLE = 2;
export const GROUP_MIN_SHARE = 0.02;

const ARTICLES = /^(a|an|the|my|your|some)\s+/;

/** Light singular: "pizzas" → "pizza", "boxes" → "box", "parties" → "party". Leaves short words and -ss alone. */
function singular(word: string): string {
  if (word.length <= 3 || word.endsWith("ss") || word.endsWith("us") || word.endsWith("is")) return word;
  if (word.endsWith("ies") && word.length > 4) return `${word.slice(0, -3)}y`;
  if (/(ches|shes|xes|zes|sses)$/.test(word)) return word.slice(0, -2);
  if (word.endsWith("s")) return word.slice(0, -1);
  return word;
}

/** "  A Pizza!! " → "pizza". "The Blue Shells" → "blue shell". */
export function normalize(raw: string): string {
  let s = raw.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();
  s = s.replace(/&/g, " and ").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  for (let i = 0; i < 2; i++) s = s.replace(ARTICLES, "");
  return s.split(" ").filter(Boolean).map(singular).join(" ").slice(0, MAX_ANSWER_LENGTH);
}

/** A question's comparison key: normalized like an answer, but never cut to the answer length. */
export function questionKey(text: string): string {
  let s = text.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  s = s.replace(/&/g, " and ").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  return s.split(" ").filter(Boolean).map(singular).join(" ");
}

/** Edit distance (Levenshtein), capped for speed. */
export function editDistance(a: string, b: string, cap = 8): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > cap) return cap + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      rowMin = Math.min(rowMin, cur[j]);
    }
    if (rowMin > cap) return cap + 1;
    prev = cur;
  }
  return prev[b.length];
}

/** Close enough to be the same answer typed differently (scales with length; never for very short words). */
export function isNear(a: string, b: string): boolean {
  if (a === b) return true;
  const len = Math.max(a.length, b.length);
  if (len < 5) return false;
  const allowed = len >= 12 ? 2 : 1;
  return editDistance(a, b, allowed) <= allowed;
}

export interface RawAnswer { id: string; raw: string; normalized: string }
export interface AutoGroup { key: string; label: string; count: number; answerIds: string[]; aliases: string[] }
export interface MergeSuggestion { into: string; from: string; reason: "spelling" }

/** The most common raw spelling, tidied, as the group's label. */
function labelFor(raws: string[]): string {
  const counts = new Map<string, number>();
  for (const r of raws) { const t = r.trim().replace(/\s+/g, " ").replace(/[!?.]+$/, ""); counts.set(t, (counts.get(t) ?? 0) + 1); }
  const best = [...counts.entries()].sort((x, y) => y[1] - x[1] || x[0].length - y[0].length)[0]?.[0] ?? "";
  return best ? best[0].toUpperCase() + best.slice(1) : best;
}

/** Group by identical normalized text, biggest first, and suggest spelling merges between groups. */
export function autoGroup(answers: RawAnswer[]): { groups: AutoGroup[]; suggestions: MergeSuggestion[] } {
  const by = new Map<string, RawAnswer[]>();
  for (const a of answers) { if (!a.normalized) continue; const list = by.get(a.normalized) ?? []; list.push(a); by.set(a.normalized, list); }
  const groups: AutoGroup[] = [...by.entries()]
    .map(([key, list]) => ({ key, label: labelFor(list.map((a) => a.raw)), count: list.length, answerIds: list.map((a) => a.id), aliases: [key] }))
    // Ties: the shorter spelling first (typos more often add letters), then A–Z.
    .sort((x, y) => y.count - x.count || x.key.length - y.key.length || x.key.localeCompare(y.key));
  const suggestions: MergeSuggestion[] = [];
  const merged = new Set<string>();
  for (let i = 0; i < groups.length; i++) {
    if (merged.has(groups[i].key)) continue;
    for (let j = i + 1; j < groups.length; j++) {
      if (merged.has(groups[j].key)) continue;
      if (isNear(groups[i].key, groups[j].key)) { suggestions.push({ into: groups[i].key, from: groups[j].key, reason: "spelling" }); merged.add(groups[j].key); }
    }
  }
  return { groups, suggestions };
}

export interface ReviewedGroup { label: string; count: number; aliases: string[]; hidden?: boolean }
export interface BoardAnswer { rank: number; label: string; points: number; aliases: string[] }

/**
 * A board from reviewed groups. Points are each answer's share of everyone who
 * answered, scaled so the shown answers total 100 (largest-remainder rounding).
 */
export function buildBoard(groups: ReviewedGroup[], totalAnswers: number): BoardAnswer[] {
  if (totalAnswers <= 0) return [];
  const minCount = Math.max(GROUP_MIN_PEOPLE, Math.ceil(totalAnswers * GROUP_MIN_SHARE));
  const shown = groups.filter((g) => !g.hidden && g.count >= minCount).sort((a, b) => b.count - a.count).slice(0, BOARD_MAX_ANSWERS);
  if (shown.length < BOARD_MIN_ANSWERS) return [];
  const sum = shown.reduce((n, g) => n + g.count, 0);
  const exact = shown.map((g) => (g.count / sum) * 100);
  const points = exact.map(Math.floor);
  let left = 100 - points.reduce((n, p) => n + p, 0);
  const order = exact.map((e, i) => ({ i, r: e - Math.floor(e) })).sort((a, b) => b.r - a.r);
  for (const { i } of order) { if (left <= 0) break; points[i] += 1; left -= 1; }
  return shown.map((g, i) => ({ rank: i + 1, label: g.label, points: Math.max(1, points[i]), aliases: [...new Set([normalize(g.label), ...g.aliases])] }));
}

/** Which board answer a guess hits (exact alias first, then a close spelling), or null. Skips answers already found. */
export function matchGuess(guess: string, board: BoardAnswer[], found: number[] = []): BoardAnswer | null {
  const g = normalize(guess);
  if (!g) return null;
  const open = board.filter((b) => !found.includes(b.rank));
  return open.find((b) => b.aliases.includes(g))
    ?? open.find((b) => b.aliases.some((a) => isNear(a, g)))
    ?? null;
}

// ─── seeding (before launch) ────────────────────────────────────────────────

/** Chat Brain opens to play once this many public boards are published. */
export const LAUNCH_BOARDS = 30;
/** Answers it takes to earn the Founding Brain badge on /u (accounts only). */
export const FOUNDING_BRAIN_ANSWERS = 10;
/** Answers before this date count toward Founding Brain. Null while seeding: every answer counts. Set it at launch. */
export const FOUNDING_CUTOFF: string | null = null;

/** What someone sees after answering: how many others gave the same answer so far. */
export function sameLine(same: number): string {
  if (same <= 0) return "You're the first to say that.";
  return `You and ${same} ${same === 1 ? "other person" : "others"} said that.`;
}
