import "server-only";

/**
 * Trivia Nights: the store (service role; tables from supabase/trivia-m1.sql).
 * Rules live in rules.ts; this file reads and writes, and keeps the privacy
 * lines: a phone and the TV never see an answer before its reveal, and a team
 * only ever acts with its own secret.
 *
 * A night runs question by question. The host opens a question (phase
 * `question`, a timer), it locks when the time is up or the host locks it
 * (answers are judged from the answer line; the close ones wait for the
 * host), the host reveals it (points land), shows standings when they like,
 * and moves on. No cron: reads lock a question whose time is up.
 */

import { randomBytes } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/admin";
import { normalize, questionKey } from "@/lib/chatbrain/rules";
import type { PackQuestion } from "@/data/originals/trivia-pack";
import { isBlockedText } from "@/lib/text/filter";
import {
  ANSWER_MAX,
  MAX_TEAMS,
  MAX_VIEWERS,
  STREAM_GRACE_MS,
  TEMPLATES,
  isViewerSecret,
  confidenceLeft,
  groupAnswers,
  joinCode,
  judgeAnswer,
  pickForRound,
  pointsFor,
  roundTarget,
  templateRounds,
  wagerCap,
  type AnswerGroup,
  type QuestionKind,
  type RoundStyle,
  type TriviaQuestion,
  type TriviaRound,
  type Verdict,
} from "./rules";

export class TriviaNotReady extends Error {
  constructor() { super("Trivia needs supabase/trivia-m1.sql"); this.name = "TriviaNotReady"; }
}
const notReady = (e: { code?: string } | null) => e?.code === "42P01" || e?.code === "PGRST205" || e?.code === "42703";

export type Phase = "lobby" | "question" | "locked" | "reveal" | "standings" | "done";
export type GameStatus = "draft" | "live" | "done" | "cancelled";

/** A night played on stream: viewers answer in chat or on /live as their own teams (src/lib/trivia/stream.ts). */
export interface StreamSettings { communityId: string; broadcasterId: string | null; since: string }

export interface GameRow {
  id: string; host_user_id: string; title: string; template: string | null; code: string; rounds: TriviaRound[];
  settings: { familySafe?: boolean; stream?: StreamSettings } | null; status: GameStatus; round_index: number; question_index: number; phase: Phase;
  opened_at: string | null; closes_at: string | null; event_id: string | null; created_at: string; started_at: string | null; finished_at: string | null;
}
export interface TeamRow { id: string; game_id: string; name: string; secret: string; score: number; joker_round: number | null; created_at: string; last_seen_at: string }
interface AnswerRow { team_id: string; game_id: string; round: number; question: number; raw: string; normalized: string; confidence: number | null; wager: number | null; verdict: Verdict; points: number; submitted_at: string }

const GAME_COLS = "id, host_user_id, title, template, code, rounds, settings, status, round_index, question_index, phase, opened_at, closes_at, event_id, created_at, started_at, finished_at";

// ─── the question library ────────────────────────────────────────────────────

export interface LibraryQuestion extends TriviaQuestion {
  id: string;
  status: "draft" | "approved" | "retired";
  ownerUserId: string | null;
  familySafe: boolean;
  changeable: boolean;
  timesUsed: number;
  createdAt: string;
}

type QuestionRow = {
  id: string; owner_user_id: string | null; category: string; difficulty: "easy" | "medium" | "hard"; kind: QuestionKind; prompt: string; answer: string;
  accept: string[]; ask_about: string[]; reject: string[]; options: string[] | null; image_url: string | null; sources: { title: string; url?: string | null }[];
  as_of: string | null; changeable: boolean; family_safe: boolean; origin: "host" | "ai" | "staff"; status: "draft" | "approved" | "retired"; times_used: number; created_at: string;
};
const Q_COLS = "id, owner_user_id, category, difficulty, kind, prompt, answer, accept, ask_about, reject, options, image_url, sources, as_of, changeable, family_safe, origin, status, times_used, created_at";

function toQuestion(r: QuestionRow): LibraryQuestion {
  return {
    id: r.id, ownerUserId: r.owner_user_id, category: r.category, difficulty: r.difficulty, kind: r.kind, prompt: r.prompt, answer: r.answer,
    accept: r.accept ?? [], askAbout: r.ask_about ?? [], reject: r.reject ?? [], options: r.options, imageUrl: r.image_url, sources: r.sources ?? [],
    asOf: r.as_of, changeable: r.changeable, familySafe: r.family_safe, origin: r.origin, status: r.status, timesUsed: r.times_used, createdAt: r.created_at,
  };
}

/** The host's own questions (drafts first) and the GameShuffle pack. */
export async function listLibrary(ownerUserId: string, opts: { pack?: boolean } = {}): Promise<LibraryQuestion[]> {
  const svc = createServiceClient();
  const q = svc.from("trivia_questions").select(Q_COLS).neq("status", "retired").order("created_at", { ascending: false }).limit(opts.pack ? 2000 : 500);
  const { data, error } = opts.pack ? await q.is("owner_user_id", null).eq("status", "approved") : await q.eq("owner_user_id", ownerUserId);
  if (notReady(error)) throw new TriviaNotReady();
  return ((data ?? []) as QuestionRow[]).map(toQuestion);
}

