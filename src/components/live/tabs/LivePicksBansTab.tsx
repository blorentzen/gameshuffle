"use client";

/**
 * Live-view picks/bans tab — viewer-facing wrapper around the shared
 * `<PicksBansPicker>` component. Resolves the round + ballots for the
 * current active game from the realtime live-state context, plus the
 * viewer's identity (twitch_user_id for authed, anon sessionStorage
 * UUID otherwise), then delegates rendering to the shared picker.
 *
 * Per `gs-picks-bans-evergreen-drafts-spec.md` §UI.
 */

import { useMemo } from "react";
import { type RaceGame } from "@/lib/randomizers/race";
import { useLiveState } from "../RealtimeLiveView";
import { useAnonViewerId } from "../useAnonViewerId";
import { PicksBansPicker } from "@/components/picks-bans/PicksBansPicker";

interface Props {
  sessionId: string;
  game: RaceGame | null;
  /** kebab-case game slug (`mario-kart-8-deluxe` etc.) — needed to
   *  match the open round's `game_slug`. */
  gameSlug: string | null;
  /** Authed-viewer twitch_user_id when available. Anonymous viewers
   *  fall back to the sessionStorage UUID. */
  viewerTwitchUserId: string | null;
  isAuthenticated: boolean;
  onSignInClick: () => void;
}

export function LivePicksBansTab({
  sessionId,
  game,
  gameSlug,
  viewerTwitchUserId,
  isAuthenticated,
  onSignInClick,
}: Props) {
  const live = useLiveState();
  const anonId = useAnonViewerId();

  const round = useMemo(
    () =>
      gameSlug
        ? live.rounds.find(
            (r) => r.game_slug === gameSlug && r.status === "open",
          ) ?? null
        : null,
    [live.rounds, gameSlug],
  );
  const ballots = useMemo(
    () => (round ? live.ballots.filter((b) => b.round_id === round.id) : []),
    [live.ballots, round],
  );

  if (!gameSlug || !game) {
    return (
      <div className="live-tab live-tab--empty">
        <p>
          The streamer hasn&rsquo;t selected a supported game yet — picks/bans
          rounds aren&rsquo;t available.
        </p>
      </div>
    );
  }

  return (
    <PicksBansPicker
      sessionId={sessionId}
      gameSlug={gameSlug}
      game={game}
      round={round}
      ballots={ballots}
      viewerTwitchUserId={viewerTwitchUserId}
      anonId={anonId}
      isAuthenticated={isAuthenticated}
      onSignInClick={onSignInClick}
    />
  );
}
