/**
 * Twitch chat handlers for the token economy commands (M1 subset).
 *
 *   !tokens / !tokens @user            — balance lookup
 *   !give @user <amount>               — transfer (int/%/all)
 *   !leaderboard                       — top N for this community
 *   !bet <option> <amount>             — wager on the active market
 *   !gs market open [1|3|5]            — host opens a market
 *   !gs market lock                    — host early-locks the market
 *   !gs market close                   — host cancels + refunds
 *   !gs resolve <value>                — host resolves locked market
 *
 * Per Spec 01 §4 + Spec 02 §9. Each command resolves the caller's
 * identity lazily (Tier 0 row + starting grant fire on first chat
 * contact) and the broadcaster's community on first economy-relevant
 * interaction.
 *
 * Wired into `dispatch.ts` from the existing switch — the
 * `CommandDef` refactor is M2's problem, not M1's.
 */

import "server-only";
import { TwitchAdapter } from "@/lib/adapters/twitch";
import { createTwitchAdminClient } from "@/lib/twitch/admin";
import { findTwitchSessionForUser } from "@/lib/sessions/twitch-platform";
import { getValidUserAccessToken } from "@/lib/twitch/userToken";
import { getUserByLogin } from "@/lib/twitch/client";
import { ensureCommunity, getCommunityById } from "@/lib/economy/community";
import {
  resolveIdentity,
  getIdentityById,
  type Identity,
} from "@/lib/economy/identity";
import {
  getBalance,
  parseAmount,
  transfer,
} from "@/lib/economy/tokens";
import {
  getLeaderboard,
  type LeaderboardRow,
} from "@/lib/economy/leaderboards";
import {
  cancelMarket,
  findActiveMarket,
  lockMarket,
  openMarket,
  placeBet,
  resolveMarket,
  listOutcomes,
} from "@/lib/economy/markets/lifecycle";
import { placeSpectatorPick } from "@/lib/economy/markets/spectator";
import { ensureActiveStream } from "@/lib/economy/streams";
import { awardMint } from "@/lib/economy/awards";
import {
  cancelBounty,
  findMostRecentOpenBounty,
  openBounty,
  settleBounty,
} from "@/lib/economy/bounties";
import type { ShuffleContext } from "./shuffle";

// ---------------------------------------------------------------------------
// Context resolution
// ---------------------------------------------------------------------------

export interface EconomyContext {
  /** The chatter's identity (created lazily on first hit). */
  caller: Identity;
  /** Broadcaster's identity — distinct from caller, used as
   *  community owner + as the host gate on market commands. */
  broadcasterIdentity: Identity;
  /** The streamer's community row (created on first hit). */
  community: { id: string; slug: string; display_name: string | null };
  /** The streamer's GS user id (from twitch_connections) — handy for
   *  session lookups that still key on the legacy auth user. */
  streamerUserId: string;
  streamerDisplayName: string;
  streamerSlug: string;
  /** The currently-active GS session, if any. */
  activeSessionId: string | null;
  /** The current game slug on that session, if any. */
  activeGameSlug: string | null;
  /** The current active stream (Twitch broadcast lifecycle). Always
   *  created if absent — the streamer's chat being live is enough
   *  evidence the broadcast is on. */
  activeStreamId: string;
}

/**
 * Bundle every economy-side lookup the command handlers need. Each
 * command calls this once; per-handler logic operates on the bundle.
 *
 * Side effects on this call:
 *   - resolves (or creates) the caller's gs_identities row + fires
 *     their starting grant
 *   - resolves the broadcaster's gs_identities row (creates if absent
 *     — the broadcaster's first event triggers community creation)
 *   - ensures gs_communities row for the streamer
 *   - ensures gs_streams row for the current broadcast (idempotent)
 */