export interface QuestionInput {
  prompt: string; answer: string; accept?: string[]; askAbout?: string[]; reject?: string[]; kind?: QuestionKind; options?: string[] | null;
  imageUrl?: string | null; category?: string; difficulty?: "easy" | "medium" | "hard"; sources?: { title: string; url?: string | null }[];
  asOf?: string | null; changeable?: boolean; familySafe?: boolean;
}

const cleanList = (xs: unknown, max = 12) =>
  (Array.isArray(xs) ? xs : []).filter((x): x is string => typeof x === "string").map((x) => x.trim().slice(0, ANSWER_MAX)).filter(Boolean).slice(0, max);

/** Validate a question from the builder or the AI. Returns an error code or the row to save. */
export function questionRow(input: QuestionInput): { ok: true; row: Record<string, unknown> } | { ok: false; error: string } {
  const prompt = input.prompt?.trim().replace(/\s+/g, " ") ?? "";
  const answer = input.answer?.trim().slice(0, ANSWER_MAX) ?? "";
  if (prompt.length < 8 || prompt.length > 300) return { ok: false, error: "bad_prompt" };
  if (!answer) return { ok: false, error: "bad_answer" };
  if (isBlockedText(prompt) || isBlockedText(answer)) return { ok: false, error: "blocked" };
  const kind: QuestionKind = ["text", "number", "choice", "picture"].includes(input.kind ?? "") ? input.kind! : "text";
  const options = kind === "choice" ? cleanList(input.options, 6) : null;
  if (kind === "choice" && (options!.length < 2 || !options!.some((o) => normalize(o) === normalize(answer)))) return { ok: false, error: "bad_options" };
  const imageUrl = kind === "picture" ? input.imageUrl?.trim() || null : null;
  if (kind === "picture" && !imageUrl) return { ok: false, error: "needs_image" };
  return {
    ok: true,
    row: {
      prompt, answer, kind, options, image_url: imageUrl,
      accept: cleanList(input.accept), ask_about: cleanList(input.askAbout), reject: cleanList(input.reject),
      category: (input.category ?? "General").trim().slice(0, 40) || "General",
      difficulty: ["easy", "medium", "hard"].includes(input.difficulty ?? "") ? input.difficulty : "medium",
      sources: (Array.isArray(input.sources) ? input.sources : []).slice(0, 4).map((s) => ({ title: String(s.title ?? "").slice(0, 120), url: s.url ? String(s.url).slice(0, 300) : null })).filter((s) => s.title),
      as_of: input.asOf && /^\d{4}-\d{2}-\d{2}$/.test(input.asOf) ? input.asOf : null,
      changeable: !!input.changeable,
      family_safe: input.familySafe !== false,
    },
  };
}

export async function saveQuestion(ownerUserId: string, input: QuestionInput, opts: { origin?: "host" | "ai"; status?: "draft" | "approved" } = {}): Promise<{ ok: true; question: LibraryQuestion } | { ok: false; error: string }> {
  const v = questionRow(input);
  if (!v.ok) return v;
  const { data, error } = await createServiceClient().from("trivia_questions")
    .insert({ ...v.row, owner_user_id: ownerUserId, origin: opts.origin ?? "host", status: opts.status ?? "approved" }).select(Q_COLS).single();
  if (notReady(error)) throw new TriviaNotReady();
  if (error || !data) return { ok: false, error: "failed" };
  return { ok: true, question: toQuestion(data as QuestionRow) };
}

export async function updateQuestion(ownerUserId: string, id: string, input: QuestionInput & { status?: "draft" | "approved" | "retired" }): Promise<{ ok: true; question: LibraryQuestion } | { ok: false; error: string }> {
  const svc = createServiceClient();
  let patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.prompt !== undefined) {
    const v = questionRow(input);
    if (!v.ok) return v;
    patch = { ...patch, ...v.row };
  }
  if (input.status) patch.status = input.status;
  const { data, error } = await svc.from("trivia_questions").update(patch).eq("id", id).eq("owner_user_id", ownerUserId).select(Q_COLS).maybeSingle();
  if (error || !data) return { ok: false, error: error ? "failed" : "not_found" };
  return { ok: true, question: toQuestion(data as QuestionRow) };
}

/** A library question as it's frozen into a game. */
export function forGame(q: LibraryQuestion): TriviaQuestion {
  return {
    id: q.id, prompt: q.prompt, answer: q.answer, accept: q.accept, askAbout: q.askAbout, reject: q.reject, kind: q.kind,
    options: q.options ?? null, imageUrl: q.imageUrl ?? null, category: q.category, difficulty: q.difficulty, sources: q.sources, asOf: q.asOf, origin: q.origin,
  };
}

// ─── the GameShuffle pack (staff) ────────────────────────────────────────────

export interface PackCounts { draft: number; approved: number; retired: number }

/** Every pack question for Platform ▸ Trivia, any status. */
export async function packAdminList(): Promise<{ questions: LibraryQuestion[]; counts: PackCounts }> {
  const { data, error } = await createServiceClient().from("trivia_questions").select(Q_COLS).is("owner_user_id", null)
    .order("category").order("created_at").limit(2000);
  if (notReady(error)) throw new TriviaNotReady();
  const questions = ((data ?? []) as QuestionRow[]).map(toQuestion);
  const counts: PackCounts = { draft: 0, approved: 0, retired: 0 };
  for (const q of questions) counts[q.status]++;
  return { questions, counts };
}

/** A pack question's identity for imports: the prompt plus its picture (picture prompts repeat). */
const packKey = (prompt: string, imageUrl: string | null | undefined) => `${questionKey(prompt)}|${imageUrl ?? ""}`;

