import "server-only";

/**
 * Chat Brain on stream: the window engine (specs/gs-originals-chat-brain-stream.md).
 *
 * A window is a timed period when chat answers with `!a`. Guesses land in
 * brain_stream_guesses, one per viewer per window (a later `!a` replaces it).
 * Two kinds of window run through here. A game's **guess windows** (Chat
 * plays: chat against a published board) are opened and scored by
 * streamGame.ts. Standalone **survey windows** (`!cb ask`): chat answers
 * a question for 30 to 180 seconds, and at close every guess becomes a
 * brain_answers row (source 'twitch', with the window id):
 *
 *   public question   feeds the site-wide board; nothing is revealed in chat
 *                     (the board has to stay a surprise)
 *   own question      the community's own (GS Pro); chat sees its top answers
 *
 * No cron: a window closes on the next `!a` or `!cb` after its time is up, and
 * the every-minute polls sweep calls sweepStreamWindows() as the backstop. The
 * close is claimed (open → closing) so only one caller closes it.
 */

import { createServiceClient } from "@/lib/supabase/admin";
import { resolveIdentity } from "@/lib/economy/identity";
import { sendChatMessage } from "@/lib/twitch/client";
import { isBlockedText } from "@/lib/text/filter";
import { MAX_ANSWER_LENGTH, autoGroup, normalize } from "./rules";
import { ChatBrainNotReady, promptNeedingAnswers } from "./store";
import { parseAsk, type SurveyStyle } from "./surveyRules";

export const SURVEY_SECONDS = { min: 30, max: 180, default: 60 } as const;
const OWN_QUESTION_CATEGORY = "streaming";

export type Platform = "twitch" | "youtube" | "site";

export interface StreamWindow {
  id: string;
  gameId: string | null;
  communityId: string;
  broadcasterId: string;
  kind: string;
  team: number | null;
  promptId: string | null;
  /** Game windows: the board's question (its prompt id). */
  boardId: string | null;
  seconds: number;
  opensAt: string;
  closesAt: string;
  status: "open" | "closing" | "closed";
  /** A speed round's board: guesses are judged as they arrive (streamSpeed.ts). */
  speed: boolean;
  /** A co-stream window: both channels' chats feed it, each guess tagged with its team (streamCostream.ts). */
  costream: boolean;
}

type WindowRow = {
  id: string; game_id: string | null; community_id: string; broadcaster_id: string; kind: string; team: number | null;
  prompt_id: string | null; board_id: string | null; seconds: number; opens_at: string; closes_at: string; status: StreamWindow["status"];
  speed?: string | null;
  costream?: string | null;
};
export const WINDOW_COLS = "id, game_id, community_id, broadcaster_id, kind, team, prompt_id, board_id, seconds, opens_at, closes_at, status, speed:answer->>speed, costream:answer->>costream";

export function toWindow(r: WindowRow): StreamWindow {
  return {
    id: r.id, gameId: r.game_id, communityId: r.community_id, broadcasterId: r.broadcaster_id, kind: r.kind, team: r.team,
    promptId: r.prompt_id, boardId: r.board_id, seconds: r.seconds, opensAt: r.opens_at, closesAt: r.closes_at, status: r.status,
    speed: r.speed === "true",
    costream: r.costream === "true",
  };
}

export function notReady(error: { code?: string } | null): boolean {
  return error?.code === "42P01" || error?.code === "PGRST205" || error?.code === "42703";
}

// ─── the open-window cache (the webhook fast lane reads this per chat line) ──
//
// Keyed by the channel a chat line came from. A co-stream's windows live on
// the host's channel; the guest's channel finds them through its team row
// (team 2), so `team` says which chat a guess belongs to (1 = the host's).

const CACHE_MS = 3000;
const cache = new Map<string, { at: number; window: StreamWindow | null; team: number | null }>();

export function forgetChannel(broadcasterId: string): void {
  cache.delete(broadcasterId);
}

