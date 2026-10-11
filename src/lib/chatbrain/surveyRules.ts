/**
 * Chat Brain survey rounds on stream: the pure grouping rules (no I/O,
 * client-safe). Spec: specs/gs-originals-chat-brain-stream.md ("Survey rounds").
 *
 * Chat answers a question with `!a` for 30 to 180 seconds. While it's open the
 * answers are grouped live, in layers:
 *
 *   spelling   identical normalized answers, then close spellings (autoGroup)
 *   AI         the latest meaning-merge pass ("chips" into "snacks"), run every
 *              ~10s while new answers arrive and once more at the close
 *   host       the streamer's or a mod's own merges, then hidden groups
 *
 * A group shows on stream only with at least 2 people and 2% of the answers,
 * and never once hidden. Everything is keyed by normalized answers, so a hide
 * or merge keeps working as new spellings arrive.
 */

import { GROUP_MIN_PEOPLE, GROUP_MIN_SHARE, autoGroup, type BoardAnswer } from "./rules";

/** A board needs this many answers (and BOARD_MIN_ANSWERS groups) from a survey round. */
export const SURVEY_BOARD_MIN_ANSWERS = 10;
/** Live AI merge passes per round (plus one at the close). */
export const SURVEY_LIVE_AI_PASSES = 4;
export const SURVEY_AI_EVERY_MS = 10_000;
/** AI passes a channel can use in a Pacific month before rounds fall back to spelling only. */
export const SURVEY_AI_PER_MONTH = 150;
/** The most groups shown on stream. */
export const SURVEY_SHOWN = 8;
/** A closed survey stays on the overlay this long. */
export const SURVEY_SHOW_DONE_MS = 60_000;

export type SurveyStyle = "live" | "hidden";

export interface SurveyAnswer { raw: string; normalized: string }

export interface SurveyState {
  style: SurveyStyle;
  /** Normalized answers the host hid: a group holding any of them is hidden. */
  hidden: string[];
  /** The host's merges: groups holding any `from` answer fold into the group holding `into`. */
  merges: { into: string; from: string[] }[];
  /** The latest AI grouping (keys = normalized answers). */
  ai?: { groups: { label: string; keys: string[] }[]; passes: number; at: string; distinct: number } | null;
}

export interface SurveyGroup {
  key: string;
  label: string;
  count: number;
  /** Every normalized answer in the group. */
  keys: string[];
  hidden: boolean;
}

export const EMPTY_SURVEY_STATE: SurveyState = { style: "live", hidden: [], merges: [], ai: null };

/** Read whatever a window recorded as survey state, tolerating older rows. */
export function surveyStateOf(raw: unknown): SurveyState {
  const r = (raw ?? {}) as Partial<SurveyState>;
  return {
    style: r.style === "hidden" ? "hidden" : "live",
    hidden: Array.isArray(r.hidden) ? r.hidden.filter((x): x is string => typeof x === "string") : [],
    merges: Array.isArray(r.merges) ? r.merges.filter((m) => m && typeof m.into === "string" && Array.isArray(m.from)) : [],
    ai: r.ai && Array.isArray(r.ai.groups) ? r.ai : null,
  };
}