/** How many bank questions aren't in the pack yet. */
export async function packBankMissing(bank: PackQuestion[]): Promise<number> {
  const { data } = await createServiceClient().from("trivia_questions").select("prompt, image_url").is("owner_user_id", null).limit(5000);
  const have = new Set(((data ?? []) as { prompt: string; image_url: string | null }[]).map((r) => packKey(r.prompt, r.image_url)));
  return bank.filter((b) => !have.has(packKey(b.prompt, b.imageUrl))).length;
}

/** Add the bank's questions the pack doesn't have, as drafts for staff to check. Safe to rerun. */
export async function importPack(bank: PackQuestion[]): Promise<{ added: number; skipped: number; invalid: string[] }> {
  const svc = createServiceClient();
  const { data, error } = await svc.from("trivia_questions").select("prompt, image_url").is("owner_user_id", null).limit(5000);
  if (notReady(error)) throw new TriviaNotReady();
  const have = new Set(((data ?? []) as { prompt: string; image_url: string | null }[]).map((r) => packKey(r.prompt, r.image_url)));
  const rows: Record<string, unknown>[] = [];
  const invalid: string[] = [];
  let skipped = 0;
  for (const b of bank) {
    const key = packKey(b.prompt, b.imageUrl);
    if (have.has(key)) { skipped++; continue; }
    const v = questionRow({ ...b, familySafe: true });
    if (!v.ok) { invalid.push(`${b.prompt} (${v.error})`); continue; }
    have.add(key);
    rows.push({ ...v.row, owner_user_id: null, origin: "staff", status: "draft" });
  }
  for (let i = 0; i < rows.length; i += 200) {
    const { error: e } = await svc.from("trivia_questions").insert(rows.slice(i, i + 200));
    if (e) throw new Error(`trivia pack import failed: ${e.message}`);
  }
  return { added: rows.length, skipped, invalid };
}

export async function setPackStatus(ids: string[], status: "draft" | "approved" | "retired"): Promise<number> {
  const clean = ids.filter((x) => /^[0-9a-f-]{36}$/i.test(x)).slice(0, 500);
  if (!clean.length) return 0;
  const { data } = await createServiceClient().from("trivia_questions").update({ status, updated_at: new Date().toISOString() })
    .in("id", clean).is("owner_user_id", null).select("id");
  return (data ?? []).length;
}

export async function updatePackQuestion(id: string, input: QuestionInput): Promise<{ ok: true; question: LibraryQuestion } | { ok: false; error: string }> {
  const svc = createServiceClient();
  const { data: cur } = await svc.from("trivia_questions").select(Q_COLS).eq("id", id).is("owner_user_id", null).maybeSingle();
  if (!cur) return { ok: false, error: "not_found" };
  const base = toQuestion(cur as QuestionRow);
  const v = questionRow({ ...base, category: base.category ?? undefined, difficulty: base.difficulty ?? undefined, ...input, familySafe: input.familySafe ?? base.familySafe });
  if (!v.ok) return v;
  const { data, error } = await svc.from("trivia_questions").update({ ...v.row, updated_at: new Date().toISOString() }).eq("id", id).select(Q_COLS).single();
  if (error || !data) return { ok: false, error: "failed" };
  return { ok: true, question: toQuestion(data as QuestionRow) };
}

// ─── games ───────────────────────────────────────────────────────────────────

async function uniqueCode(): Promise<string> {
  const svc = createServiceClient();
  for (let i = 0; i < 8; i++) {
    const code = joinCode();
    const { data } = await svc.from("trivia_games").select("id").eq("code", code).maybeSingle();
    if (!data) return code;
  }
  return joinCode(Math.random, 7);
}

export async function createGame(hostUserId: string, input: { templateId: string; title: string }): Promise<{ ok: true; game: GameRow } | { ok: false; error: string }> {
  const t = TEMPLATES.find((x) => x.id === input.templateId) ?? TEMPLATES[0];
  const title = input.title.trim().slice(0, 80) || `${t.label} trivia`;
  const { data, error } = await createServiceClient().from("trivia_games").insert({
    host_user_id: hostUserId, title, template: t.id, code: await uniqueCode(), rounds: templateRounds(t), settings: { familySafe: t.familySafe },
  }).select(GAME_COLS).single();
  if (notReady(error)) throw new TriviaNotReady();
  if (error || !data) return { ok: false, error: "failed" };
  return { ok: true, game: data as GameRow };
}

export async function listGames(hostUserId: string): Promise<GameRow[]> {
  const { data, error } = await createServiceClient().from("trivia_games").select(GAME_COLS).eq("host_user_id", hostUserId)
    .neq("status", "cancelled").order("created_at", { ascending: false }).limit(50);
  if (notReady(error)) throw new TriviaNotReady();
  return (data ?? []) as GameRow[];
}

export async function getGame(id: string): Promise<GameRow | null> {
  const { data, error } = await createServiceClient().from("trivia_games").select(GAME_COLS).eq("id", id).maybeSingle();
  if (notReady(error)) throw new TriviaNotReady();
  return (data as GameRow | null) ?? null;
}

export async function gameByCode(code: string): Promise<GameRow | null> {
  const clean = code.trim().toUpperCase();
  if (!/^[A-Z0-9]{4,8}$/.test(clean)) return null;
  const { data, error } = await createServiceClient().from("trivia_games").select(GAME_COLS).eq("code", clean).maybeSingle();
  if (notReady(error)) throw new TriviaNotReady();
  return (data as GameRow | null) ?? null;
}