/**
 * Open a game's window. It opens `delayMs` from now (the beat after a reveal,
 * or the question's first look) and runs `seconds` from then. In Chat plays
 * every window is a `guess` by chat; in 1v1 and Teams each player turn
 * (`faceoff`, `guess`, `steal`) is a window too, collecting chat's shadow
 * guesses while the side answers, and `last_steal` is chat's own. `meta`
 * starts the window's record (brain_stream_windows.answer). Null if the
 * channel already has an open window.
 */
export async function openGuessWindow(input: {
  gameId: string; communityId: string; broadcasterId: string; boardId: string; team: number | null; seconds: number; delayMs: number;
  kind?: "guess" | "faceoff" | "steal" | "last_steal"; meta?: Record<string, unknown>;
}): Promise<StreamWindow | null> {
  const opens = Date.now() + input.delayMs;
  const { data, error } = await createServiceClient().from("brain_stream_windows").insert({
    game_id: input.gameId, community_id: input.communityId, broadcaster_id: input.broadcasterId, kind: input.kind ?? "guess",
    team: input.team, board_id: input.boardId, seconds: input.seconds, answer: input.meta ?? null,
    opens_at: new Date(opens).toISOString(), closes_at: new Date(opens + input.seconds * 1000).toISOString(),
  }).select(WINDOW_COLS).single();
  if (error || !data) {
    if (error && error.code !== "23505") console.error("[chatbrain/stream] guess window not opened:", error);
    return null;
  }
  const window = toWindow(data as WindowRow);
  cache.set(input.broadcasterId, { at: Date.now(), window, team: window.costream ? 1 : null });
  return window;
}

/** Retire an open window without scoring it (the board ended, or the game did). */
export async function dropWindow(windowId: string, broadcasterId: string): Promise<void> {
  await createServiceClient().from("brain_stream_windows").update({ status: "closed", closed_at: new Date().toISOString() })
    .eq("id", windowId).eq("status", "open");
  forgetChannel(broadcasterId);
}

/** The channel's open window, cached for 3s per serverless instance. */
export async function openWindowFor(broadcasterId: string, opts: { fresh?: boolean } = {}): Promise<StreamWindow | null> {
  return (await channelWindow(broadcasterId, opts))?.window ?? null;
}

/**
 * The window a chat line from this channel goes to, and which team it plays
 * for: the channel's own window, or (for a co-stream guest) the host's.
 */
export async function channelWindow(broadcasterId: string, opts: { fresh?: boolean } = {}): Promise<{ window: StreamWindow; team: number | null } | null> {
  const hit = cache.get(broadcasterId);
  if (!opts.fresh && hit && Date.now() - hit.at < CACHE_MS) return hit.window ? { window: hit.window, team: hit.team } : null;
  const svc = createServiceClient();
  const { data, error } = await svc.from("brain_stream_windows").select(WINDOW_COLS)
    .eq("broadcaster_id", broadcasterId).eq("status", "open").maybeSingle();
  if (notReady(error)) { cache.set(broadcasterId, { at: Date.now(), window: null, team: null }); return null; }
  let window = data ? toWindow(data as WindowRow) : null;
  let team: number | null = window?.costream ? 1 : null;
  if (!window) {
    // A co-stream guest: their chat plays the host's game.
    const { data: t } = await svc.from("brain_stream_teams").select("game_id, brain_stream_games!inner(status)")
      .eq("broadcaster_id", broadcasterId).eq("team", 2).eq("brain_stream_games.status", "playing").limit(1).maybeSingle();
    const gameId = (t as { game_id: string } | null)?.game_id;
    if (gameId) {
      const { data: w } = await svc.from("brain_stream_windows").select(WINDOW_COLS).eq("game_id", gameId).eq("status", "open").limit(1).maybeSingle();
      if (w) { window = toWindow(w as WindowRow); team = 2; }
    }
  }
  cache.set(broadcasterId, { at: Date.now(), window, team });
  if (cache.size > 2000) cache.delete(cache.keys().next().value!);
  return window ? { window, team } : null;
}

