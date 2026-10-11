/**
 * Trivia Nights: the pure rules (no I/O, client-safe). Plan
 * https://claude.ai/artifact/2YaGPjzngG6dDzWkxuHpBL, phase 1 (the table).
 *
 *   answer line   every question says what to accept, what to ask the host
 *                 about, and what to reject; the server judges typed answers
 *                 from it, and only the "ask" ones wait for the host
 *   round styles  classic, picture, confidence (each number 1..N once per
 *                 round, a right answer earns its number), final wager (bet
 *                 up to a cap), plus one joker per team (doubles a round)
 *   templates     a night set up in one tap for the occasion
 */

import { isNear, normalize } from "@/lib/chatbrain/rules";

export type RoundStyle = "classic" | "picture" | "confidence" | "final";
export type Difficulty = "easy" | "medium" | "hard";
export type QuestionKind = "text" | "number" | "choice" | "picture";
export type Verdict = "pending" | "correct" | "wrong" | "partial";

export interface TriviaQuestion {
  /** Library id, when it came from one. */
  id?: string | null;
  prompt: string;
  answer: string;
  accept: string[];
  askAbout: string[];
  reject: string[];
  kind: QuestionKind;
  options?: string[] | null;
  imageUrl?: string | null;
  category?: string | null;
  difficulty?: Difficulty | null;
  sources?: { title: string; url?: string | null }[];
  asOf?: string | null;
  origin?: "host" | "ai" | "staff";
}

export interface TriviaRound {
  title: string;
  style: RoundStyle;
  /** Points per right answer (classic and picture). */
  points: number;
  seconds: number;
  /** May teams play their joker on this round? */
  jokerAllowed: boolean;
  questions: TriviaQuestion[];
}

export const MAX_TEAMS = 40;
/** On stream: viewers each play as their own team, up to this many a night. */
export const MAX_VIEWERS = 3000;
/** On stream, answers keep counting this long after the countdown (viewers see the stream a few seconds late). */
export const STREAM_GRACE_MS = 5000;
/** Viewer teams (stream) have secrets that start with this; a phone team's random secret never can (base64url has no dot). */
export const VIEWER_SECRET_PREFIX = "v1.";
export const isViewerSecret = (secret: string) => secret.startsWith(VIEWER_SECRET_PREFIX);
export const FINAL_WAGER_MAX = 20;
export const ANSWER_MAX = 120;
export const SECONDS = [20, 30, 45, 60, 90] as const;

// ─── judging ─────────────────────────────────────────────────────────────────

/** What the server can say about a typed answer on its own. "ask" = the host decides. */
export type AutoVerdict = "correct" | "wrong" | "ask";

const numberIn = (s: string): number | null => {
  const m = s.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : null;
};

const ROMAN = /^(?=[ivxl])(x{0,3}l?|l?x{0,3})(ix|iv|v?i{0,3})$/;
/** The parts of an answer that are never a typo: its digits and Roman numerals ("Elizabeth II" isn't "Elizabeth I"). */
const digits = (s: string) => [s.replace(/\D/g, ""), ...s.split(" ").filter((w) => ROMAN.test(w))].join(" ");

/** Same answer, typed differently. Digits never count as a typo: "Super Mario 46" isn't "Super Mario 64". */
function matches(norm: string, list: string[], exactOnly = false): boolean {
  return list.some((x) => {
    const n = normalize(x);
    if (!n) return false;
    if (n === norm) return true;
    return !exactOnly && digits(n) === digits(norm) && isNear(n, norm);
  });
}

/**
 * Judge a typed answer from the question's answer line. An exact answer or
 * accepted form is right; then reject wins (a listed wrong answer close to
 * the right one stays wrong), then near spellings of the answer, then the
 * "ask about" list goes to
 * the host. Numbers must match exactly. Anything unknown goes to the host
 * too, unless it's clearly off (no shared word with the answer).
 */