function cleanRound(r: Partial<TriviaRound>): TriviaRound | null {
  const style: RoundStyle = ["classic", "picture", "confidence", "final"].includes(r.style ?? "") ? (r.style as RoundStyle) : "classic";
  const questions = (Array.isArray(r.questions) ? r.questions : []).slice(0, style === "final" ? 1 : 12)
    .map((q) => {
      const v = questionRow({ ...q, category: q.category ?? undefined, difficulty: q.difficulty ?? undefined });
      if (!v.ok) return null;
      const row = v.row as { prompt: string; answer: string; accept: string[]; ask_about: string[]; reject: string[]; kind: QuestionKind; options: string[] | null; image_url: string | null; category: string; difficulty: "easy" | "medium" | "hard"; sources: { title: string; url: string | null }[]; as_of: string | null };
      return { id: q.id ?? null, prompt: row.prompt, answer: row.answer, accept: row.accept, askAbout: row.ask_about, reject: row.reject, kind: row.kind, options: row.options, imageUrl: row.image_url, category: row.category, difficulty: row.difficulty, sources: row.sources, asOf: row.as_of, origin: q.origin ?? "host" } as TriviaQuestion;
    })
    .filter((q): q is TriviaQuestion => !!q);
  return {
    title: (r.title ?? "Round").toString().trim().slice(0, 60) || "Round",
    style,
    points: Math.min(10, Math.max(1, Math.round(Number(r.points) || 1))),
    seconds: Math.min(180, Math.max(10, Math.round(Number(r.seconds) || 45))),
    jokerAllowed: style !== "final" && !!r.jokerAllowed,
    questions,
  };
}

/** Save the builder: title and rounds (while the night hasn't started). */
export async function saveGame(hostUserId: string, id: string, input: { title?: string; rounds?: Partial<TriviaRound>[] }): Promise<{ ok: true; game: GameRow } | { ok: false; error: string }> {
  const game = await getGame(id);
  if (!game || game.host_user_id !== hostUserId) return { ok: false, error: "not_found" };
  if (game.status !== "draft") return { ok: false, error: "already_started" };
  const patch: Record<string, unknown> = {};
  if (input.title !== undefined) patch.title = input.title.trim().slice(0, 80) || game.title;
  if (input.rounds !== undefined) patch.rounds = input.rounds.slice(0, 10).map(cleanRound).filter(Boolean);
  const { data, error } = await createServiceClient().from("trivia_games").update(patch).eq("id", id).select(GAME_COLS).single();
  if (error || !data) return { ok: false, error: "failed" };
  return { ok: true, game: data as GameRow };
}

/** Open the room: teams can join by code. Needs at least one question. `stream` also plays it on the host's stream. */
export async function goLive(hostUserId: string, id: string, opts: { stream?: StreamSettings } = {}): Promise<{ ok: true; game: GameRow } | { ok: false; error: string }> {
  const game = await getGame(id);
  if (!game || game.host_user_id !== hostUserId) return { ok: false, error: "not_found" };
  if (game.status !== "draft") return { ok: true, game };
  const rounds = game.rounds.filter((r) => r.questions.length > 0);
  if (rounds.length === 0) return { ok: false, error: "no_questions" };
  const svc = createServiceClient();
  const { data, error } = await svc.from("trivia_games").update({
    status: "live", rounds, round_index: 0, question_index: 0, phase: "lobby", started_at: new Date().toISOString(),
    ...(opts.stream ? { settings: { ...(game.settings ?? {}), stream: opts.stream } } : {}),
  }).eq("id", id).eq("status", "draft").select(GAME_COLS).single();
  if (error || !data) return { ok: false, error: "failed" };
  // Count the library questions as used (repeat warnings in the builder).
  const ids = rounds.flatMap((r) => r.questions.map((q) => q.id)).filter((x): x is string => !!x);
  if (ids.length) await svc.from("trivia_questions").update({ last_used_at: new Date().toISOString() }).in("id", ids);
  return { ok: true, game: data as GameRow };
}

/**
 * Fill a night's empty slots from the GameShuffle pack (one round, or every
 * round): each round up to its template count, the final to one question.
 * Skips anything already in the night and, while there's enough, anything
 * this host asked at an earlier night.
 */