// ─── opening a survey ────────────────────────────────────────────────────────

export type OpenSurveyResult =
  | { ok: true; window: StreamWindow; prompt: { id: string; text: string; own: boolean }; style: SurveyStyle }
  | { ok: false; error: "window_open" | "no_questions" | "not_pro" | "bad_question" | "blocked" | "not_ready" | "failed" };

/**
 * `!cb ask [seconds] [hidden] [category | own question]`, or the dashboard's
 * form (`seconds`, `style` and either `category` or `question`). A category
 * (slug or name) or nothing picks the public question that most needs answers;
 * anything else is the streamer's own question, which needs GS Pro and becomes
 * a board at the close (survey.ts). Own questions show their answers live
 * unless "hidden"; public ones always stay hidden.
 */
export async function openSurvey(input: {
  communityId: string; broadcasterId: string; ownerUserId: string; isPro: boolean;
  arg?: string; seconds?: number; style?: SurveyStyle; category?: string | null; question?: string | null;
}): Promise<OpenSurveyResult> {
  const svc = createServiceClient();
  if (await (await import("./streamCostream")).inCostream(input.communityId)) return { ok: false, error: "window_open" };
  const parsed = input.arg !== undefined ? parseAsk(input.arg) : { seconds: null, style: null, rest: "" };
  let rest = input.arg !== undefined ? parsed.rest : (input.question ?? input.category ?? "").trim().replace(/\s+/g, " ");
  const forceOwn = input.arg === undefined && !!input.question;
  const askedSeconds = input.seconds ?? parsed.seconds ?? SURVEY_SECONDS.default;
  const seconds = Math.min(SURVEY_SECONDS.max, Math.max(SURVEY_SECONDS.min, Math.round(askedSeconds)));

  const { data: cats, error: catErr } = await svc.from("brain_categories").select("slug, name");
  if (notReady(catErr)) return { ok: false, error: "not_ready" };
  const key = rest.toLowerCase();
  const cat = forceOwn ? undefined : ((cats ?? []) as { slug: string; name: string }[]).find((c) => c.slug === key || c.name.toLowerCase() === key);
  if (input.arg === undefined && !input.question) rest = cat ? rest : "";

  let prompt: { id: string; text: string; own: boolean };
  try {
    if (!rest || cat) {
      const p = await promptNeedingAnswers({ category: cat?.slug ?? null });
      if (!p) return { ok: false, error: "no_questions" };
      prompt = { id: p.id, text: p.text, own: false };
    } else {
      if (!input.isPro) return { ok: false, error: "not_pro" };
      if (rest.length < 8 || rest.length > 140) return { ok: false, error: "bad_question" };
      if (isBlockedText(rest)) return { ok: false, error: "blocked" };
      const { data, error } = await svc.from("brain_prompts").insert({
        text: rest, category: OWN_QUESTION_CATEGORY, community_id: input.communityId, origin: "community",
        status: "collecting", opens_at: new Date().toISOString(), created_by: input.ownerUserId,
      }).select("id, text").single();
      if (error || !data) return { ok: false, error: "failed" };
      prompt = { id: (data as { id: string }).id, text: (data as { text: string }).text, own: true };
    }
  } catch (err) {
    if (err instanceof ChatBrainNotReady) return { ok: false, error: "not_ready" };
    throw err;
  }

  const style: SurveyStyle = prompt.own ? input.style ?? parsed.style ?? "live" : "hidden";
  const now = Date.now();
  const { data: row, error } = await svc.from("brain_stream_windows").insert({
    community_id: input.communityId, broadcaster_id: input.broadcasterId, kind: "survey", prompt_id: prompt.id,
    seconds, opens_at: new Date(now).toISOString(), closes_at: new Date(now + seconds * 1000).toISOString(),
    answer: { style, hidden: [], merges: [], ai: null },
  }).select(WINDOW_COLS).single();
  if (notReady(error)) return { ok: false, error: "not_ready" };
  if (error?.code === "23505") return { ok: false, error: "window_open" };
  if (error || !row) return { ok: false, error: "failed" };
  const window = toWindow(row as WindowRow);
  cache.set(input.broadcasterId, { at: Date.now(), window, team: null });
  return { ok: true, window, prompt, style };
}

