import "server-only";

/**
 * Chat Brain on stream: the window engine (specs/gs-originals-chat-brain-stream.md).
 *
 * A window is a timed period when chat answers with `!a`. Guesses land in
 * brain_stream_guesses, one per viewer per window (a later `!a` replaces it).
 * This first slice runs standalone **survey windows** (`!cb ask`): chat answers
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

export const SURVEY_SECONDS = { min: 30, max: 180, default: 60 } as const;
const OWN_QUESTION_CATEGORY = "streaming";

export type Platform = "twitch" | "youtube" | "site";

export interface StreamWindow {
  id: string;
  gameId: string | null;
  communityId: string;
  broadcasterId: string;
  kind: string;
  promptId: string | null;
  seconds: number;
  opensAt: string;
  closesAt: string;
  status: "open" | "closing" | "closed";
}

type WindowRow = {
  id: string; game_id: string | null; community_id: string; broadcaster_id: string; kind: string;
  prompt_id: string | null; seconds: number; opens_at: string; closes_at: string; status: StreamWindow["status"];
};
const WINDOW_COLS = "id, game_id, community_id, broadcaster_id, kind, prompt_id, seconds, opens_at, closes_at, status";

function toWindow(r: WindowRow): StreamWindow {
  return {
    id: r.id, gameId: r.game_id, communityId: r.community_id, broadcasterId: r.broadcaster_id, kind: r.kind,
    promptId: r.prompt_id, seconds: r.seconds, opensAt: r.opens_at, closesAt: r.closes_at, status: r.status,
  };
}

function notReady(error: { code?: string } | null): boolean {
  return error?.code === "42P01" || error?.code === "PGRST205" || error?.code === "42703";
}

// ─── the open-window cache (the webhook fast lane reads this per chat line) ──

const CACHE_MS = 3000;
const cache = new Map<string, { at: number; window: StreamWindow | null }>();

export function forgetChannel(broadcasterId: string): void {
  cache.delete(broadcasterId);
}

/** The channel's open window, cached for 3s per serverless instance. */
export async function openWindowFor(broadcasterId: string, opts: { fresh?: boolean } = {}): Promise<StreamWindow | null> {
  const hit = cache.get(broadcasterId);
  if (!opts.fresh && hit && Date.now() - hit.at < CACHE_MS) return hit.window;
  const { data, error } = await createServiceClient().from("brain_stream_windows").select(WINDOW_COLS)
    .eq("broadcaster_id", broadcasterId).eq("status", "open").maybeSingle();
  if (notReady(error)) { cache.set(broadcasterId, { at: Date.now(), window: null }); return null; }
  const window = data ? toWindow(data as WindowRow) : null;
  cache.set(broadcasterId, { at: Date.now(), window });
  return window;
}

// ─── opening a survey ────────────────────────────────────────────────────────

export type OpenSurveyResult =
  | { ok: true; window: StreamWindow; prompt: { id: string; text: string; own: boolean } }
  | { ok: false; error: "window_open" | "no_questions" | "not_pro" | "bad_question" | "blocked" | "not_ready" | "failed" };

/**
 * `!cb ask [seconds] [category | own question]`. A category (slug or name) or
 * nothing picks the public question that most needs answers; anything else is
 * the streamer's own question, which needs GS Pro.
 */
export async function openSurvey(input: {
  communityId: string; broadcasterId: string; ownerUserId: string; arg: string; isPro: boolean;
}): Promise<OpenSurveyResult> {
  const svc = createServiceClient();
  let rest = input.arg.trim().replace(/\s+/g, " ");
  let seconds: number = SURVEY_SECONDS.default;
  const lead = rest.match(/^(\d{2,3})s?(?:\s+|$)/);
  if (lead) {
    seconds = Math.min(SURVEY_SECONDS.max, Math.max(SURVEY_SECONDS.min, Number(lead[1])));
    rest = rest.slice(lead[0].length).trim();
  }

  const { data: cats, error: catErr } = await svc.from("brain_categories").select("slug, name");
  if (notReady(catErr)) return { ok: false, error: "not_ready" };
  const key = rest.toLowerCase();
  const cat = ((cats ?? []) as { slug: string; name: string }[]).find((c) => c.slug === key || c.name.toLowerCase() === key);

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

  const now = Date.now();
  const { data: row, error } = await svc.from("brain_stream_windows").insert({
    community_id: input.communityId, broadcaster_id: input.broadcasterId, kind: "survey", prompt_id: prompt.id,
    seconds, opens_at: new Date(now).toISOString(), closes_at: new Date(now + seconds * 1000).toISOString(),
  }).select(WINDOW_COLS).single();
  if (notReady(error)) return { ok: false, error: "not_ready" };
  if (error?.code === "23505") return { ok: false, error: "window_open" };
  if (error || !row) return { ok: false, error: "failed" };
  const window = toWindow(row as WindowRow);
  cache.set(input.broadcasterId, { at: Date.now(), window });
  return { ok: true, window, prompt };
}