export async function fillFromPack(hostUserId: string, id: string, roundIndex?: number): Promise<{ ok: true; game: GameRow; added: number; short: number } | { ok: false; error: string }> {
  const game = await getGame(id);
  if (!game || game.host_user_id !== hostUserId) return { ok: false, error: "not_found" };
  if (game.status !== "draft") return { ok: false, error: "already_started" };
  const svc = createServiceClient();
  const [pool, earlier] = await Promise.all([
    listLibrary(hostUserId, { pack: true }),
    svc.from("trivia_games").select("rounds").eq("host_user_id", hostUserId).in("status", ["live", "done"]).neq("id", id).limit(100),
  ]);
  if (pool.length === 0) return { ok: false, error: "pack_empty" };
  const avoid = new Set(((earlier.data ?? []) as { rounds: TriviaRound[] }[]).flatMap((g) => (g.rounds ?? []).flatMap((r) => r.questions.map((q) => q.id))).filter((x): x is string => !!x));
  const taken = new Set(game.rounds.flatMap((r) => r.questions.map((q) => q.id)).filter((x): x is string => !!x));
  const template = TEMPLATES.find((t) => t.id === game.template) ?? null;
  let added = 0;
  let short = 0;
  const rounds = game.rounds.map((r, i) => {
    if (roundIndex !== undefined && roundIndex !== i) return r;
    const target = r.style === "final" ? 1 : roundTarget(template, i);
    const need = Math.max(0, target - r.questions.length);
    const picks = pickForRound(pool, r, need, { taken, avoid, familySafe: !!game.settings?.familySafe });
    for (const p of picks) taken.add(p.id);
    added += picks.length;
    short += need - picks.length;
    return { ...r, questions: [...r.questions, ...picks.map(forGame)] };
  });
  if (added === 0) return { ok: true, game, added, short };
  const { data, error } = await svc.from("trivia_games").update({ rounds }).eq("id", id).eq("status", "draft").select(GAME_COLS).single();
  if (error || !data) return { ok: false, error: "failed" };
  return { ok: true, game: data as GameRow, added, short };
}

// ─── teams ───────────────────────────────────────────────────────────────────

export async function joinTeam(code: string, rawName: string): Promise<{ ok: true; teamId: string; secret: string; name: string } | { ok: false; error: string }> {
  const game = await gameByCode(code);
  if (!game || game.status === "cancelled") return { ok: false, error: "not_found" };
  if (game.status === "done") return { ok: false, error: "finished" };
  const name = rawName.trim().replace(/\s+/g, " ").slice(0, 40);
  if (name.length < 2) return { ok: false, error: "bad_name" };
  if (isBlockedText(name)) return { ok: false, error: "blocked" };
  const svc = createServiceClient();
  // Viewer teams on stream don't take the room's places.
  const { count } = await svc.from("trivia_teams").select("id", { count: "exact", head: true }).eq("game_id", game.id).not("secret", "like", "v1.%");
  if ((count ?? 0) >= MAX_TEAMS) return { ok: false, error: "full" };
  const secret = randomBytes(18).toString("base64url");
  const { data, error } = await svc.from("trivia_teams").insert({ game_id: game.id, name, secret }).select("id, name").single();
  if (error?.code === "23505") return { ok: false, error: "name_taken" };
  if (error || !data) return { ok: false, error: "failed" };
  return { ok: true, teamId: (data as { id: string }).id, secret, name: (data as { name: string }).name };
}

/** Another phone joining a team that already exists: same secret, shared by the team's players. */
export async function teamFor(gameId: string, teamId: string, secret: string): Promise<TeamRow | null> {
  if (!teamId || !secret) return null;
  const { data } = await createServiceClient().from("trivia_teams").select("id, game_id, name, secret, score, joker_round, created_at, last_seen_at")
    .eq("id", teamId).eq("game_id", gameId).maybeSingle();
  const team = data as TeamRow | null;
  return team && team.secret === secret ? team : null;
}

async function teamsOf(gameId: string): Promise<TeamRow[]> {
  const { data } = await createServiceClient().from("trivia_teams").select("id, game_id, name, secret, score, joker_round, created_at, last_seen_at").eq("game_id", gameId).order("created_at").limit(MAX_VIEWERS + MAX_TEAMS);
  return (data ?? []) as TeamRow[];
}

async function answersFor(gameId: string, round: number, question?: number): Promise<AnswerRow[]> {
  let q = createServiceClient().from("trivia_answers").select("team_id, game_id, round, question, raw, normalized, confidence, wager, verdict, points, submitted_at").eq("game_id", gameId).eq("round", round);
  if (question !== undefined) q = q.eq("question", question);
  const { data } = await q.limit(20_000);
  return (data ?? []) as AnswerRow[];
}

const currentRound = (g: GameRow) => g.rounds[g.round_index];
const currentQuestion = (g: GameRow) => currentRound(g)?.questions[g.question_index];
export const isStreamGame = (g: GameRow) => !!g.settings?.stream;
/** Update many teams' answers to the current question at once (500 ids a call). */
async function setVerdicts(game: GameRow, teamIds: string[], verdict: Exclude<Verdict, "pending">): Promise<boolean> {
  const svc = createServiceClient();
  for (let i = 0; i < teamIds.length; i += 500) {
    const { error } = await svc.from("trivia_answers").update({ verdict, judged_at: new Date().toISOString() })
      .eq("game_id", game.id).eq("round", game.round_index).eq("question", game.question_index).in("team_id", teamIds.slice(i, i + 500));
    if (error) return false;
  }
  return true;
}

/** Play the joker on a round that hasn't started yet. */
export async function setJoker(game: GameRow, team: TeamRow, round: number): Promise<{ ok: true } | { ok: false; error: string }> {
  const r = game.rounds[round];
  if (!r?.jokerAllowed) return { ok: false, error: "no_joker_here" };
  if (team.joker_round !== null) return { ok: false, error: "joker_used" };
  const started = round < game.round_index || (round === game.round_index && (game.question_index > 0 || game.phase !== "lobby"));
  if (started) return { ok: false, error: "round_started" };
  const { error } = await createServiceClient().from("trivia_teams").update({ joker_round: round }).eq("id", team.id).is("joker_round", null);
  return error ? { ok: false, error: "failed" } : { ok: true };
}