export async function resolveEconomyContext(
  ctx: ShuffleContext,
): Promise<EconomyContext | null> {
  // Pull the streamer's profile so we have slug + display name for
  // the community row. Without these we can't render `/live/<slug>`.
  const admin = createTwitchAdminClient();
  const { data: profile } = await admin
    .from("users")
    .select("username, twitch_username, display_name")
    .eq("id", ctx.userId)
    .maybeSingle();
  const streamerSlug =
    (profile?.username as string | null) ??
    (profile?.twitch_username as string | null) ??
    null;
  const streamerDisplayName =
    (profile?.display_name as string | null) ??
    streamerSlug ??
    "Streamer";
  if (!streamerSlug) return null;

  // Lazy-create identities. Both calls also fire the starting grant
  // on first contact (idempotent — re-calls are cheap).
  const callerResolved = await resolveIdentity({
    platform: "twitch",
    platformId: ctx.senderTwitchId,
    displayName: ctx.senderDisplayName,
  });
  const broadcasterResolved = await resolveIdentity({
    platform: "twitch",
    platformId: ctx.broadcasterTwitchId,
    displayName: streamerDisplayName,
  });

  // First-touch welcome — fires once per identity (the `isNew` flag
  // is server-truth from `gs_resolve_identity`). The streamer
  // resolves their own identity here too but never gets a welcome
  // (broadcasters won't be brand-new to their own community by the
  // time anyone hits an economy command).
  if (callerResolved.isNew && !ctx.isBroadcaster) {
    const { postFirstTouchWelcome } = await import("@/lib/economy/welcome");
    void postFirstTouchWelcome({
      broadcasterTwitchId: ctx.broadcasterTwitchId,
      botTwitchId: ctx.botTwitchId,
      senderDisplayName: ctx.senderDisplayName,
      grantBalance: callerResolved.balance,
      streamerUserId: ctx.userId,
    });
  }

  // Hydrate identity rows for downstream consumers that need the
  // full row (community.owner_identity_id matching, etc.).
  const [caller, broadcasterIdentity] = await Promise.all([
    getIdentityById(callerResolved.identityId),
    getIdentityById(broadcasterResolved.identityId),
  ]);
  if (!caller || !broadcasterIdentity) return null;

  const community = await ensureCommunity({
    ownerIdentityId: broadcasterIdentity.id,
    slug: streamerSlug,
    displayName: streamerDisplayName,
  });

  // Ensure an active gs_streams row. The economy treats "chat is
  // firing economy commands" as evidence the broadcast is live, so
  // we don't gate this on the webhook. The stream.online webhook
  // will idempotently align state when it arrives.
  const stream = await ensureActiveStream({ communityId: community.id });

  // Resolve current session + active game for the chat actor.
  const session = await findTwitchSessionForUser(ctx.userId, ["active", "test"]);

  return {
    caller,
    broadcasterIdentity,
    community,
    streamerUserId: ctx.userId,
    streamerDisplayName,
    streamerSlug,
    activeSessionId: session?.id ?? null,
    activeGameSlug: session?.randomizer_slug ?? null,
    activeStreamId: stream.id,
  };
}

// ---------------------------------------------------------------------------
// !tokens / !tokens @user
// ---------------------------------------------------------------------------

export async function handleTokensCommand(
  ctx: ShuffleContext,
  args: string,
): Promise<void> {
  const econ = await resolveEconomyContext(ctx);
  if (!econ) return;

  const adapter = adapterForCtx(ctx, econ);
  const target = args.trim();

  if (!target) {
    // Self-balance.
    const bal = await getBalance(econ.caller.id);
    await adapter.postChatMessage(
      `🎲 @${econ.caller.display_name ?? ctx.senderDisplayName}, you have ${formatTokens(bal)}.`,
    );
    return;
  }

  // Target lookup: @login → twitch_user_id via Helix.
  const targetLogin = target.replace(/^@/, "").toLowerCase();
  const targetIdentity = await lookupIdentityByTwitchLogin(
    targetLogin,
    econ.streamerUserId,
  );
  if (!targetIdentity) {
    await adapter.postChatMessage(
      `🎲 Couldn't find @${targetLogin} on Twitch.`,
    );
    return;
  }
  const bal = await getBalance(targetIdentity.id);
  await adapter.postChatMessage(
    `🎲 @${targetIdentity.display_name ?? targetLogin} has ${formatTokens(bal)}.`,
  );
}

// ---------------------------------------------------------------------------
// !give @user <amount>
// ---------------------------------------------------------------------------