// ─── guesses ─────────────────────────────────────────────────────────────────

export type GuessResult = "saved" | "no_window" | "closed" | "rejected";

/**
 * A viewer's `!a`. Silent by design: no chat reply per guess. If the window's
 * time is up, this closes it instead (and the close posts to chat).
 */
export async function recordGuess(input: { broadcasterId: string; platform: Platform; viewer: string; name?: string | null; raw: string }): Promise<GuessResult> {
  const hit = await channelWindow(input.broadcasterId);
  if (!hit) return "no_window";
  const { window, team } = hit;
  if (window.speed) return (await import("./streamSpeed")).speedGuess(window, input);
  // A co-stream's control and steal windows take one chat only.
  if (window.costream && window.team !== null && window.team !== team) return "no_window";
  // A game's next guess hasn't started (chat is still seeing the reveal).
  if (Date.parse(window.opensAt) > Date.now()) return "no_window";
  if (Date.parse(window.closesAt) <= Date.now()) {
    await closeWindow(window.id);
    return "closed";
  }
  const raw = input.raw.trim().replace(/\s+/g, " ").slice(0, MAX_ANSWER_LENGTH);
  const normalized = normalize(raw);
  if (!raw || !normalized || isBlockedText(raw)) return "rejected";
  const { error } = await createServiceClient().from("brain_stream_guesses").upsert({
    window_id: window.id, team: window.costream ? team : null, platform: input.platform, viewer: input.viewer, name: input.name?.slice(0, 40) ?? null,
    raw, normalized, created_at: new Date().toISOString(),
  }, { onConflict: "window_id,platform,viewer" });
  return error ? "rejected" : "saved";
}

// ─── closing ─────────────────────────────────────────────────────────────────

export interface CloseSummary {
  windowId: string;
  broadcasterId: string;
  guesses: number;
  own: boolean;
  question: string | null;
  top: { label: string; count: number }[];
  /** Survey rounds: live or hidden, and whether a board came out of it. */
  style?: SurveyStyle;
  board?: { made: boolean; reason: string | null; size: number } | null;
}

export type GuessRow = { platform: Platform; viewer: string; name: string | null; raw: string; normalized: string; created_at: string; team?: number | null };

async function mapLimit<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) await fn(items[i++]);
  }));
}

/**
 * Close a window: claim it, turn survey guesses into brain_answers, store a
 * summary, post the chat line. Returns null if someone else closed it first.
 */