/** A team's answer to the open question (replaceable until it locks). */
export async function submitAnswer(game: GameRow, team: TeamRow, input: { raw: string; confidence?: number | null; wager?: number | null }): Promise<{ ok: true } | { ok: false; error: string }> {
  const live = await tick(game);
  if (live.phase !== "question") return { ok: false, error: "closed" };
  const round = currentRound(live);
  const raw = input.raw.trim().replace(/\s+/g, " ").slice(0, ANSWER_MAX);
  if (!raw) return { ok: false, error: "empty" };
  let confidence: number | null = null;
  let wager: number | null = null;
  if (round.style === "confidence") {
    const used = (await answersFor(live.id, live.round_index)).filter((a) => a.team_id === team.id && a.question !== live.question_index).map((a) => a.confidence ?? 0);
    confidence = Number(input.confidence);
    if (!confidenceLeft(round.questions.length, used).includes(confidence)) return { ok: false, error: "bad_confidence" };
  }
  if (round.style === "final") {
    wager = Math.round(Number(input.wager) || 0);
    if (wager < 0 || wager > wagerCap(team.score)) return { ok: false, error: "bad_wager" };
  }
  const { error } = await createServiceClient().from("trivia_answers").upsert({
    team_id: team.id, game_id: live.id, round: live.round_index, question: live.question_index, raw, normalized: normalize(raw) || raw.toLowerCase(),
    confidence, wager, verdict: "pending", points: 0, submitted_at: new Date().toISOString(),
  }, { onConflict: "team_id,round,question" });
  await createServiceClient().from("trivia_teams").update({ last_seen_at: new Date().toISOString() }).eq("id", team.id);
  return error ? { ok: false, error: "failed" } : { ok: true };
}

/**
 * A viewer's answer on stream (chat, /live). Viewers have no jokers, stakes
 * or wagers: a confidence or final round counts as a plain round for them.
 */
export async function submitViewerAnswer(game: GameRow, team: TeamRow, raw: string): Promise<{ ok: true } | { ok: false; error: string }> {
  // Read the phase fresh: callers may hold a cached copy, and an answer after the
  // lock (or the reveal) must never reset a judged one.
  const live = await tick((await getGame(game.id)) ?? game);
  if (live.phase !== "question") return { ok: false, error: "closed" };
  const answer = raw.trim().replace(/\s+/g, " ").slice(0, ANSWER_MAX);
  if (!answer) return { ok: false, error: "empty" };
  const { error } = await createServiceClient().from("trivia_answers").upsert({
    team_id: team.id, game_id: live.id, round: live.round_index, question: live.question_index, raw: answer, normalized: normalize(answer) || answer.toLowerCase(),
    confidence: null, wager: null, verdict: "pending", points: 0, submitted_at: new Date().toISOString(),
  }, { onConflict: "team_id,round,question" });
  return error ? { ok: false, error: "failed" } : { ok: true };
}

// ─── the host's controls ─────────────────────────────────────────────────────

async function patchGame(id: string, from: Partial<GameRow>, patch: Record<string, unknown>): Promise<GameRow | null> {
  let q = createServiceClient().from("trivia_games").update(patch).eq("id", id);
  for (const [k, v] of Object.entries(from)) q = q.eq(k, v as string | number);
  const { data } = await q.select(GAME_COLS).maybeSingle();
  return (data as GameRow | null) ?? null;
}

export async function openQuestion(game: GameRow): Promise<GameRow | null> {
  if (game.status !== "live" || game.phase !== "lobby") return null;
  const round = currentRound(game);
  if (!round) return null;
  const now = Date.now();
  return patchGame(game.id, { phase: "lobby", round_index: game.round_index, question_index: game.question_index }, {
    phase: "question", opened_at: new Date(now).toISOString(), closes_at: new Date(now + round.seconds * 1000).toISOString(),
  });
}

/** Lock the open question and judge what the answer line can; the rest waits for the host. */
export async function lockQuestion(game: GameRow): Promise<GameRow | null> {
  if (game.phase !== "question") return null;
  const locked = await patchGame(game.id, { phase: "question", round_index: game.round_index, question_index: game.question_index }, { phase: "locked", closes_at: new Date().toISOString() });
  if (!locked) return null;
  const q = currentQuestion(locked);
  const answers = await answersFor(locked.id, locked.round_index, locked.question_index);
  const by: Record<"correct" | "wrong", string[]> = { correct: [], wrong: [] };
  for (const a of answers) {
    const v = judgeAnswer(a.raw, q);
    if (v !== "ask") by[v].push(a.team_id);
  }
  await setVerdicts(locked, by.correct, "correct");
  await setVerdicts(locked, by.wrong, "wrong");
  return locked;
}

/** The host rules on a group of answers (every team in it at once). */
export async function judgeTeams(game: GameRow, teamIds: string[], verdict: Exclude<Verdict, "pending">): Promise<boolean> {
  if (game.phase !== "locked" && game.phase !== "reveal") return false;
  const ok = await setVerdicts(game, teamIds.slice(0, isStreamGame(game) ? MAX_VIEWERS + MAX_TEAMS : MAX_TEAMS), verdict);
  if (ok && game.phase === "reveal") await scoreQuestion(game);
  return ok;
}

