import "server-only";

/**
 * Trivia Nights on stream (phase 2 of the plan): the host plays a night on
 * their stream, and viewers answer in Twitch chat (`!a <answer>`, or a bare
 * letter on a multiple-choice question) or on the /live page, into one
 * scoreboard. Answers stay hidden until the host reveals the question.
 *
 *   identity   each viewer is their own team. Its secret is a keyed hash of
 *              the game and the viewer (`v1.` + HMAC), so it's found again on
 *              every answer and can't be forged from a phone (phone teams get
 *              random secrets, which never start with "v1.")
 *   timing     the countdown is the round's; answers keep counting
 *              STREAM_GRACE_MS after it (viewers see the stream late)
 *   chat       the question goes to chat when it opens, the answer and the
 *              top three at the reveal, the winner at the end
 *
 * The game itself is a normal trivia night (store.ts): the host runs it from
 * the same console, and teams in the room can play alongside. The link to the
 * channel is `trivia_games.settings.stream`, set when the room opens.
 */

import { createHmac } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/admin";
import { sendChatMessage } from "@/lib/twitch/client";
import { isBlockedText } from "@/lib/text/filter";
import { resolveCommunityIdForOwner } from "@/lib/economy/communityResolver";
import {
  GAME_COLS,
  TEAM_COLS,
  getGame,
  isStreamGame,
  publicQ,
  questionOf,
  roundOf,
  submitViewerAnswer,
  tick,
  type GameRow,
  type PublicQuestion,
  type TeamRow,
} from "./store";
import { MAX_VIEWERS, STYLE_LABEL, VIEWER_SECRET_PREFIX, type Verdict } from "./rules";


const LETTERS = ["A", "B", "C", "D", "E", "F"];

export type ViewerPlatform = "twitch" | "youtube" | "site" | "discord";
export interface Viewer { platform: ViewerPlatform; id: string; name: string }

function hashKey(): string {
  return process.env.TRIVIA_STREAM_SECRET || `trivia-stream:${process.env.SUPABASE_SERVICE_ROLE_KEY ?? "dev"}`;
}

export function viewerSecret(gameId: string, v: { platform: string; id: string }): string {
  return VIEWER_SECRET_PREFIX + createHmac("sha256", hashKey()).update(`${gameId}:${v.platform}:${v.id}`).digest("base64url").slice(0, 32);
}

// ─── finding the game ────────────────────────────────────────────────────────

const ownerCache = new Map<string, { at: number; game: GameRow | null }>();

/** The host's trivia night that's on stream right now (cached 2s: the chat fast lane asks on every message). */
export async function liveStreamGame(ownerUserId: string, opts: { fresh?: boolean } = {}): Promise<GameRow | null> {
  const hit = ownerCache.get(ownerUserId);
  if (!opts.fresh && hit && Date.now() - hit.at < 2000) return hit.game;
  const { data, error } = await createServiceClient().from("trivia_games").select(GAME_COLS)
    .eq("host_user_id", ownerUserId).eq("status", "live").not("settings->stream", "is", null)
    .order("started_at", { ascending: false }).limit(1).maybeSingle();
  const game = error ? null : ((data as GameRow | null) ?? null);
  ownerCache.set(ownerUserId, { at: Date.now(), game });
  if (ownerCache.size > 500) ownerCache.delete(ownerCache.keys().next().value!);
  return game;
}

/** A night that finished on stream in the last two minutes (the overlay shows the winner). */
async function recentStreamGame(ownerUserId: string): Promise<GameRow | null> {
  const { data } = await createServiceClient().from("trivia_games").select(GAME_COLS)
    .eq("host_user_id", ownerUserId).eq("status", "done").not("settings->stream", "is", null)
    .gte("finished_at", new Date(Date.now() - 120_000).toISOString()).order("finished_at", { ascending: false }).limit(1).maybeSingle();
  return (data as GameRow | null) ?? null;
}