export function judgeAnswer(raw: string, q: TriviaQuestion): AutoVerdict {
  const norm = normalize(raw);
  if (!norm) return "wrong";
  if (q.kind === "number") {
    const got = numberIn(raw);
    const want = numberIn(q.answer);
    if (got !== null && want !== null) return got === want ? "correct" : matches(norm, q.askAbout) ? "ask" : "wrong";
  }
  if (q.kind === "choice" && q.options?.length) {
    // A letter or the option's text both count.
    const idx = /^[a-z]$/.test(norm) ? norm.charCodeAt(0) - 97 : -1;
    const picked = idx >= 0 ? q.options[idx] : q.options.find((o) => normalize(o) === norm);
    return picked && normalize(picked) === normalize(q.answer) ? "correct" : "wrong";
  }
  if (matches(norm, [q.answer, ...q.accept], true)) return "correct";
  if (matches(norm, q.reject)) return "wrong";
  if (matches(norm, [q.answer, ...q.accept])) return "correct";
  if (matches(norm, q.askAbout)) return "ask";
  const words = new Set(normalize(q.answer).split(" ").filter((w) => w.length > 2));
  return norm.split(" ").some((w) => words.has(w)) ? "ask" : "wrong";
}

/** For the tiebreaker: how far a number guess is from the answer (Infinity if it isn't a number). */
export function distanceFrom(raw: string, answer: string): number {
  const got = numberIn(raw);
  const want = numberIn(answer);
  return got === null || want === null ? Infinity : Math.abs(got - want);
}

// ─── grouping (host judging) ─────────────────────────────────────────────────

export interface AnswerGroup {
  key: string;
  label: string;
  teamIds: string[];
  suggested: AutoVerdict;
}

/** Typed answers grouped by spelling, so the host rules on "bowser junior" once for every team that wrote it. */
export function groupAnswers(answers: { teamId: string; raw: string }[], q: TriviaQuestion): AnswerGroup[] {
  const groups: (AnswerGroup & { raws: Map<string, number> })[] = [];
  for (const a of answers) {
    const norm = normalize(a.raw) || a.raw.trim().toLowerCase();
    let g = groups.find((x) => x.key === norm || (digits(x.key) === digits(norm) && isNear(x.key, norm)));
    if (!g) {
      g = { key: norm, label: a.raw.trim(), teamIds: [], suggested: judgeAnswer(a.raw, q), raws: new Map() };
      groups.push(g);
    }
    g.teamIds.push(a.teamId);
    g.raws.set(a.raw.trim(), (g.raws.get(a.raw.trim()) ?? 0) + 1);
  }
  const order: Record<AutoVerdict, number> = { ask: 0, correct: 1, wrong: 2 };
  return groups
    .map(({ raws, ...g }) => ({ ...g, label: [...raws.entries()].sort((x, y) => y[1] - x[1])[0]?.[0] ?? g.label }))
    .sort((a, b) => order[a.suggested] - order[b.suggested] || b.teamIds.length - a.teamIds.length);
}

// ─── scoring ─────────────────────────────────────────────────────────────────

/**
 * Points for one judged answer. Confidence rounds earn the staked number;
 * the final wager wins or loses the bet; a partial is half (rounded down).
 * The team's joker doubles a round's gains (never its losses).
 */
export function pointsFor(i: { verdict: Verdict; style: RoundStyle; points: number; confidence?: number | null; wager?: number | null; joker: boolean }): number {
  if (i.verdict === "pending") return 0;
  if (i.style === "final") {
    const bet = Math.max(0, i.wager ?? 0);
    return i.verdict === "correct" ? bet : i.verdict === "wrong" ? -bet : 0;
  }
  const base = i.style === "confidence" ? Math.max(0, i.confidence ?? 0) : i.points;
  const earned = i.verdict === "correct" ? base : i.verdict === "partial" ? Math.floor(base / 2) : 0;
  return i.joker ? earned * 2 : earned;
}

/** Confidence values still open to a team in a round (each 1..N once). */
export function confidenceLeft(questionCount: number, used: number[]): number[] {
  return Array.from({ length: questionCount }, (_, i) => questionCount - i).filter((n) => !used.includes(n));
}

/** The most a team may bet on the final question. */
export function wagerCap(score: number): number {
  return Math.max(0, Math.min(FINAL_WAGER_MAX, score));
}

// ─── templates ───────────────────────────────────────────────────────────────

export interface TemplateRound { title: string; style: RoundStyle; count: number; points?: number; jokerAllowed?: boolean; seconds?: number }
export interface TriviaTemplate { id: string; label: string; blurb: string; familySafe: boolean; rounds: TemplateRound[] }