export async function handleGiveCommand(
  ctx: ShuffleContext,
  args: string,
): Promise<void> {
  const econ = await resolveEconomyContext(ctx);
  if (!econ) return;
  const adapter = adapterForCtx(ctx, econ);

  // Usage: !give @user <amount> — supports int / N% / all.
  const parts = args.trim().split(/\s+/);
  if (parts.length < 2) {
    await adapter.postChatMessage(
      "🎲 Usage: !give @user <amount> (int, N%, or all).",
    );
    return;
  }
  const targetLogin = parts[0].replace(/^@/, "").toLowerCase();
  const amountRaw = parts.slice(1).join(" ");

  const callerBalance = await getBalance(econ.caller.id);
  const amount = parseAmount(amountRaw, callerBalance);
  if (amount === null) {
    await adapter.postChatMessage(
      `🎲 @${ctx.senderDisplayName}, "${amountRaw}" isn't a valid amount.`,
    );
    return;
  }

  const targetIdentity = await lookupIdentityByTwitchLogin(
    targetLogin,
    econ.streamerUserId,
  );
  if (!targetIdentity) {
    await adapter.postChatMessage(
      `🎲 Couldn't find @${targetLogin} on Twitch.`,
    );
    return;
  }
  if (targetIdentity.id === econ.caller.id) {
    await adapter.postChatMessage(
      `🎲 @${ctx.senderDisplayName}, can't transfer to yourself.`,
    );
    return;
  }

  const result = await transfer({
    fromIdentityId: econ.caller.id,
    toIdentityId: targetIdentity.id,
    amount,
    ctx: {
      communityId: econ.community.id,
      meta: { surface: "twitch_chat" },
    },
  });
  if (!result.ok) {
    if (result.reason === "insufficient_balance") {
      await adapter.postChatMessage(
        `🎲 @${ctx.senderDisplayName}, you only have ${formatTokens(callerBalance)} — can't send ${formatTokens(amount)}.`,
      );
      return;
    }
    await adapter.postChatMessage(
      `🎲 Transfer failed (${result.reason ?? "unknown"}).`,
    );
    return;
  }

  await adapter.postChatMessage(
    `🎲 @${ctx.senderDisplayName} sent ${formatTokens(amount)} to @${targetLogin}. (You: ${formatTokens(result.fromBalance ?? 0)} · Them: ${formatTokens(result.toBalance ?? 0)})`,
  );
}

// ---------------------------------------------------------------------------
// !leaderboard
// ---------------------------------------------------------------------------

export async function handleLeaderboardCommand(
  ctx: ShuffleContext,
): Promise<void> {
  const econ = await resolveEconomyContext(ctx);
  if (!econ) return;
  const adapter = adapterForCtx(ctx, econ);

  const top = await getLeaderboard({
    kind: "combined",
    communityId: econ.community.id,
    limit: 5,
  });
  if (top.length === 0) {
    await adapter.postChatMessage(
      `🎲 No tokens earned yet in @${econ.streamerSlug}'s community. Be the first.`,
    );
    return;
  }
  const formatted = top
    .map(
      (r, idx) =>
        `${idx + 1}. ${r.displayName ?? "?"} (${formatTokens(r.score)})`,
    )
    .join(" · ");
  await adapter.postChatMessage(`🏆 Top ${top.length}: ${formatted}`);
}

// ---------------------------------------------------------------------------
// !bet <option> <amount>
// ---------------------------------------------------------------------------