export async function ownerOfCommunity(communityId: string): Promise<string | null> {
  const { data } = await createServiceClient().from("gs_communities").select("owner_user_id").eq("id", communityId).maybeSingle();
  return (data as { owner_user_id: string | null } | null)?.owner_user_id ?? null;
}

/** Forget the cached night (the host just changed it). */
export function forgetStreamGame(ownerUserId: string): void {
  ownerCache.delete(ownerUserId);
}

// ─── viewers ─────────────────────────────────────────────────────────────────

const teamCache = new Map<string, TeamRow>();

/** The viewer's own team in this game: found by its hashed secret, made on their first answer. */
export async function viewerTeam(game: GameRow, v: Viewer): Promise<TeamRow | null> {
  const secret = viewerSecret(game.id, v);
  const key = `${game.id}:${secret}`;
  const hit = teamCache.get(key);
  if (hit) return hit;
  const svc = createServiceClient();
  const { data: found } = await svc.from("trivia_teams").select(TEAM_COLS).eq("game_id", game.id).eq("secret", secret).maybeSingle();
  let team = (found as TeamRow | null) ?? null;
  if (!team) {
    const { count } = await svc.from("trivia_teams").select("id", { count: "exact", head: true }).eq("game_id", game.id).like("secret", `${VIEWER_SECRET_PREFIX}%`);
    if ((count ?? 0) >= MAX_VIEWERS) return null;
    const tidy = v.name.trim().replace(/\s+/g, " ").slice(0, 34);
    const base = tidy.length >= 2 && !isBlockedText(tidy) ? tidy : `Viewer ${v.id.slice(-4)}`;
    // Names are unique per night (case-insensitive): a clash gets a number.
    for (let n = 1; n <= 6 && !team; n++) {
      const name = n === 1 ? base : `${base} ${n}`;
      const { data, error } = await svc.from("trivia_teams").insert({ game_id: game.id, name, secret }).select(TEAM_COLS).maybeSingle();
      if (data) team = data as TeamRow;
      else if (error?.code !== "23505") break;
      else {
        // Someone else's clash, or this viewer's own answer racing in twice.
        const { data: again } = await svc.from("trivia_teams").select(TEAM_COLS).eq("game_id", game.id).eq("secret", secret).maybeSingle();
        if (again) team = again as TeamRow;
      }
    }
  }
  if (team) {
    teamCache.set(key, team);
    if (teamCache.size > 5000) teamCache.delete(teamCache.keys().next().value!);
  }
  return team;
}

/** What a chat line answers, if anything: `!a <answer>` / `!answer <answer>`, or a bare letter on a choice question. */
export function chatAnswerText(text: string, kind: string, optionCount: number): string | null {
  const t = text.trim();
  const m = t.match(/^!(a|answer)\s+(.+)$/i);
  if (m) return m[2].trim() || null;
  if (kind === "choice" && /^[a-f]$/i.test(t) && LETTERS.indexOf(t.toUpperCase()) < optionCount) return t.toUpperCase();
  return null;
}

/**
 * The webhook fast lane: a chat message that answers the open question is
 * stored silently and the dispatcher never sees it. Returns whether it was
 * taken (false when no question is open, so `!a` can still reach Chat Brain).
 */
export async function answerFromChat(input: { ownerUserId: string; platform: ViewerPlatform; viewer: string; name: string | null; text: string }): Promise<boolean> {
  if (!input.text.startsWith("!") && input.text.trim().length > 1) return false;
  let cached = await liveStreamGame(input.ownerUserId);
  // The cache can be up to 2s behind the host opening a question: an explicit `!a` checks again.
  if ((!cached || cached.phase !== "question") && /^!(a|answer)\s/i.test(input.text.trim())) cached = await liveStreamGame(input.ownerUserId, { fresh: true });
  if (!cached || cached.phase !== "question") return false;
  const q = questionOf(cached);
  if (!q) return false;
  const raw = chatAnswerText(input.text, q.kind, q.options?.length ?? 0);
  if (!raw) return false;
  const team = await viewerTeam(cached, { platform: input.platform, id: input.viewer, name: input.name ?? "Viewer" });
  if (!team) return true;
  // The save re-reads the phase; a question that just closed lets `!a` fall through.
  const r = await submitViewerAnswer(cached, team, raw);
  if (!r.ok && r.error === "closed") { ownerCache.delete(input.ownerUserId); return false; }
  return true;
}