/** Points for the current question's answers, then every team's total from all of its answers. */
async function scoreQuestion(game: GameRow): Promise<void> {
  const svc = createServiceClient();
  const round = currentRound(game);
  const [answers, teams] = await Promise.all([answersFor(game.id, game.round_index, game.question_index), teamsOf(game.id)]);
  const jokerBy = new Map(teams.map((t) => [t.id, t.joker_round]));
  const viewers = new Set(teams.filter((t) => isViewerSecret(t.secret)).map((t) => t.id));
  for (const a of answers) {
    // Viewers on stream play confidence and final rounds as plain rounds.
    const style = viewers.has(a.team_id) && (round.style === "confidence" || round.style === "final") ? "classic" : round.style;
    const points = pointsFor({ verdict: a.verdict, style, points: round.points, confidence: a.confidence, wager: a.wager, joker: jokerBy.get(a.team_id) === game.round_index });
    if (points !== a.points) await svc.from("trivia_answers").update({ points }).eq("team_id", a.team_id).eq("round", a.round).eq("question", a.question);
  }
  const { data: all } = await svc.from("trivia_answers").select("team_id, points").eq("game_id", game.id).limit(100_000);
  const totals = new Map<string, number>();
  for (const r of (all ?? []) as { team_id: string; points: number }[]) totals.set(r.team_id, (totals.get(r.team_id) ?? 0) + r.points);
  for (const t of teams) {
    const score = totals.get(t.id) ?? 0;
    if (score !== t.score) await svc.from("trivia_teams").update({ score }).eq("id", t.id);
  }
}

/** Reveal the answer. Anything the host left undecided counts as wrong. */
export async function revealQuestion(game: GameRow): Promise<GameRow | null> {
  if (game.phase !== "locked") return null;
  await createServiceClient().from("trivia_answers").update({ verdict: "wrong", judged_at: new Date().toISOString() })
    .eq("game_id", game.id).eq("round", game.round_index).eq("question", game.question_index).eq("verdict", "pending");
  await scoreQuestion(game);
  return patchGame(game.id, { phase: "locked", round_index: game.round_index, question_index: game.question_index }, { phase: "reveal" });
}

export async function showStandings(game: GameRow): Promise<GameRow | null> {
  if (game.phase !== "reveal" && game.phase !== "lobby") return null;
  return patchGame(game.id, { phase: game.phase }, { phase: "standings" });
}

/** On to the next question (or round). After the last one, the night is done. */
export async function nextQuestion(game: GameRow): Promise<GameRow | null> {
  if (game.phase !== "reveal" && game.phase !== "standings") return null;
  const round = currentRound(game);
  let r = game.round_index;
  let q = game.question_index + 1;
  if (q >= round.questions.length) { r += 1; q = 0; }
  if (r >= game.rounds.length) return finishGame(game);
  return patchGame(game.id, { phase: game.phase, round_index: game.round_index, question_index: game.question_index }, {
    phase: "lobby", round_index: r, question_index: q, opened_at: null, closes_at: null,
  });
}

export async function finishGame(game: GameRow): Promise<GameRow | null> {
  return patchGame(game.id, { status: "live" }, { status: "done", phase: "done", finished_at: new Date().toISOString() });
}

/** Lock a question whose time is up (any read can do it; the phase check makes it happen once). On stream, a few seconds later. */
export async function tick(game: GameRow): Promise<GameRow> {
  const grace = isStreamGame(game) ? STREAM_GRACE_MS : 0;
  if (game.phase === "question" && game.closes_at && Date.parse(game.closes_at) + grace <= Date.now()) {
    return (await lockQuestion(game)) ?? (await getGame(game.id)) ?? game;
  }
  return game;
}

// ─── views ───────────────────────────────────────────────────────────────────

/** A question as phones and the TV may see it: never the answer before the reveal. */
export interface PublicQuestion { prompt: string; kind: QuestionKind; options: string[] | null; imageUrl: string | null; category: string | null }
/** Our own pictures go through /api/trivia/pic so the file name ("tracer.webp") can't give the answer away. */
export const isOwnPicture = (url: string | null | undefined): url is string => !!url && /^\/images\/[\w/.-]+$/.test(url) && !url.includes("..");
export const publicQ = (q: TriviaQuestion, game: GameRow): PublicQuestion => ({
  prompt: q.prompt, kind: q.kind, options: q.options ?? null, category: q.category ?? null,
  imageUrl: isOwnPicture(q.imageUrl) ? `/api/trivia/pic/${game.code}?r=${game.round_index}&q=${game.question_index}` : q.imageUrl ?? null,
});

export interface RoomView {
  title: string;
  code: string;
  status: GameStatus;
  phase: Phase;
  round: { index: number; count: number; title: string; style: RoundStyle; points: number; seconds: number; questionCount: number; jokerAllowed: boolean } | null;
  questionIndex: number;
  question: PublicQuestion | null;
  closesAt: string | null;
  /** The answer, once revealed. */
  answer: string | null;
  standings: { name: string; score: number; isYou?: boolean }[];
  teams: { name: string; answered: boolean }[];
  /** How many teams got the revealed question. */
  gotIt: number | null;
}

export interface TeamView extends RoomView {
  team: { name: string; score: number; jokerRound: number | null };
  myAnswer: { raw: string; confidence: number | null; wager: number | null; verdict: Verdict; points: number } | null;
  confidenceLeft: number[];
  wagerCap: number;
}