export async function handleBetCommand(
  ctx: ShuffleContext,
  args: string,
  /** Compliance gate decision from the dispatcher. Per Spec 07 §4,
   *  spectator viewers pick an outcome (badge / social presence)
   *  without escrowing tokens; the resolver's parimutuel split
   *  excludes them automatically because no `gs_bets` row gets
   *  written. Defaults to "full" so non-dispatcher callers (the
   *  test harness) behave normally. */
  complianceBehavior: "full" | "spectator" = "full",
): Promise<void> {
  const econ = await resolveEconomyContext(ctx);
  if (!econ) return;
  const adapter = adapterForCtx(ctx, econ);

  if (!econ.activeSessionId || !econ.activeGameSlug) {
    await adapter.postChatMessage(
      `🎲 No active session right now — wait for the streamer to start one.`,
    );
    return;
  }

  const gameKey = canonicalizeGameKey(econ.activeGameSlug);
  if (!gameKey) {
    await adapter.postChatMessage(
      `🎲 Markets aren't supported for the current game yet.`,
    );
    return;
  }

  const market = await findActiveMarket({
    sessionId: econ.activeSessionId,
    gameKey,
  });
  if (!market || market.status !== "open") {
    await adapter.postChatMessage(
      `🎲 @${ctx.senderDisplayName}, no open market to bet on right now.`,
    );
    return;
  }

  const parts = args.trim().split(/\s+/);

  // Spectator path — Spec 07 §4. The viewer's region triggers
  // spectator mode for this prediction_pool surface. They pick an
  // outcome (badge only) and are excluded from the parimutuel
  // split. Per spec: "cannot change their pick after submitting"
  // (enforced by the gs_market_predictions unique index).
  if (complianceBehavior === "spectator") {
    if (parts.length < 1 || parts[0] === "") {
      await adapter.postChatMessage(
        "🎲 Usage: !bet <option>. Your region uses spectator mode — no stake.",
      );
      return;
    }
    const optionKey = parts[0];
    const result = await placeSpectatorPick({
      marketId: market.id,
      optionKey,
      identityId: econ.caller.id,
    });
    if (!result.ok) {
      const copy: Record<typeof result.reason, string> = {
        market_not_found: "Market just closed.",
        market_not_open: "Market is locked — too late to pick.",
        outcome_not_found: `"${optionKey}" isn't an option on this market.`,
        already_picked: "You already picked — picks are locked after submission.",
      };
      await adapter.postChatMessage(
        `🎲 @${ctx.senderDisplayName}, ${copy[result.reason]}`,
      );
      return;
    }
    await adapter.postChatMessage(
      `✅ @${ctx.senderDisplayName} pick locked in: ${result.prediction.optionKey} (spectator mode — no stake). Outcome reveals when the streamer resolves.`,
    );
    return;
  }

  // Full path — real stake.
  if (parts.length < 2) {
    await adapter.postChatMessage(
      "🎲 Usage: !bet <option> <amount>. See current market on /live page.",
    );
    return;
  }
  const optionKey = parts[0];
  const amountRaw = parts.slice(1).join(" ");

  const callerBalance = await getBalance(econ.caller.id);
  const amount = parseAmount(amountRaw, callerBalance);
  if (amount === null) {
    await adapter.postChatMessage(
      `🎲 "${amountRaw}" isn't a valid amount.`,
    );
    return;
  }

  const result = await placeBet({
    marketId: market.id,
    optionKey,
    identityId: econ.caller.id,
    amount,
  });
  if (!result.ok) {
    const reasonCopy: Record<typeof result.reason, string> = {
      market_not_found: "Market just closed.",
      market_not_open: "Market is locked — too late to bet.",
      outcome_not_found: `"${optionKey}" isn't an option on this market.`,
      insufficient_balance: `You only have ${formatTokens(callerBalance)}.`,
      invalid_amount: `"${amountRaw}" isn't a valid amount.`,
    };
    await adapter.postChatMessage(
      `🎲 @${ctx.senderDisplayName}, ${reasonCopy[result.reason]}`,
    );
    return;
  }

  const lockInSuffix = formatLockInSuffix(market.lock_at);
  await adapter.postChatMessage(
    `✅ @${ctx.senderDisplayName} bet locked in: ${formatTokens(amount)}🪙 on ${optionKey} · Balance: ${formatTokens(result.balance)}🪙${lockInSuffix}.`,
  );
}

/** Render " · Locks in M:SS" when a future lock timestamp is available.
 *  Used in the bet-confirmation reply so viewers see how much time
 *  is left to add to / cover their bet before the window closes. */