/** A signed-in viewer answering on the live page. */
export async function answerFromWeb(game: GameRow, v: Viewer, raw: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const team = await viewerTeam(game, v);
  if (!team) return { ok: false, error: "full" };
  return submitViewerAnswer(game, team, raw);
}

// ─── the stream view (overlay and /live) ─────────────────────────────────────

export interface TriviaStreamView {
  id: string;
  title: string;
  status: "live" | "done";
  phase: GameRow["phase"];
  round: { index: number; count: number; title: string; style: string; questionCount: number } | null;
  questionIndex: number;
  question: PublicQuestion | null;
  closesAt: string | null;
  /** Revealed answer (reveal phase only). */
  answer: string | null;
  answered: number;
  gotIt: number | null;
  /** The top of the standings (viewers and room teams together). */
  standings: { name: string; score: number }[];
  /** The viewer reading it (live page), when signed in. */
  you: { name: string; score: number; rank: number | null; answer: string | null; verdict: Verdict | null } | null;
}

export async function streamView(gameIn: GameRow, viewer?: Viewer | null): Promise<TriviaStreamView> {
  const game = gameIn.status === "live" ? await tick(gameIn) : gameIn;
  const svc = createServiceClient();
  const round = roundOf(game);
  const q = questionOf(game);
  const showQ = game.status === "live" && (game.phase === "question" || game.phase === "locked" || game.phase === "reveal");
  const revealed = game.phase === "reveal";
  const [{ count: answered }, { data: top }, gotRes] = await Promise.all([
    round ? svc.from("trivia_answers").select("team_id", { count: "exact", head: true }).eq("game_id", game.id).eq("round", game.round_index).eq("question", game.question_index) : Promise.resolve({ count: 0 }),
    svc.from("trivia_teams").select("name, score").eq("game_id", game.id).gt("score", 0).order("score", { ascending: false }).order("created_at").limit(10),
    revealed ? svc.from("trivia_answers").select("team_id", { count: "exact", head: true }).eq("game_id", game.id).eq("round", game.round_index).eq("question", game.question_index).in("verdict", ["correct", "partial"]) : Promise.resolve({ count: null }),
  ]);

  let you: TriviaStreamView["you"] = null;
  if (viewer) {
    const secret = viewerSecret(game.id, viewer);
    const { data: team } = await svc.from("trivia_teams").select("id, name, score").eq("game_id", game.id).eq("secret", secret).maybeSingle();
    if (team) {
      const t = team as { id: string; name: string; score: number };
      const [{ count: ahead }, { data: mine }] = await Promise.all([
        svc.from("trivia_teams").select("id", { count: "exact", head: true }).eq("game_id", game.id).gt("score", t.score),
        svc.from("trivia_answers").select("raw, verdict").eq("team_id", t.id).eq("round", game.round_index).eq("question", game.question_index).maybeSingle(),
      ]);
      const a = mine as { raw: string; verdict: Verdict } | null;
      you = { name: t.name, score: t.score, rank: t.score > 0 ? (ahead ?? 0) + 1 : null, answer: a?.raw ?? null, verdict: revealed ? a?.verdict ?? null : null };
    } else {
      you = { name: viewer.name, score: 0, rank: null, answer: null, verdict: null };
    }
  }

  return {
    id: game.id,
    title: game.title,
    status: game.status === "done" ? "done" : "live",
    phase: game.phase,
    round: round ? { index: game.round_index, count: game.rounds.length, title: round.title, style: STYLE_LABEL[round.style], questionCount: round.questions.length } : null,
    questionIndex: game.question_index,
    question: showQ && q ? publicQ(q, game) : null,
    closesAt: game.phase === "question" ? game.closes_at : null,
    answer: revealed && q ? q.answer : null,
    answered: answered ?? 0,
    gotIt: revealed ? (gotRes as { count: number | null }).count ?? 0 : null,
    standings: ((top ?? []) as { name: string; score: number }[]),
    you,
  };
}