export async function closeWindow(windowId: string, opts: { announce?: boolean } = {}): Promise<CloseSummary | null> {
  const svc = createServiceClient();
  // A speed board's window isn't closed by its timer: running out is a strike (streamSpeed.ts).
  const { data: pre } = await svc.from("brain_stream_windows").select("speed:answer->>speed").eq("id", windowId).maybeSingle();
  if ((pre as { speed: string | null } | null)?.speed === "true") {
    await (await import("./streamSpeed")).speedTimeout(windowId);
    return null;
  }
  const { data: claimed } = await svc.from("brain_stream_windows").update({ status: "closing" })
    .eq("id", windowId).eq("status", "open").select(WINDOW_COLS).maybeSingle();
  if (!claimed) return null;
  const window = toWindow(claimed as WindowRow);
  forgetChannel(window.broadcasterId);

  const { data: gs } = await svc.from("brain_stream_guesses").select("platform, viewer, name, raw, normalized, created_at, team").eq("window_id", windowId).limit(20_000);
  const guesses = (gs ?? []) as GuessRow[];

  // A game's guess window: the game scores it, opens the next one and posts the line.
  if (window.gameId) {
    const { closeGameWindow } = await import("./streamGame");
    await closeGameWindow(window, guesses);
    return { windowId, broadcasterId: window.broadcasterId, guesses: guesses.length, own: false, question: null, top: [] };
  }

  let question: string | null = null;
  let own = false;
  if (window.kind === "survey" && window.promptId) {
    const { data: p } = await svc.from("brain_prompts").select("text, community_id").eq("id", window.promptId).maybeSingle();
    question = (p as { text: string } | null)?.text ?? null;
    own = !!(p as { community_id: string | null } | null)?.community_id;
    // One brain_answers row per viewer, keyed to their chat identity. Someone
    // who already answered this question elsewhere keeps their first answer.
    await mapLimit(guesses, 8, async (g) => {
      try {
        // A viewer on the live page without Twitch linked answers as their account.
        if (g.platform === "site") {
          await svc.from("brain_answers").insert({ prompt_id: window.promptId, raw: g.raw, normalized: g.normalized, source: "site:live", user_id: g.viewer, window_id: windowId });
          return;
        }
        const { identityId } = await resolveIdentity({ platform: g.platform === "youtube" ? "youtube" : "twitch", platformId: g.viewer, displayName: g.name });
        await svc.from("brain_answers").insert({ prompt_id: window.promptId, raw: g.raw, normalized: g.normalized, source: g.platform === "youtube" ? "youtube" : "twitch", identity_id: identityId, window_id: windowId });
      } catch (err) {
        console.warn("[chatbrain/stream] answer not saved:", err);
      }
    });
  }

  // The round's groups (spelling, the AI pass, the host's merges and hides) and,
  // for the channel's own question, the board (survey.ts).
  let top: { label: string; count: number }[];
  let record: Record<string, unknown>;
  let style: SurveyStyle | undefined;
  let board: CloseSummary["board"] = null;
  if (window.kind === "survey") {
    const { data: owner } = await svc.from("gs_communities").select("owner_user_id").eq("id", window.communityId).maybeSingle();
    const { finishSurvey } = await import("./survey");
    const done = await finishSurvey(window, guesses, (owner as { owner_user_id: string | null } | null)?.owner_user_id ?? null)
      .catch((err) => { console.error("[chatbrain/stream] survey finish failed:", err); return null; });
    const { shownGroups } = await import("./surveyRules");
    top = done ? shownGroups(done.groups, guesses.length, 3).map((g) => ({ label: g.label, count: g.count })) : [];
    record = { ...(done?.record ?? {}), top };
    style = (done?.record.style ?? "live") as SurveyStyle;
    board = done?.record.result ? { made: done.record.result.made, reason: done.record.result.reason, size: done.record.result.size } : null;
  } else {
    const { groups } = autoGroup(guesses.map((g, i) => ({ id: String(i), raw: g.raw, normalized: g.normalized })));
    top = groups.filter((g) => g.count >= 2).slice(0, 3).map((g) => ({ label: g.label, count: g.count }));
    record = { top };
  }
  await svc.from("brain_stream_windows").update({
    status: "closed", closed_at: new Date().toISOString(), guesses: guesses.length,
    result: guesses.length ? null : "empty", answer: record,
  }).eq("id", windowId);

  const summary: CloseSummary = { windowId, broadcasterId: window.broadcasterId, guesses: guesses.length, own, question, top, style, board };
  if (opts.announce !== false) await announceClose(summary);
  return summary;
}