function formatLockInSuffix(lockAt: string | null): string {
  if (!lockAt) return "";
  const ms = Date.parse(lockAt);
  if (!Number.isFinite(ms)) return "";
  const remainingMs = ms - Date.now();
  if (remainingMs <= 0) return "";
  const totalSeconds = Math.ceil(remainingMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return ` · Locks in ${minutes}:${seconds.toString().padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// !gs market open [1|3|5]
// ---------------------------------------------------------------------------

export async function handleMarketOpenCommand(
  ctx: ShuffleContext,
  args: string,
  isBroadcaster: boolean,
): Promise<void> {
  const econ = await resolveEconomyContext(ctx);
  if (!econ) return;
  const adapter = adapterForCtx(ctx, econ);

  if (!isBroadcaster) {
    await adapter.postChatMessage(
      `🎲 Only the streamer can open markets right now.`,
    );
    return;
  }

  if (!econ.activeSessionId || !econ.activeGameSlug) {
    await adapter.postChatMessage(
      `🎲 No active session — start one first.`,
    );
    return;
  }
  const gameKey = canonicalizeGameKey(econ.activeGameSlug);
  if (!gameKey) {
    await adapter.postChatMessage(
      `🎲 Markets aren't supported for this game yet.`,
    );
    return;
  }

  const lockMinutes = parseLockMinutes(args);
  const chapter = await currentChapterForSession(econ.activeSessionId);

  const result = await openMarket({
    communityId: econ.community.id,
    streamId: econ.activeStreamId,
    sessionId: econ.activeSessionId,
    gameKey,
    chapter,
    subject: econ.streamerDisplayName,
    hostIdentityId: econ.broadcasterIdentity.id,
    lockMinutes,
  });
  if (!result.ok) {
    if (result.reason === "active_market_exists") {
      await adapter.postChatMessage(
        `🎲 A market is already open for this game. Close or resolve it first.`,
      );
      return;
    }
    if (result.reason === "no_eligible_template") {
      await adapter.postChatMessage(
        `🎲 No market templates available for this game yet.`,
      );
      return;
    }
    await adapter.postChatMessage(
      `🎲 Couldn't open market (${result.detail ?? result.reason}).`,
    );
    return;
  }

  const optionList = result.outcomes
    .map((o) => `${o.option_key}: ${o.label}`)
    .join(" · ");
  // Include the streamer's /live page in the open broadcast so
  // viewers know they can bet from either chat OR the web UI. Falls
  // back to chat-only copy when the streamer hasn't set a slug yet.
  const { getLiveUrlForUser } = await import("@/lib/twitch/streamerSlug");
  const liveUrl = await getLiveUrlForUser(ctx.userId).catch(() => null);
  const liveSuffix = liveUrl ? ` or open https://${liveUrl}` : "";
  await adapter.postChatMessage(
    `🗳️ Market OPEN — ${result.market.question} · Options: ${optionList} · Bet with "!bet <option> <amount>" in chat${liveSuffix} · Locks in ${lockMinutes} min.`,
  );
}

// ---------------------------------------------------------------------------
// !gs market lock
// ---------------------------------------------------------------------------

export async function handleMarketLockCommand(
  ctx: ShuffleContext,
  isBroadcaster: boolean,
): Promise<void> {
  const econ = await resolveEconomyContext(ctx);
  if (!econ) return;
  const adapter = adapterForCtx(ctx, econ);

  if (!isBroadcaster) {
    await adapter.postChatMessage(
      `🎲 Only the streamer can lock markets right now.`,
    );
    return;
  }
  if (!econ.activeSessionId || !econ.activeGameSlug) return;
  const gameKey = canonicalizeGameKey(econ.activeGameSlug);
  if (!gameKey) return;

  const market = await findActiveMarket({
    sessionId: econ.activeSessionId,
    gameKey,
  });
  if (!market || market.status !== "open") {
    await adapter.postChatMessage(`🎲 No open market to lock.`);
    return;
  }
  const result = await lockMarket({ marketId: market.id });
  if (!result.ok) {
    await adapter.postChatMessage(`🎲 Couldn't lock (${result.reason}).`);
    return;
  }
  await adapter.postChatMessage(
    `🔒 Market locked — no more bets. Watching for the outcome…`,
  );
}

// ---------------------------------------------------------------------------
// !gs market close
// ---------------------------------------------------------------------------

export async function handleMarketCloseCommand(
  ctx: ShuffleContext,
  isBroadcaster: boolean,
): Promise<void> {
  const econ = await resolveEconomyContext(ctx);
  if (!econ) return;
  const adapter = adapterForCtx(ctx, econ);

  if (!isBroadcaster) {
    await adapter.postChatMessage(
      `🎲 Only the streamer can close markets right now.`,
    );
    return;
  }
  if (!econ.activeSessionId || !econ.activeGameSlug) return;
  const gameKey = canonicalizeGameKey(econ.activeGameSlug);
  if (!gameKey) return;

  const market = await findActiveMarket({
    sessionId: econ.activeSessionId,
    gameKey,
  });
  if (!market) {
    await adapter.postChatMessage(`🎲 No active market to close.`);
    return;
  }
  const result = await cancelMarket({ marketId: market.id, reason: "manual" });
  // Per Spec 02 §8: refunds are silent. Streamer asked for it via
  // !close, so we acknowledge them briefly without listing every refund.
  await adapter.postChatMessage(
    `🎲 Market closed. ${result.refundedBets} bet${result.refundedBets === 1 ? "" : "s"} refunded.`,
  );
}

// ---------------------------------------------------------------------------
// !gs resolve <value>
// ---------------------------------------------------------------------------