/** The overlay's trivia for a streamer: the night on stream, or one that just finished. */
export async function overlayTrivia(ownerUserId: string): Promise<TriviaStreamView | null> {
  const game = (await liveStreamGame(ownerUserId, { fresh: true })) ?? (await recentStreamGame(ownerUserId));
  return game ? streamView(game) : null;
}

// ─── chat lines ──────────────────────────────────────────────────────────────

async function say(game: GameRow, message: string): Promise<void> {
  const botId = process.env.TWITCH_BOT_USER_ID;
  const broadcasterId = game.settings?.stream?.broadcasterId;
  if (!botId || !broadcasterId) return;
  await sendChatMessage({ broadcasterId, senderId: botId, message: message.slice(0, 480) }).catch((err) => console.error("[trivia/stream] chat line failed:", err));
}

/** Tell chat what just happened, after the host moves the night along. */
export async function announce(gameId: string, event: "open" | "reveal" | "end"): Promise<void> {
  const game = await getGame(gameId);
  if (!game || !isStreamGame(game)) return;
  ownerCache.delete(game.host_user_id);
  const round = roundOf(game);
  const q = questionOf(game);
  // Discord: servers that route the `trivia` category get the question, its reveal and the winner.
  const discord = await import("./discord");
  if (event === "open" && q && round) {
    await discord.postQuestion(game).catch((err) => console.error("[trivia/stream] discord post failed:", err));
    const n = `Q${game.question_index + 1} of ${round.questions.length}`;
    const options = q.kind === "choice" && q.options?.length ? `  ${q.options.map((o, i) => `${LETTERS[i]}) ${o}`).join("  ")}` : "";
    const picture = q.kind === "picture" || q.imageUrl ? " (look at the picture on stream)" : "";
    const how = q.kind === "choice" ? "answer with a letter or !a <answer>" : "answer with !a <answer>";
    await say(game, `❓ ${round.title}, ${n}: ${q.prompt}${picture}${options}  ▸  ${how}. ${round.seconds}s!`);
    return;
  }
  if (event === "reveal" && q) {
    const v = await streamView(game);
    await discord.revealQuestion(game, { gotIt: v.gotIt ?? 0, answered: v.answered }).catch((err) => console.error("[trivia/stream] discord reveal failed:", err));
    const top = v.standings.slice(0, 3).map((s) => `${s.name} ${s.score}`).join(" · ");
    await say(game, `✅ The answer: ${q.answer}. ${v.gotIt ?? 0} of ${v.answered} got it.${top ? ` Leading: ${top}` : ""}`);
    return;
  }
  if (event === "end") {
    const v = await streamView(game);
    await discord.postFinal(game, v.standings);
    const [first, ...rest] = v.standings;
    await say(game, first
      ? `🏆 Trivia's over! ${first.name} wins with ${first.score} point${first.score === 1 ? "" : "s"}.${rest.length ? ` Then ${rest.slice(0, 4).map((s) => `${s.name} ${s.score}`).join(" · ")}.` : ""} Thanks for playing!`
      : "🏆 Trivia's over! Thanks for playing!");
  }
}

/** Plays this night on the host's stream: the channel it's linked to. */
export async function streamSettingsFor(ownerUserId: string): Promise<{ communityId: string; broadcasterId: string | null } | null> {
  const [communityId, { data: t }] = await Promise.all([
    resolveCommunityIdForOwner(ownerUserId),
    createServiceClient().from("twitch_connections").select("twitch_user_id").eq("user_id", ownerUserId).maybeSingle(),
  ]);
  if (!communityId) return null;
  return { communityId, broadcasterId: (t as { twitch_user_id: string | null } | null)?.twitch_user_id ?? null };
}