export const TEMPLATES: TriviaTemplate[] = [
  {
    id: "stream", label: "On stream", blurb: "Three rounds of 6 for your chat: no wagers, 45 seconds a question so stream delay doesn't matter. About 25 minutes.", familySafe: true,
    rounds: [
      { title: "Warm-up", style: "classic", count: 6 },
      { title: "Picture round", style: "picture", count: 6 },
      { title: "Gaming", style: "classic", count: 6 },
    ],
  },
  {
    id: "party", label: "Party", blurb: "Five rounds of 8 with a picture round, a confidence round and a final wager. About 75 minutes.", familySafe: false,
    rounds: [
      { title: "General knowledge", style: "classic", count: 8, jokerAllowed: true },
      { title: "Picture round", style: "picture", count: 8, jokerAllowed: true },
      { title: "Confidence round", style: "confidence", count: 5 },
      { title: "Pop culture", style: "classic", count: 8, jokerAllowed: true },
      { title: "Final question", style: "final", count: 1 },
    ],
  },
  {
    id: "office", label: "Office", blurb: "Four rounds of 6, family-safe, no wagers. Fits a lunch hour.", familySafe: true,
    rounds: [
      { title: "Warm-up", style: "classic", count: 6 },
      { title: "Picture round", style: "picture", count: 6 },
      { title: "Around the world", style: "classic", count: 6 },
      { title: "Lightning round", style: "classic", count: 6, seconds: 20 },
    ],
  },
  {
    id: "fundraiser", label: "Fundraiser", blurb: "Five rounds with jokers on every regular round and a big final wager.", familySafe: true,
    rounds: [
      { title: "Round one", style: "classic", count: 8, jokerAllowed: true },
      { title: "Round two", style: "classic", count: 8, jokerAllowed: true },
      { title: "Picture round", style: "picture", count: 8, jokerAllowed: true },
      { title: "Round four", style: "classic", count: 8, jokerAllowed: true },
      { title: "Final question", style: "final", count: 1 },
    ],
  },
  {
    id: "bar", label: "Bar night", blurb: "Seven rounds of 8 and a final, the classic weekly format. About two hours.", familySafe: false,
    rounds: [
      { title: "Round one", style: "classic", count: 8, jokerAllowed: true },
      { title: "Round two", style: "classic", count: 8, jokerAllowed: true },
      { title: "Picture round", style: "picture", count: 8, jokerAllowed: true },
      { title: "Confidence round", style: "confidence", count: 5 },
      { title: "Round five", style: "classic", count: 8, jokerAllowed: true },
      { title: "Round six", style: "classic", count: 8, jokerAllowed: true },
      { title: "Round seven", style: "classic", count: 8, jokerAllowed: true },
      { title: "Final question", style: "final", count: 1 },
    ],
  },
];

export function templateRounds(t: TriviaTemplate): TriviaRound[] {
  return t.rounds.map((r) => ({
    title: r.title,
    style: r.style,
    points: r.points ?? 1,
    seconds: r.seconds ?? (r.style === "final" ? 60 : 45),
    jokerAllowed: !!r.jokerAllowed,
    questions: [],
  }));
}

export function roundTarget(t: TriviaTemplate | null | undefined, index: number): number {
  return t?.rounds[index]?.count ?? 8;
}

export const STYLE_LABEL: Record<RoundStyle, string> = {
  classic: "Classic",
  picture: "Picture round",
  confidence: "Confidence",
  final: "Final wager",
};

/** A short join code: no 0/O or 1/I so it reads off a TV. */
export function joinCode(random: () => number = Math.random, length = 5): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length }, () => alphabet[Math.floor(random() * alphabet.length)]).join("");
}

// ─── filling a round from the pack ───────────────────────────────────────────

export interface PoolQuestion { id: string; category?: string | null; difficulty?: Difficulty | null; kind: QuestionKind; familySafe?: boolean }

const catOf = (q: PoolQuestion) => q.category ?? "General";
const diffOf = (q: PoolQuestion): Difficulty => q.difficulty ?? "medium";

/** Which pack categories a round draws from, read off its style and title ("Around the world" → Geography). Null = any. */
export function roundCategories(round: { title: string; style: RoundStyle }): string[] | null {
  const t = round.title.toLowerCase();
  if (round.style === "picture") return null;
  if (/world|geograph|capital|map/.test(t)) return ["Geography"];
  if (/pop culture|entertainment/.test(t)) return ["Movies & TV", "Music", "Video games"];
  if (/video game|gaming|games/.test(t)) return ["Video games"];
  if (/movie|film|tv|screen/.test(t)) return ["Movies & TV"];
  if (/music|song/.test(t)) return ["Music"];
  if (/science|nature/.test(t)) return ["Science & nature"];
  if (/history/.test(t)) return ["History"];
  if (/sport/.test(t)) return ["Sports"];
  if (/food|drink/.test(t)) return ["Food & drink"];
  if (/word|number|math/.test(t)) return ["Words & numbers"];
  return null;
}