export async function handleResolveCommand(
  ctx: ShuffleContext,
  args: string,
  isBroadcaster: boolean,
): Promise<void> {
  const econ = await resolveEconomyContext(ctx);
  if (!econ) return;
  const adapter = adapterForCtx(ctx, econ);

  if (!isBroadcaster) {
    await adapter.postChatMessage(
      `🎲 Only the streamer can resolve markets right now.`,
    );
    return;
  }
  if (!econ.activeSessionId || !econ.activeGameSlug) return;
  const gameKey = canonicalizeGameKey(econ.activeGameSlug);
  if (!gameKey) return;

  const value = args.trim();
  if (!value) {
    await adapter.postChatMessage(`🎲 Usage: !gs-resolve <value>.`);
    return;
  }

  // Find the locked market (or open — auto-lock first if needed).
  let market = await findActiveMarket({
    sessionId: econ.activeSessionId,
    gameKey,
  });
  if (!market) {
    await adapter.postChatMessage(`🎲 No active market to resolve.`);
    return;
  }
  if (market.status === "open") {
    const lockResult = await lockMarket({ marketId: market.id });
    if (lockResult.ok) market = lockResult.market;
  }
  if (market.status !== "locked") {
    await adapter.postChatMessage(`🎲 Market isn't lockable.`);
    return;
  }

  const result = await resolveMarket({
    marketId: market.id,
    value,
    resolverIdentityId: econ.broadcasterIdentity.id,
  });
  if (!result.ok) {
    const copy: Record<string, string> = {
      market_not_found: "Market disappeared.",
      market_not_locked: "Market isn't locked.",
      resolver_is_bettor:
        "You bet on this market — can't resolve. Use !gs-market-close to refund.",
      resolver_not_host: "Only the streamer can resolve.",
      invalid_value: `"${value}" isn't a valid resolution value.`,
    };
    await adapter.postChatMessage(
      `🎲 ${copy[result.reason] ?? result.reason}`,
    );
    return;
  }

  // Build the winning summary — list each winning side with the
  // total payout AND the count of winners so chat sees how many
  // viewers cashed in. "1 winner shared" looks weird so swap to
  // "won". Empty winners → friendlier copy than the bare default.
  const winningPools = result.pools.filter((p) => p.isWinner);
  const winningSummary = winningPools
    .map((p) => {
      const verb = p.winnerCount === 1 ? "won" : "shared";
      return `${p.optionKey}: ${p.winnerCount} ${verb} ${formatTokens(p.payoutTotal)}🪙`;
    })
    .join(" · ");
  await adapter.postChatMessage(
    `🏁 Resolved: ${result.market.question} → ${value}. ${
      winningSummary || "No winners — every bet refunded."
    }`,
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function adapterForCtx(
  ctx: ShuffleContext,
  econ: EconomyContext,
): TwitchAdapter {
  return new TwitchAdapter({
    sessionId: econ.activeSessionId ?? "no-session",
    ownerUserId: ctx.userId,
  });
}

/** Pretty-print a token amount as "N🪙". Brand-consistent with the
 *  existing chat copy (the shuffle 🎲 prefix, the lobby ✓/✗ marks). */
function formatTokens(amount: number): string {
  return `${amount.toLocaleString("en-US")}🪙`;
}

/** Parse `[1|3|5]` arg for `!gs market open`. Defaults to 1. */
function parseLockMinutes(args: string): 1 | 3 | 5 {
  const n = parseInt(args.trim(), 10);
  if (n === 3) return 3;
  if (n === 5) return 5;
  return 1;
}

/** Map the session's `randomizer_slug` to the canonical `game_key`
 *  used in the markets schema. Returns null for unsupported games. */
function canonicalizeGameKey(slug: string): string | null {
  // The race-game enum / kebab slug ambiguity already exists across
  // the codebase. Accept both shapes; only race games support markets
  // today.
  if (slug === "mk8dx" || slug === "mario-kart-8-deluxe") {
    return "mario-kart-8-deluxe";
  }
  if (slug === "mkworld" || slug === "mario-kart-world") {
    return "mario-kart-world";
  }
  return null;
}

/**
 * Translate a Twitch chat @mention into a gs_identities row. Uses
 * the broadcaster's user-token-scoped Helix to resolve login →
 * twitch_user_id, then `resolveIdentity` for the identity row.
 */
export async function lookupIdentityByTwitchLogin(
  login: string,
  streamerUserId: string,
): Promise<Identity | null> {
  if (!login) return null;
  try {
    const token = await getValidUserAccessToken(streamerUserId);
    const helixUser = await getUserByLogin(login, token);
    if (!helixUser) return null;
    await resolveIdentity({
      platform: "twitch",
      platformId: helixUser.id,
      displayName: helixUser.display_name,
    });
    return await (await import("@/lib/economy/identity")).getIdentityByPlatform(
      "twitch",
      helixUser.id,
    );
  } catch (err) {
    console.error("[economy/lookupIdentityByTwitchLogin] helix lookup failed:", err);
    return null;
  }
}

/**
 * Current "chapter" for a session — used to pin a market to a specific
 * unit of play. v1 chapters are not yet a first-class concept in our
 * existing schema, so we return 1 as a stable placeholder until the
 * chapter mechanic ships (a market still scopes per session, which is
 * what the live-only / refund-vs-end semantics rely on).
 */
async function currentChapterForSession(_sessionId: string): Promise<number> {
  return 1;
}

// ---------------------------------------------------------------------------
// !gs award @user <amount> — Spec 01 §3.10, Spec 03 §1
// ---------------------------------------------------------------------------

export async function handleAwardCommand(
  ctx: ShuffleContext,
  args: string,
  isBroadcaster: boolean,
): Promise<void> {
  const econ = await resolveEconomyContext(ctx);
  if (!econ) return;
  const adapter = adapterForCtx(ctx, econ);

  if (!isBroadcaster) {
    await adapter.postChatMessage(
      "🎲 Only the streamer can award tokens.",
    );
    return;
  }

  const parts = args.trim().split(/\s+/);
  if (parts.length < 2) {
    await adapter.postChatMessage(
      "🎲 Usage: !gs award @user <amount>. Draws from your monthly allowance.",
    );
    return;
  }
  const targetLogin = parts[0].replace(/^@/, "").toLowerCase();
  const amountToken = parts[1];
  const amount = parseInt(amountToken, 10);
  if (!Number.isInteger(amount) || amount <= 0) {
    await adapter.postChatMessage(
      `🎲 "${amountToken}" isn't a valid amount. Use a positive integer.`,
    );
    return;
  }

  const targetIdentity = await lookupIdentityByTwitchLogin(
    targetLogin,
    econ.streamerUserId,
  );
  if (!targetIdentity) {
    await adapter.postChatMessage(
      `🎲 Couldn't find @${targetLogin} on Twitch.`,
    );
    return;
  }

  const result = await awardMint({
    communityId: econ.community.id,
    toIdentityId: targetIdentity.id,
    amount,
    meta: { surface: "twitch_chat", trigger: "manual_award" },
  });
  if (!result.ok) {
    const copy: Record<string, string> = {
      invalid_amount: "Amount must be positive.",
      self_award_rejected: "Streamers can't award themselves.",
      no_allowance: "No monthly allowance — paid tier required to award.",
      allowance_exceeded: `Allowance exhausted (${result.ceiling ?? "?"} 🪙 ceiling; ${result.consumed ?? "?"} already used).`,
    };
    await adapter.postChatMessage(
      `🎲 ${copy[result.reason] ?? `Couldn't award (${result.reason}).`}`,
    );
    return;
  }
  await adapter.postChatMessage(
    `🎁 @${targetLogin} earned ${formatTokens(result.minted)} from the streamer! (Allowance: ${result.consumed}/${result.ceiling})`,
  );
}

// ---------------------------------------------------------------------------
// !gs bounty <amount> <description> — open a bounty (Spec 02 §8a)
// ---------------------------------------------------------------------------

export async function handleBountyOpenCommand(
  ctx: ShuffleContext,
  args: string,
  isBroadcaster: boolean,
): Promise<void> {
  const econ = await resolveEconomyContext(ctx);
  if (!econ) return;
  const adapter = adapterForCtx(ctx, econ);

  if (!isBroadcaster) {
    await adapter.postChatMessage("🎲 Only the streamer can open bounties.");
    return;
  }

  const parts = args.trim().split(/\s+/);
  if (parts.length < 2) {
    await adapter.postChatMessage(
      "🎲 Usage: !gs bounty <amount> <description>. Reserves against your monthly allowance.",
    );
    return;
  }
  const amount = parseInt(parts[0], 10);
  if (!Number.isInteger(amount) || amount <= 0) {
    await adapter.postChatMessage(
      `🎲 "${parts[0]}" isn't a valid amount.`,
    );
    return;
  }
  const description = parts.slice(1).join(" ").trim();

  const result = await openBounty({
    communityId: econ.community.id,
    streamId: econ.activeStreamId,
    sessionId: econ.activeSessionId,
    chapter: null,
    gameKey: econ.activeGameSlug ? canonicalizeGameKey(econ.activeGameSlug) : null,
    amount,
    description,
    createdByIdentityId: econ.broadcasterIdentity.id,
  });
  if (!result.ok) {
    const copy: Record<string, string> = {
      invalid_amount: "Amount must be positive.",
      missing_description: "Add a description after the amount.",
      no_allowance: "No monthly allowance — paid tier required for bounties.",
      allowance_exceeded: `Allowance can't cover ${amount}🪙 — ceiling ${result.ceiling ?? "?"}, ${result.consumed ?? "?"} already used/reserved.`,
    };
    await adapter.postChatMessage(
      `🎲 ${copy[result.reason] ?? `Couldn't open bounty (${result.reason}).`}`,
    );
    return;
  }
  await adapter.postChatMessage(
    `🏴‍☠️ BOUNTY OPEN — ${formatTokens(result.amount)} for: ${description}. Award with !gs bounty award @user.`,
  );
}

// ---------------------------------------------------------------------------
// !gs bounty award @user — pay out (Spec 02 §8a)
// ---------------------------------------------------------------------------

export async function handleBountyAwardCommand(
  ctx: ShuffleContext,
  args: string,
  isBroadcaster: boolean,
): Promise<void> {
  const econ = await resolveEconomyContext(ctx);
  if (!econ) return;
  const adapter = adapterForCtx(ctx, econ);

  if (!isBroadcaster) {
    await adapter.postChatMessage("🎲 Only the streamer can award bounties.");
    return;
  }
  const target = args.trim().replace(/^@/, "").toLowerCase();
  if (!target) {
    await adapter.postChatMessage(
      "🎲 Usage: !gs bounty award @user. Pays the most-recent open bounty.",
    );
    return;
  }

  // v1: settle the most-recent open bounty on this stream. The
  // schema supports multiple open bounties; a future variant could
  // take an explicit id or description fragment.
  const bounty = await findMostRecentOpenBounty(econ.activeStreamId);
  if (!bounty) {
    await adapter.postChatMessage("🎲 No open bounty to award.");
    return;
  }

  const targetIdentity = await lookupIdentityByTwitchLogin(
    target,
    econ.streamerUserId,
  );
  if (!targetIdentity) {
    await adapter.postChatMessage(`🎲 Couldn't find @${target} on Twitch.`);
    return;
  }

  const result = await settleBounty({
    bountyId: bounty.id,
    toIdentityId: targetIdentity.id,
  });
  if (!result.ok) {
    const copy: Record<string, string> = {
      bounty_not_found: "Bounty disappeared.",
      bounty_not_open: "Bounty isn't open anymore.",
      no_recipient: "Pick a recipient.",
      self_award_rejected: "Streamers can't award themselves.",
    };
    await adapter.postChatMessage(
      `🎲 ${copy[result.reason] ?? `Couldn't settle bounty (${result.reason}).`}`,
    );
    return;
  }
  await adapter.postChatMessage(
    `🏆 @${target} claimed the bounty (${formatTokens(result.minted)})! Bounty: ${bounty.description}`,
  );
}

// ---------------------------------------------------------------------------
// !gs bounty cancel — release the reservation (Spec 02 §8a)
// ---------------------------------------------------------------------------

export async function handleBountyCancelCommand(
  ctx: ShuffleContext,
  isBroadcaster: boolean,
): Promise<void> {
  const econ = await resolveEconomyContext(ctx);
  if (!econ) return;
  const adapter = adapterForCtx(ctx, econ);

  if (!isBroadcaster) {
    await adapter.postChatMessage("🎲 Only the streamer can cancel bounties.");
    return;
  }

  const bounty = await findMostRecentOpenBounty(econ.activeStreamId);
  if (!bounty) {
    await adapter.postChatMessage("🎲 No open bounty to cancel.");
    return;
  }
  const result = await cancelBounty(bounty.id);
  if (!result.ok) {
    await adapter.postChatMessage(
      `🎲 Couldn't cancel (${result.reason ?? "unknown"}).`,
    );
    return;
  }
  await adapter.postChatMessage(
    `🎲 Bounty cancelled — ${formatTokens(result.released ?? bounty.amount)} returned to allowance.`,
  );
}