export function closeLine(s: CloseSummary): string {
  const n = `${s.guesses} answer${s.guesses === 1 ? "" : "s"}`;
  if (!s.guesses) return "🧠 Survey closed with no answers. Next time, answer with !a <your answer>.";
  if (s.own) {
    const made = s.board?.made ? ` Your board is ready (${s.board.size} answers): mods, !cb start survey to play it.` : "";
    const short = s.board && !s.board.made && s.board.reason === "few_answers" ? " Not enough answers for a board this time (it takes 10)." : "";
    if (s.style === "hidden") return `🧠 Survey closed: ${n}. The answers stay secret for now.${made || short}`.slice(0, 480);
    const top = s.top.map((t, i) => `${i + 1}. ${t.label} (${t.count})`).join("  ");
    return (top ? `🧠 Survey closed: ${n}. Chat's top answers: ${top}.${made || short}` : `🧠 Survey closed: ${n}, and no two of you agreed on anything!${short}`).slice(0, 480);
  }
  return `🧠 Survey closed: ${n}. Thanks chat! Once enough people answer, it becomes a Chat Brain board on GameShuffle.`;
}

async function announceClose(s: CloseSummary): Promise<void> {
  const botId = process.env.TWITCH_BOT_USER_ID;
  if (!botId) return;
  await sendChatMessage({ broadcasterId: s.broadcasterId, senderId: botId, message: closeLine(s) }).catch((err) => console.error("[chatbrain/stream] close line failed:", err));
}

/** Close this channel's window if its time is up. */
export async function tickChannel(broadcasterId: string): Promise<CloseSummary | null> {
  const window = await openWindowFor(broadcasterId, { fresh: true });
  if (!window || Date.parse(window.closesAt) > Date.now()) return null;
  return closeWindow(window.id);
}

/** Backstop for the every-minute polls sweep: close every window past its time. */
export async function sweepStreamWindows(): Promise<number> {
  const { data, error } = await createServiceClient().from("brain_stream_windows").select("id")
    .eq("status", "open").lte("closes_at", new Date().toISOString()).limit(200);
  if (error) return 0;
  let closed = 0;
  for (const r of (data ?? []) as { id: string }[]) if (await closeWindow(r.id)) closed += 1;
  return closed;
}

/** What `!cb` says right now: the open window, or how to play. */
export async function statusLine(broadcasterId: string): Promise<string> {
  const window = await openWindowFor(broadcasterId, { fresh: true });
  if (window?.gameId) {
    const { gameStatusLine } = await import("./streamGame");
    return gameStatusLine(window.gameId);
  }
  if (window?.kind === "survey" && window.promptId) {
    const svc = createServiceClient();
    const [{ data: p }, { count }] = await Promise.all([
      svc.from("brain_prompts").select("text").eq("id", window.promptId).maybeSingle(),
      svc.from("brain_stream_guesses").select("viewer", { count: "exact", head: true }).eq("window_id", window.id),
    ]);
    const left = Math.max(0, Math.round((Date.parse(window.closesAt) - Date.now()) / 1000));
    return `🧠 Survey: ${(p as { text: string } | null)?.text ?? "a question"}  ·  answer with !a <your answer>  ·  ${count ?? 0} in, ${left}s left`;
  }
  return "🧠 Chat Brain: guess what most people said. When a question is open, answer with !a <your answer>. Mods start a survey with !cb ask.";
}

// ─── chat grammar (shared by the webhook fast lane and the commands) ─────────

/** `!cb` words that are commands, never answers. */
export const CB_SUBCOMMANDS = new Set(["ask", "lock", "end", "help", "start", "time", "next", "accept", "reject", "hide", "merge", "play", "trust", "control", "undo"]);

/**
 * Is this chat line an answer? `!a <text>`, `!answer <text>`, or `!cb <text>`
 * when the first word isn't a subcommand. Returns the answer text, or null.
 */
export function answerFromChat(text: string): string | null {
  const m = text.trim().match(/^!(a|answer|cb)\s+(.+)$/i);
  if (!m) return null;
  const body = m[2].trim();
  if (m[1].toLowerCase() === "cb" && CB_SUBCOMMANDS.has(body.split(/\s+/)[0].toLowerCase())) return null;
  return body || null;
}