const DIFF_ORDER: Record<Difficulty, number> = { easy: 0, medium: 1, hard: 2 };

/** The difficulty each slot aims for in a regular round: a mix that climbs, then settles. */
const MIX: Difficulty[] = ["easy", "medium", "hard", "easy", "medium", "medium", "easy", "hard"];

/**
 * Pick questions for a round. Regular rounds take turns across categories and
 * mix difficulties (easy, medium and a couple of hard); a picture round sticks
 * to one theme; the final is a hard one (numbers first, they settle ties); a
 * lightning round is easy. `taken` = already in this night, never used;
 * `avoid` = asked at this host's earlier nights, used only if nothing else
 * fits. Picks come back easy to hard.
 */
export function pickForRound<T extends PoolQuestion>(
  pool: T[],
  round: { title: string; style: RoundStyle },
  need: number,
  opts: { taken: Set<string>; avoid?: Set<string>; familySafe?: boolean; random?: () => number } = { taken: new Set() },
): T[] {
  if (need <= 0) return [];
  const random = opts.random ?? Math.random;
  const avoid = opts.avoid ?? new Set<string>();
  const lightning = /lightning|quick|speed/.test(round.title.toLowerCase());
  let fits = pool.filter((q) => !opts.taken.has(q.id) && (round.style === "picture" ? q.kind === "picture" : q.kind !== "picture") && (!opts.familySafe || q.familySafe !== false));
  const cats = roundCategories(round);
  if (cats) {
    const inCat = fits.filter((q) => cats.includes(catOf(q)));
    if (inCat.length >= need) fits = inCat;
  }
  if (round.style === "picture") {
    // One theme per picture round: the one with the most fresh pictures left,
    // so the broad set (game characters) comes before niche ones (Overwatch).
    const fresh = (c: string) => fits.filter((q) => catOf(q) === c && !avoid.has(q.id)).length;
    const themes = [...new Set(fits.map(catOf))].sort((a, b) => fresh(b) - fresh(a));
    if (themes.length && fits.filter((q) => catOf(q) === themes[0]).length >= need) fits = fits.filter((q) => catOf(q) === themes[0]);
  }
  const shuffled = fits.map((q) => ({ q, r: random() })).sort((a, b) => a.r - b.r).map((x) => x.q);
  const fresh = shuffled.filter((q) => !avoid.has(q.id));
  const stale = shuffled.filter((q) => avoid.has(q.id));
  let picked: T[];
  if (round.style === "final") {
    const score = (q: T) => (diffOf(q) === "hard" ? 0 : diffOf(q) === "medium" ? 2 : 4) + (q.kind === "number" ? 0 : 1);
    picked = [...fresh.sort((a, b) => score(a) - score(b)), ...stale.sort((a, b) => score(a) - score(b))].slice(0, need);
  } else {
    const want = (i: number): Difficulty => (lightning ? "easy" : MIX[i % MIX.length]);
    const a = mix(fresh, need, want);
    picked = [...a, ...mix(stale, need - a.length, (i) => want(i + a.length))];
  }
  return picked.sort((a, b) => DIFF_ORDER[diffOf(a)] - DIFF_ORDER[diffOf(b)]);
}

/** Fill slots in order, each from a category not used yet this lap, at the slot's difficulty when there is one. */
function mix<T extends PoolQuestion>(ranked: T[], need: number, want: (i: number) => Difficulty): T[] {
  const out: T[] = [];
  const left = [...ranked];
  const allCats = new Set(ranked.map(catOf)).size;
  const lap = new Set<string>();
  for (let i = 0; i < need && left.length; i++) {
    const d = want(i);
    const at =
      [(q: T) => diffOf(q) === d && !lap.has(catOf(q)), (q: T) => !lap.has(catOf(q)), (q: T) => diffOf(q) === d, () => true]
        .map((test) => left.findIndex(test)).find((x) => x >= 0) ?? -1;
    if (at < 0) break;
    const [q] = left.splice(at, 1);
    out.push(q);
    lap.add(catOf(q));
    if (lap.size >= allCats) lap.clear();
  }
  return out;
}
