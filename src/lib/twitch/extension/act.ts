import "server-only";

/**
 * A viewer's play from the Twitch extension, through the same game code chat
 * and /live use. The viewer has shared their Twitch id (anonymous viewers can
 * watch, not play), so every play is the `twitch` player chat already knows:
 * the same tokens and scores. Everything is checked against the channel the
 * token came from, so a card on one stream can't play another's game.
 */

import { castVote, getPoll, tally } from "@/lib/polls/store";
import { announceToCommunity, claimBingo, getCurrentGame, takeCard, viewOf as bingoViewOf, winnerMessage, type BingoHolder } from "@/lib/bingo/stream";
import { answerFromWeb as triviaAnswer, liveStreamGame } from "@/lib/trivia/stream";
import { answerFromWeb as breakAnswer, getShowable } from "@/lib/break/store";
import { brainLiveAnswer } from "@/lib/chatbrain/live";
import { getCurrentDraft, pickPlayer, teamOnClock, viewOf as draftViewOf } from "@/lib/drafts/store";
import { isCaptainOnClock } from "@/lib/drafts/captains";
import { saveBallot } from "@/lib/picks-bans/ballot";
import { getActiveSessionForOwner } from "@/lib/sessions/service";
import { createServiceClient } from "@/lib/supabase/admin";
import type { ExtChannel } from "./context";
import { extIdentityId, type ExtViewer } from "./viewer";

export type ExtAction =
  | { kind: "vote"; pollId: string; optionId: string }
  | { kind: "bingo_card" }
  | { kind: "bingo_claim" }
  | { kind: "trivia"; text: string }
  | { kind: "break"; text: string }
  | { kind: "brain"; text: string }
  | { kind: "captain_pick"; key: string }
  | { kind: "ballot"; roundId: string; picks: string[]; bans: string[]; lock?: boolean };

/**
 * `data` carries what the site's own route answers with (the poll's tally, the
 * new bingo card, the won game, the draft after a pick), so the live cards the
 * extension shares with /live read it the same way.
 */
export type ExtActResult = { ok: true; message?: string; data?: Record<string, unknown> } | { ok: false; error: string };

const text = (raw: unknown, max: number) => (typeof raw === "string" ? raw.slice(0, max).trim() : "");
const ids = (raw: unknown) => (Array.isArray(raw) ? [...new Set(raw.filter((x): x is string => typeof x === "string" && x.length > 0 && x.length <= 100))].slice(0, 200) : []);

/** Reads an action from a request body, or null when it isn't one. */
export function parseAction(body: unknown): ExtAction | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  switch (b.kind) {
    case "vote":
      return typeof b.pollId === "string" && typeof b.optionId === "string" ? { kind: "vote", pollId: b.pollId, optionId: b.optionId.slice(0, 10) } : null;
    case "bingo_card":
    case "bingo_claim":
      return { kind: b.kind };
    case "trivia":
    case "break":
    case "brain": {
      const t = text(b.text, b.kind === "trivia" ? 120 : 60);
      return t ? { kind: b.kind, text: t } : null;
    }
    case "captain_pick":
      return typeof b.key === "string" && b.key ? { kind: "captain_pick", key: b.key.slice(0, 100) } : null;
    case "ballot":
      return typeof b.roundId === "string" ? { kind: "ballot", roundId: b.roundId, picks: ids(b.picks), bans: ids(b.bans), lock: b.lock === true } : null;
    default:
      return null;
  }
}

export async function extAct(ch: ExtChannel, v: ExtViewer, a: ExtAction): Promise<ExtActResult> {
  if (!ch.communityId || !ch.ownerUserId) return { ok: false, error: "not_connected" };
  const communityId = ch.communityId, owner = ch.ownerUserId;
  switch (a.kind) {
    case "vote": {
      const poll = await getPoll(a.pollId);
      if (!poll || poll.communityId !== communityId) return { ok: false, error: "not_found" };
      const r = await castVote({ pollId: poll.id, optionId: a.optionId, gsIdentityId: await extIdentityId(v) });
      return r.ok ? { ok: true, data: { tally: await tally(poll.id) } } : { ok: false, error: r.reason };
    }
    case "bingo_card":
    case "bingo_claim": {
      const game = await getCurrentGame(communityId);
      if (!game) return { ok: false, error: "not_open" };
      // A viewer with a GameShuffle account keeps one card across /live and here.
      const holder: BingoHolder = v.accountUserId ? { userId: v.accountUserId } : { identityId: await extIdentityId(v) };
      if (a.kind === "bingo_card") {
        const r = await takeCard(game, holder);
        return r.ok ? { ok: true, data: { card: r.value } } : { ok: false, error: r.error };
      }
      const r = await claimBingo(game, holder, v.name);
      if (!r.ok) return { ok: false, error: r.error };
      await announceToCommunity(r.game.communityId, winnerMessage(r.game, r.tokens, r.tokenError));
      return { ok: true, message: r.tokens ? `Bingo! ${r.tokens} tokens` : "Bingo!", data: { game: await bingoViewOf(r.game), tokens: r.tokens } };
    }
    case "trivia": {
      const game = await liveStreamGame(owner, { fresh: true });
      if (!game) return { ok: false, error: "not_found" };
      const r = await triviaAnswer(game, { platform: "twitch", id: v.viewer, name: v.name }, a.text);
      return r.ok ? { ok: true } : { ok: false, error: r.error };
    }
    case "break": {
      const run = await getShowable(communityId);
      if (!run) return { ok: false, error: "closed" };
      const r = await breakAnswer(run, { platform: "twitch", viewer: v.viewer, name: v.name, text: a.text });
      return r.ok ? { ok: true } : { ok: false, error: r.error };
    }
    case "brain": {
      const r = await brainLiveAnswer(communityId, { platform: "twitch", viewer: v.viewer, name: v.name }, a.text);
      return r === "saved" ? { ok: true } : { ok: false, error: r };
    }
    case "captain_pick": {
      const draft = await getCurrentDraft(communityId);
      if (!draft || draft.mode !== "captains" || draft.status !== "open") return { ok: false, error: "not_open" };
      if (!isCaptainOnClock(teamOnClock(draft), { userId: v.accountUserId, twitchId: v.viewer })) return { ok: false, error: "not_your_turn" };
      const r = await pickPlayer(draft, a.key, "captain");
      return r.ok ? { ok: true, data: { draft: await draftViewOf(r.value) } } : { ok: false, error: r.error };
    }
    case "ballot": {
      // The round must be open on this streamer's stream.
      const session = await getActiveSessionForOwner(owner);
      if (!session) return { ok: false, error: "round_not_open" };
      const { data } = await createServiceClient().from("session_picks_bans_rounds").select("id").eq("id", a.roundId).eq("session_id", session.id).maybeSingle();
      if (!data) return { ok: false, error: "round_not_found" };
      const r = await saveBallot({
        roundId: a.roundId, viewerTwitchUserId: v.viewer, anonSessionId: null, displayName: v.name,
        fields: { picks_tracks: a.picks, bans_tracks: a.bans.filter((id) => !a.picks.includes(id)) }, lock: !!a.lock,
      });
      return r.ok ? { ok: true, message: r.alreadyLocked ? "Your picks are locked in." : undefined } : { ok: false, error: r.error };
    }
  }
}