async function roomView(game: GameRow, viewerTeamId?: string): Promise<RoomView & { _answers: AnswerRow[]; _teams: TeamRow[] }> {
  const round = currentRound(game);
  const q = currentQuestion(game);
  const [teams, answers] = await Promise.all([teamsOf(game.id), round ? answersFor(game.id, game.round_index, game.question_index) : Promise.resolve([] as AnswerRow[])]);
  const answered = new Set(answers.map((a) => a.team_id));
  const showQ = game.phase === "question" || game.phase === "locked" || game.phase === "reveal";
  const revealed = game.phase === "reveal";
  const showScores = game.phase === "reveal" || game.phase === "standings" || game.phase === "done" || game.phase === "lobby";
  return {
    title: game.title,
    code: game.code,
    status: game.status,
    phase: game.phase,
    round: round ? { index: game.round_index, count: game.rounds.length, title: round.title, style: round.style, points: round.points, seconds: round.seconds, questionCount: round.questions.length, jokerAllowed: round.jokerAllowed } : null,
    questionIndex: game.question_index,
    question: showQ && q ? publicQ(q, game) : null,
    closesAt: game.phase === "question" ? game.closes_at : null,
    answer: revealed && q ? q.answer : null,
    standings: showScores ? [...teams].sort((a, b) => b.score - a.score).map((t) => ({ name: t.name, score: t.score, ...(viewerTeamId === t.id ? { isYou: true } : {}) })) : [],
    teams: teams.map((t) => ({ name: t.name, answered: answered.has(t.id) })),
    gotIt: revealed ? answers.filter((a) => a.verdict === "correct" || a.verdict === "partial").length : null,
    _answers: answers,
    _teams: teams,
  };
}

const strip = <T extends { _answers: unknown; _teams: unknown }>(v: T): Omit<T, "_answers" | "_teams"> => {
  const { _answers, _teams, ...rest } = v;
  void _answers; void _teams;
  return rest;
};

export async function tvView(game: GameRow): Promise<RoomView> {
  const v = strip(await roomView(await tick(game)));
  // On stream, the room's TV lists its own teams and the top of the standings, not every viewer.
  return isStreamGame(game) ? { ...v, standings: v.standings.slice(0, 10) } : v;
}

/** The current question of a game (stream views read it too). */
export const questionOf = (g: GameRow): TriviaQuestion | undefined => currentQuestion(g);
export const roundOf = (g: GameRow): TriviaRound | undefined => currentRound(g);

export async function teamView(game: GameRow, team: TeamRow): Promise<TeamView> {
  const live = await tick(game);
  const v = await roomView(live, team.id);
  const round = currentRound(live);
  const mine = v._answers.find((a) => a.team_id === team.id) ?? null;
  const usedConfidence = round?.style === "confidence"
    ? (await answersFor(live.id, live.round_index)).filter((a) => a.team_id === team.id && a.question !== live.question_index).map((a) => a.confidence ?? 0)
    : [];
  const fresh = v._teams.find((t) => t.id === team.id) ?? team;
  return {
    ...strip(v),
    team: { name: fresh.name, score: fresh.score, jokerRound: fresh.joker_round },
    myAnswer: mine ? { raw: mine.raw, confidence: mine.confidence, wager: mine.wager, verdict: live.phase === "reveal" ? mine.verdict : "pending", points: live.phase === "reveal" ? mine.points : 0 } : null,
    confidenceLeft: round?.style === "confidence" ? confidenceLeft(round.questions.length, usedConfidence) : [],
    wagerCap: wagerCap(fresh.score),
  };
}

export interface HostView extends RoomView {
  id: string;
  rounds: { title: string; style: RoundStyle; questionCount: number }[];
  current: (TriviaQuestion & { index: number }) | null;
  groups: (AnswerGroup & { teams: string[]; verdict: Verdict | "mixed" })[];
  answeredCount: number;
  teamCount: number;
  isLast: boolean;
  /** Played on the host's stream too (viewers count as teams). */
  onStream: boolean;
}

export async function hostView(game: GameRow): Promise<HostView> {
  const live = await tick(game);
  const v = await roomView(live);
  const q = currentQuestion(live);
  const nameOf = new Map(v._teams.map((t) => [t.id, t.name]));
  const verdictOf = new Map(v._answers.map((a) => [a.team_id, a.verdict]));
  const groups = q && (live.phase === "locked" || live.phase === "reveal")
    ? groupAnswers(v._answers.map((a) => ({ teamId: a.team_id, raw: a.raw })), q).map((g) => {
        const vs = new Set(g.teamIds.map((id) => verdictOf.get(id) ?? "pending"));
        return { ...g, teams: g.teamIds.map((id) => nameOf.get(id) ?? "Team"), verdict: (vs.size === 1 ? [...vs][0] : "mixed") as Verdict | "mixed" };
      })
    : [];
  const round = currentRound(live);
  return {
    ...strip(v),
    // The host always sees the standings and the answer (the top 25 on stream, where every viewer is a team).
    standings: [...v._teams].sort((a, b) => b.score - a.score).slice(0, isStreamGame(live) ? 25 : undefined).map((t) => ({ name: t.name, score: t.score })),
    answer: q?.answer ?? null,
    question: q ? publicQ(q, live) : null,
    id: live.id,
    rounds: live.rounds.map((r) => ({ title: r.title, style: r.style, questionCount: r.questions.length })),
    current: q ? { ...q, index: live.question_index } : null,
    groups,
    answeredCount: v._answers.length,
    teamCount: v._teams.length,
    isLast: !!round && live.round_index === live.rounds.length - 1 && live.question_index === round.questions.length - 1,
    onStream: isStreamGame(live),
  };
}
