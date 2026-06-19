/**
 * First-touch welcome message for new token-economy viewers.
 *
 * Every entry into `resolveIdentity` lazy-creates the row + fires
 * `gs_grant_starting_tokens` server-side. The `isNew: true` flag the
 * resolver returns is our chance to TELL the viewer it happened —
 * without this, brand-new viewers get tokens silently and have no
 * idea they can place bets, fire chaos events, or check their
 * balance.
 *
 * The helper posts a single chat message tagged at the viewer with:
 *   - the grant amount they just received
 *   - one-line of "what to do with these"
 *   - a pointer to `/live/{slug}` for the full picture
 *
 * Always best-effort — a chat-send failure logs but never rolls back
 * the identity creation. The caller wraps it in a `try` so a Twitch
 * outage doesn't kill an active bet flow.
 */

import "server-only";
import { sendChatMessage } from "@/lib/twitch/client";
import { getLiveUrlForUser } from "@/lib/twitch/streamerSlug";

interface PostArgs {
  broadcasterTwitchId: string;
  botTwitchId: string;
  senderDisplayName: string;
  /** Balance returned by `resolveIdentity` — the grant amount lives
   *  here on first contact since the resolver fires the grant
   *  before returning. Falls back to a generic line when the balance
   *  isn't passed (defensive). */
  grantBalance: number | null;
  /** Streamer's user_id — used to look up their /live URL for the
   *  trailing pointer. Null skips the URL suffix. */
  streamerUserId: string | null;
}

export async function postFirstTouchWelcome(args: PostArgs): Promise<void> {
  try {
    const liveUrl = args.streamerUserId
      ? await getLiveUrlForUser(args.streamerUserId).catch(() => null)
      : null;
    const grantSegment =
      args.grantBalance && args.grantBalance > 0
        ? `You just got ${formatTokens(args.grantBalance)}🪙 to play with`
        : `Welcome to the token economy`;
    const liveSuffix = liveUrl
      ? ` Open https://${liveUrl} to bet on markets, see the leaderboard, and check your balance.`
      : ` Type "!tokens" to check your balance or "!bet <option> <amount>" to bet on an open prediction market.`;
    const message =
      `🎉 Welcome @${args.senderDisplayName}! ${grantSegment}.` + liveSuffix;
    await sendChatMessage({
      broadcasterId: args.broadcasterTwitchId,
      senderId: args.botTwitchId,
      message,
    });
  } catch (err) {
    console.error("[economy/welcome] post failed", {
      senderDisplayName: args.senderDisplayName,
      err,
    });
  }
}

function formatTokens(n: number): string {
  return n.toLocaleString("en-US");
}