/** Group a survey's answers: spelling, then the AI pass, then the host's merges and hides. Biggest first. */
export function surveyGroups(answers: SurveyAnswer[], state: SurveyState): SurveyGroup[] {
  const { groups: base, suggestions } = autoGroup(answers.map((a, i) => ({ id: String(i), raw: a.raw, normalized: a.normalized })));
  // Working set: one entry per group, keyed by its lead normalized answer.
  type W = { key: string; label: string; count: number; keys: string[]; lead: number; named: boolean };
  const groups = new Map<string, W>(base.map((g) => [g.key, { key: g.key, label: g.label, count: g.count, keys: [g.key], lead: g.count, named: false }]));
  const owner = new Map<string, string>(base.map((g) => [g.key, g.key]));

  const fold = (intoKey: string, fromKey: string, label?: string) => {
    const into = groups.get(owner.get(intoKey) ?? "");
    const from = groups.get(owner.get(fromKey) ?? "");
    if (!into || !from || into === from) {
      if (into && label && !into.named) { into.label = label; into.named = true; }
      return;
    }
    // The bigger side keeps its label unless the merge names the group.
    if (!label && !into.named && from.lead > into.lead) { into.label = from.label; into.lead = from.lead; }
    if (label) { into.label = label; into.named = true; }
    else if (from.named && !into.named) { into.label = from.label; into.named = true; }
    into.count += from.count;
    for (const k of from.keys) { into.keys.push(k); owner.set(k, into.key); }
    groups.delete(from.key);
  };

  for (const s of suggestions) fold(s.into, s.from);
  for (const g of state.ai?.groups ?? []) {
    const present = g.keys.filter((k) => owner.has(k));
    if (!present.length) continue;
    for (const k of present.slice(1)) fold(present[0], k);
    if (g.keys.length > 1 || present.length > 1) fold(present[0], present[0], g.label);
  }
  for (const m of state.merges) {
    if (!owner.has(m.into)) continue;
    for (const k of m.from) if (owner.has(k)) fold(m.into, k);
  }
  const hidden = new Set(state.hidden);
  return [...groups.values()]
    .map((g) => ({ key: g.key, label: g.label, count: g.count, keys: g.keys, hidden: g.keys.some((k) => hidden.has(k)) }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

/** Can this group be shown on stream? 2+ people, 2% of answers, not hidden. */
export function showable(g: SurveyGroup, total: number): boolean {
  return !g.hidden && g.count >= Math.max(GROUP_MIN_PEOPLE, Math.ceil(total * GROUP_MIN_SHARE));
}

/** The groups as numbered on stream (1 = biggest showable). `!cb hide 2` uses these numbers. */
export function shownGroups(groups: SurveyGroup[], total: number, limit = SURVEY_SHOWN): (SurveyGroup & { n: number; share: number })[] {
  return groups.filter((g) => showable(g, total)).slice(0, limit).map((g, i) => ({ ...g, n: i + 1, share: total ? g.count / total : 0 }));
}

/** Add a hide (or take it off) for a group. */
export function withHidden(state: SurveyState, group: SurveyGroup, hide: boolean): SurveyState {
  const set = new Set(state.hidden);
  for (const k of group.keys) { if (hide) set.add(k); else set.delete(k); }
  return { ...state, hidden: [...set] };
}

/** Fold groups into the first one. */
export function withMerge(state: SurveyState, into: SurveyGroup, from: SurveyGroup[]): SurveyState {
  const keys = from.filter((f) => f.key !== into.key).flatMap((f) => f.keys);
  if (!keys.length) return state;
  return { ...state, merges: [...state.merges, { into: into.key, from: keys }] };
}

/** Is a live AI pass due? Live style, under the cap, 10s since the last, and new answers since. */
export function aiPassDue(state: SurveyState, distinct: number, now: number): boolean {
  if (state.style !== "live" || distinct < 3) return false;
  const ai = state.ai;
  if (!ai) return true;
  if (ai.passes >= SURVEY_LIVE_AI_PASSES) return false;
  return distinct > ai.distinct && now - Date.parse(ai.at) >= SURVEY_AI_EVERY_MS;
}

/** Why a round didn't make a board, or null when it can. */
export function boardBlocker(total: number, board: BoardAnswer[]): "few_answers" | "few_groups" | null {
  if (total < SURVEY_BOARD_MIN_ANSWERS) return "few_answers";
  if (!board.length) return "few_groups";
  return null;
}

/**
 * `!cb ask` arguments: `[seconds] [hidden] [category | own question]`. "hidden"
 * (or "secret") keeps the answers off stream until the board is played.
 */
export function parseAsk(arg: string): { seconds: number | null; style: SurveyStyle | null; rest: string } {
  let rest = arg.trim().replace(/\s+/g, " ");
  let seconds: number | null = null;
  let style: SurveyStyle | null = null;
  for (let i = 0; i < 2; i++) {
    const n = rest.match(/^(\d{2,3})s?(?:\s+|$)/);
    if (n && seconds === null) { seconds = Number(n[1]); rest = rest.slice(n[0].length).trim(); continue; }
    const s = rest.match(/^(hidden|secret|live)(?:\s+|$)/i);
    if (s && style === null) { style = s[1].toLowerCase() === "live" ? "live" : "hidden"; rest = rest.slice(s[0].length).trim(); continue; }
  }
  return { seconds, style, rest };
}
