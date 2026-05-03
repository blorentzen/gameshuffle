/**
 * `!gs-picks-open` / `!gs-picks-close` — broadcaster-only chat triggers
 * for opening/closing the live-view picks/bans round on the active
 * game. Replaces the old `!gs-pick-track` / `!gs-ban-track` /
 * `!gs-pick-item` / `!gs-ban-item` chat commands per the multi-game
 * refinements spec — viewer interaction lives on /live/[streamer-slug]
 * now, chat is just a signal.
 */

import { TwitchAdapter } from "@/lib/adapters/twitch";
import { findTwitchSessionForUser } from "@/lib/sessions/twitch-platform";
import { createServiceClient } from "@/lib/supabase/admin";
import { recordEvent } from "@/lib/sessions/service";
import { SESSION_EVENT_TYPES } from "@/lib/sessions/event-types";
import {
  picksBansOpenedMessage,
  picksBansClosedMessage,
} from "./messages";
import { aggregateBallots } from "@/lib/picks-bans/aggregate";
import { listBallotsForRound } from "@/lib/picks-bans/queries";
import { getGameName } from "@/data/game-registry";
import type { RaceCommandContext } from "./race";

interface SessionRow {
  id: string;
  slug: string;
  active_game: string | null;
  config: { game?: string | null } | null;
}

async function loadActiveSessionRow(userId: string): Promise<SessionRow | null> {
  // The Twitch-shaped view doesn't carry slug/active_game directly, so
  // grab the underlying row.
  const view = await findTwitchSessionForUser(userId, ["active", "test"]);
  if (!view) return null;
  const admin = createServiceClient();
  const { data } = await admin
    .from("gs_sessions")
    .select("id, slug, active_game, config")
    .eq("id", view.id)
    .maybeSingle();
  return (data as SessionRow | null) ?? null;
}

function activeGameSlug(row: SessionRow): string | null {
  return row.active_game ?? row.config?.game ?? null;
}

export async function handlePicksOpenCommand(
  ctx: RaceCommandContext
): Promise<void> {
  const session = await loadActiveSessionRow(ctx.userId);
  if (!session) return;
  const adapter = new TwitchAdapter({
    sessionId: session.id,
    ownerUserId: ctx.userId,
  });

  const gameSlug = activeGameSlug(session);
  if (!gameSlug) {
    await adapter.postChatMessage(
      "🗳️ Can't open a picks/bans round — no game is currently active. Pick a supported category on Twitch first."
    );
    return;
  }

  const admin = createServiceClient();
  const { error: insertErr } = await admin
    .from("session_picks_bans_rounds")
    .insert({
      session_id: session.id,
      game_slug: gameSlug,
      status: "open",
      recommendation_top_n: 5,
      recommendation_mode: "recommend",
    });
  if (insertErr) {
    if ((insertErr as { code?: string }).code === "23505") {
      await adapter.postChatMessage(
        "🗳️ A picks/bans round is already open for this game. Use !gs-picks-close to close it first."
      );
      return;
    }
    console.error("[picksBans] open failed:", insertErr);
    return;
  }

  await recordEvent({
    sessionId: session.id,
    eventType: SESSION_EVENT_TYPES.picks_bans_opened,
    actorType: "streamer",
    actorId: ctx.broadcasterTwitchId,
    payload: { game_slug: gameSlug, trigger: "chat_command" },
  });

  await adapter.postChatMessage(
    picksBansOpenedMessage({
      streamerSlug: session.slug,
      gameName: getGameName(gameSlug),
    })
  );
}

export async function handlePicksCloseCommand(
  ctx: RaceCommandContext
): Promise<void> {
  const session = await loadActiveSessionRow(ctx.userId);
  if (!session) return;
  const adapter = new TwitchAdapter({
    sessionId: session.id,
    ownerUserId: ctx.userId,
  });

  const admin = createServiceClient();
  // Pick the open round for the active game (or any open round if no
  // active game — defensive fallback).
  const gameSlug = activeGameSlug(session);
  let query = admin
    .from("session_picks_bans_rounds")
    .select("id, game_slug")
    .eq("session_id", session.id)
    .eq("status", "open")
    .order("opened_at", { ascending: false })
    .limit(1);
  if (gameSlug) query = query.eq("game_slug", gameSlug);
  const { data: rounds } = await query;
  const round = (rounds?.[0] as { id: string; game_slug: string } | undefined) ?? null;
  if (!round) {
    await adapter.postChatMessage(
      "🗳️ No open picks/bans round to close."
    );
    return;
  }

  // Aggregate locked ballots so the close-event audit row + chat post
  // both reflect the locked count.
  const ballots = await listBallotsForRound(round.id);
  const lockedCount = ballots.filter((b) => b.locked_at != null).length;
  const results = aggregateBallots(ballots, { lockedOnly: true });

  await admin
    .from("session_picks_bans_rounds")
    .update({
      status: "closed",
      closed_at: new Date().toISOString(),
      results: results as unknown as Record<string, unknown>,
    })
    .eq("id", round.id);

  await recordEvent({
    sessionId: session.id,
    eventType: SESSION_EVENT_TYPES.picks_bans_closed,
    actorType: "streamer",
    actorId: ctx.broadcasterTwitchId,
    payload: {
      round_id: round.id,
      game_slug: round.game_slug,
      ballot_count: lockedCount,
      total_ballots: ballots.length,
      trigger: "chat_command",
    },
  });

  await adapter.postChatMessage(
    picksBansClosedMessage({
      gameName: getGameName(round.game_slug),
      ballotCount: lockedCount,
    })
  );
}