// ─── guesses ─────────────────────────────────────────────────────────────────

export type GuessResult = "saved" | "no_window" | "closed" | "rejected";

/**
 * A viewer's `!a`. Silent by design: no chat reply per guess. If the window's
 * time is up, this closes it instead (and the close posts to chat).
 */
export async function recordGuess(input: { broadcasterId: string; platform: Platform; viewer: string; name?: string | null; raw: string }): Promise<GuessResult> {
  const window = await openWindowFor(input.broadcasterId);
  if (!window) return "no_window";
  if (Date.parse(window.closesAt) <= Date.now()) {
    await closeWindow(window.id);
    return "closed";
  }
  const raw = input.raw.trim().replace(/\s+/g, " ").slice(0, MAX_ANSWER_LENGTH);
  const normalized = normalize(raw);
  if (!raw || !normalized || isBlockedText(raw)) return "rejected";
  const { error } = await createServiceClient().from("brain_stream_guesses").upsert({
    window_id: window.id, platform: input.platform, viewer: input.viewer, name: input.name?.slice(0, 40) ?? null,
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
}

type GuessRow = { platform: Platform; viewer: string; name: string | null; raw: string; normalized: string };

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
  const { data: claimed } = await svc.from("brain_stream_windows").update({ status: "closing" })
    .eq("id", windowId).eq("status", "open").select(WINDOW_COLS).maybeSingle();
  if (!claimed) return null;
  const window = toWindow(claimed as WindowRow);
  forgetChannel(window.broadcasterId);

  const { data: gs } = await svc.from("brain_stream_guesses").select("platform, viewer, name, raw, normalized").eq("window_id", windowId).limit(20_000);
  const guesses = (gs ?? []) as GuessRow[];
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
        const { identityId } = await resolveIdentity({ platform: g.platform === "youtube" ? "youtube" : "twitch", platformId: g.viewer, displayName: g.name });
        await svc.from("brain_answers").insert({ prompt_id: window.promptId, raw: g.raw, normalized: g.normalized, source: g.platform === "youtube" ? "youtube" : "twitch", identity_id: identityId, window_id: windowId });
      } catch (err) {
        console.warn("[chatbrain/stream] answer not saved:", err);
      }
    });
  }

  // Chat's top answers: groups of 2 or more viewers, biggest first.
  const { groups } = autoGroup(guesses.map((g, i) => ({ id: String(i), raw: g.raw, normalized: g.normalized })));
  const top = groups.filter((g) => g.count >= 2).slice(0, 3).map((g) => ({ label: g.label, count: g.count }));
  await svc.from("brain_stream_windows").update({
    status: "closed", closed_at: new Date().toISOString(), guesses: guesses.length,
    result: guesses.length ? null : "empty", answer: { top },
  }).eq("id", windowId);

  const summary: CloseSummary = { windowId, broadcasterId: window.broadcasterId, guesses: guesses.length, own, question, top };
  if (opts.announce !== false) await announceClose(summary);
  return summary;
}

export function closeLine(s: CloseSummary): string {
  const n = `${s.guesses} answer${s.guesses === 1 ? "" : "s"}`;
  if (!s.guesses) return "🧠 Survey closed with no answers. Next time, answer with !a <your answer>.";
  if (s.own) {
    const top = s.top.map((t, i) => `${i + 1}. ${t.label} (${t.count})`).join("  ");
    return top ? `🧠 Survey closed: ${n}. Chat's top answers: ${top}` : `🧠 Survey closed: ${n}, and no two of you agreed on anything!`;
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
export const CB_SUBCOMMANDS = new Set(["ask", "lock", "end", "help", "start", "time", "next", "accept", "reject", "hide", "merge"]);

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
