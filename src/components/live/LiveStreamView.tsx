"use client";

/**
 * Top-level client surface for /live/[streamer-slug]. Wraps the
 * `<RealtimeLiveView />` provider, renders the streamer header + the
 * race-state hero + the tab strip (Tracks / Items / Activity / How to
 * play). When no session is active, renders the "Not live" placeholder.
 *
 * Per spec §2.5 — this view is read-only-for-streamer. Streamer
 * controls (configure, manual reroll, end session) live on /hub.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { Container, Tabs } from "@empac/cascadeds";
import type { ParticipantRow, SessionEventRow } from "@/lib/sessions/queries";
import type { RaceRandomizerConfig } from "@/lib/modules/types";
import type { RaceGame } from "@/lib/randomizers/race";
import type { LiveSessionMeta } from "@/app/live/[streamer-slug]/page";
import type {
  PicksBansBallot,
  PicksBansRound,
} from "@/lib/picks-bans/types";
import { createClient } from "@/lib/supabase/client";
import { RealtimeLiveView, useLiveState } from "./RealtimeLiveView";
import { AuthPromptModal } from "./AuthPromptModal";
import {
  rememberPendingAction,
  useReplayActionAfterAuth,
  type PendingAction,
} from "./useReplayActionAfterAuth";
import { LiveItemsTab } from "./tabs/LiveItemsTab";
import { LiveActivityTab } from "./tabs/LiveActivityTab";
import { LiveHowToPlayTab } from "./tabs/LiveHowToPlayTab";
import { LivePicksBansTab } from "./tabs/LivePicksBansTab";
import { LiveLobbyTab } from "./tabs/LiveLobbyTab";
import { LiveRacesTab } from "./tabs/LiveRacesTab";
import { TwitchEmbed } from "./TwitchEmbed";
import { CurrentSettings } from "./CurrentSettings";

/** Map a `RaceGame` enum back to the kebab slug stored in
 *  `gs_sessions.config.game` / `configured_games`. */
function gameSlugFromRaceGame(game: RaceGame | null): string | null {
  if (game === "mk8dx") return "mario-kart-8-deluxe";
  if (game === "mkworld") return "mario-kart-world";
  return null;
}

interface StreamerProps {
  slug: string;
  displayName: string | null;
  /** Twitch channel handle for the embed + "Watch on Twitch" link.
   *  Resolved server-side as `twitch_connections.twitch_login`
   *  (streamer-integration flow) || `users.twitch_username` (sign-in
   *  flow), so streamers who connected via either path light up. */
  twitchHandle: string | null;
  avatar: string | null;
}

export interface SessionStateProps {
  sessionId: string;
  sessionName: string;
  status: string;
  startedAt: string | null;
  game: RaceGame | null;
  raceConfig: RaceRandomizerConfig | null;
  raceModuleEnabled: boolean;
  initialParticipants: ParticipantRow[];
  initialEvents: SessionEventRow[];
  /** Snapshot of the gs_sessions_public columns at SSR time. The
   *  realtime layer keeps this fresh via the live-session-{id}
   *  channel; surfaces that need to react to status / active_game
   *  changes read from `useLiveState().session` instead of this
   *  initial copy. */
  initialSession: LiveSessionMeta;
  /** Open picks/bans rounds at SSR time. The realtime layer keeps
   *  these fresh via the live-rounds-{id} channel. */
  initialRounds: PicksBansRound[];
  /** Ballots for those open rounds at SSR time. The realtime layer
   *  keeps them fresh via the live-ballots-{id} channel (debounced
   *  500ms). */
  initialBallots: PicksBansBallot[];
}

interface LiveStreamViewProps {
  streamer: StreamerProps;
  sessionState: SessionStateProps | null;
}

export function LiveStreamView({ streamer, sessionState }: LiveStreamViewProps) {
  const streamerName =
    streamer.displayName ?? streamer.twitchHandle ?? streamer.slug;

  if (!sessionState) {
    return (
      <Container>
        <div className="live-page">
          <StreamerHeader streamer={streamer} />
          <section className="live-page__not-live">
            <p className="live-page__not-live-headline">
              {streamerName} isn&rsquo;t live on GameShuffle right now.
            </p>
            <p className="live-page__not-live-sub">
              When they go live, this page populates with the race state +
              picks/bans + recent activity.
            </p>
            {streamer.twitchHandle && (
              <p>
                <a
                  href={`https://www.twitch.tv/${streamer.twitchHandle}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="live-page__twitch-link"
                >
                  Watch on Twitch →
                </a>
              </p>
            )}
            <p className="live-page__brand">
              <Link href="/">GameShuffle</Link> · gameshuffle.co
            </p>
          </section>
        </div>
      </Container>
    );
  }

  return (
    <RealtimeLiveView
      sessionId={sessionState.sessionId}
      initialSession={sessionState.initialSession}
      initialParticipants={sessionState.initialParticipants}
      initialEvents={sessionState.initialEvents}
      initialRaceConfig={sessionState.raceConfig}
      initialRaceModuleEnabled={sessionState.raceModuleEnabled}
      initialRounds={sessionState.initialRounds}
      initialBallots={sessionState.initialBallots}
    >
      <LiveStreamShell streamer={streamer} sessionState={sessionState} />
    </RealtimeLiveView>
  );
}

interface ShellProps {
  streamer: StreamerProps;
  sessionState: SessionStateProps;
}

function LiveStreamShell({ streamer, sessionState }: ShellProps) {
  const live = useLiveState();
  const [authOpen, setAuthOpen] = useState(false);
  const [authActionLabel, setAuthActionLabel] = useState<string | undefined>(
    undefined
  );
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [viewerTwitchUserId, setViewerTwitchUserId] = useState<string | null>(
    null
  );
  const [actionStatus, setActionStatus] = useState<{
    kind: "ok" | "error";
    message: string;
  } | null>(null);

  // Resolve the viewer's auth state on mount + on auth-change events.
  // Supabase Auth's session is HTTP-only-cookie-backed but the client
  // exposes it via getUser().
  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    const loadIdentity = async (uid: string | null) => {
      if (!uid) {
        setViewerTwitchUserId(null);
        return;
      }
      const { data } = await supabase
        .from("users")
        .select("twitch_id")
        .eq("id", uid)
        .maybeSingle();
      if (cancelled) return;
      setViewerTwitchUserId((data?.twitch_id as string | null) ?? null);
    };
    supabase.auth.getUser().then(({ data }) => {
      if (cancelled) return;
      const uid = data.user?.id ?? null;
      setViewerId(uid);
      void loadIdentity(uid);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (cancelled) return;
      const uid = session?.user?.id ?? null;
      setViewerId(uid);
      void loadIdentity(uid);
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  const isAuthenticated = !!viewerId;

  /** Exposed to all tabs via prop drilling — tactile-action handler. */
  const requestAction = async (
    kind: PendingAction["kind"],
    id: string,
    label: string
  ) => {
    if (!isAuthenticated) {
      rememberPendingAction({
        kind,
        id,
        expectedSlug: streamer.slug,
      });
      setAuthActionLabel(label);
      setAuthOpen(true);
      return;
    }
    setActionStatus(null);
    try {
      const res = await fetch(
        `/api/live/${encodeURIComponent(streamer.slug)}/action`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind, id }),
        }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setActionStatus({
          kind: "error",
          message: body.error ?? `Action failed (${res.status}).`,
        });
        return;
      }
      setActionStatus({ kind: "ok", message: `${label} ✓` });
      // Refresh module state so the picker UI flips immediately even
      // before the realtime subscription pushes the change.
      void live.refresh();
    } catch (err) {
      console.error("[LiveStreamView] action failed:", err);
      setActionStatus({
        kind: "error",
        message: "Couldn't apply the action (network).",
      });
    }
  };

  // Replay any pending action that survived the OAuth round-trip.
  useReplayActionAfterAuth({
    currentSlug: streamer.slug,
    isAuthenticated,
    onReplay: ({ action }) => {
      void requestAction(action.kind, action.id, "Action replayed");
    },
  });

  // Tab order per the live-page reorganization: How to play leads
  // (newcomer-friendly), then Lobby + Races (the two visual surfaces
  // viewers care about during stream), then Items + Picks & Bans, then
  // Activity (the running log of everything). The previous "Tracks"
  // pool browser was retired — track picks/bans are voted on inside
  // Picks & Bans now, and the active race history lives in Races.
  const tabs = [
    {
      id: "how-to-play",
      label: "How to play",
      content: (
        <LiveHowToPlayTab
          streamerName={streamer.displayName ?? streamer.twitchHandle ?? streamer.slug}
          twitchHandle={streamer.twitchHandle}
          isAuthenticated={isAuthenticated}
          onSignInClick={() => {
            setAuthActionLabel("pick or ban tracks and items");
            setAuthOpen(true);
          }}
        />
      ),
    },
    {
      id: "lobby",
      label: "Lobby",
      content: <LiveLobbyTab />,
    },
    {
      id: "races",
      label: "Race History",
      content: <LiveRacesTab game={sessionState.game} />,
    },
    {
      id: "items",
      label: "Item History",
      content: <LiveItemsTab game={sessionState.game} />,
    },
    {
      id: "picks-bans",
      label: "Picks & Bans",
      content: (
        <LivePicksBansTab
          sessionId={sessionState.sessionId}
          game={sessionState.game}
          gameSlug={gameSlugFromRaceGame(sessionState.game)}
          viewerTwitchUserId={viewerTwitchUserId}
          isAuthenticated={isAuthenticated}
          onSignInClick={() => {
            setAuthActionLabel("vote on tracks and items");
            setAuthOpen(true);
          }}
        />
      ),
    },
    {
      id: "activity",
      label: "Activity",
      content: <LiveActivityTab />,
    },
  ];

  // How to play leads for everyone — newcomers get the orientation
  // surface first regardless of auth state, returning viewers can
  // jump tabs in one click. The previous "Tracks for authed users"
  // shortcut went away with the Tracks tab.
  const defaultTab = "how-to-play";

  // Terminal-state UI — when the streamer ends the session, the realtime
  // session channel pushes status='ended' (or 'cancelled') and we swap to
  // a "session ended" panel without a reload. Per spec §2 goal #1.
  // 'ending' is the wrap-up window so we keep showing the live shell with
  // a small banner; 'ended' / 'cancelled' / unknown-non-active collapse
  // to a terminal panel.
  const liveStatus = live.session.status;
  if (liveStatus === "ended" || liveStatus === "cancelled") {
    return <SessionEndedPanel streamer={streamer} reason={liveStatus} />;
  }

  return (
    <Container>
      <div className="live-page">
        <StreamerHeader streamer={streamer} />
        {liveStatus === "ending" && (
          <div className="live-page__ending-banner" role="status">
            🏁 Wrap-up in progress — the streamer is ending this session.
          </div>
        )}
        <div className="live-page__hero">
          <div className="live-page__hero-stream">
            <TwitchEmbed twitchHandle={streamer.twitchHandle} />
          </div>
          <div className="live-page__hero-settings">
            <CurrentSettings
              streamerName={
                streamer.displayName ?? streamer.twitchHandle ?? streamer.slug
              }
            />
          </div>
        </div>

        {actionStatus && (
          <div
            className={`live-page__action-status live-page__action-status--${actionStatus.kind}`}
            role="status"
          >
            {actionStatus.message}
          </div>
        )}

        <Tabs tabs={tabs} defaultActiveTab={defaultTab} variant="underline" />

        <footer className="live-page__footer">
          <p>
            <Link href="/">GameShuffle</Link> · the chat-first + tactile
            randomizer for kart streamers · gameshuffle.co
          </p>
        </footer>
      </div>

      <AuthPromptModal
        isOpen={authOpen}
        onClose={() => setAuthOpen(false)}
        streamerSlug={streamer.slug}
        actionLabel={authActionLabel}
      />
    </Container>
  );
}

/** Terminal-state panel — rendered when the realtime session channel
 *  reports the session has reached 'ended' or 'cancelled'. Mirrors the
 *  "Not live" not-found shape so streamer identity stays visible. */
function SessionEndedPanel({
  streamer,
  reason,
}: {
  streamer: StreamerProps;
  reason: "ended" | "cancelled";
}) {
  const streamerName =
    streamer.displayName ?? streamer.twitchHandle ?? streamer.slug;
  const headline =
    reason === "cancelled"
      ? `${streamerName} cancelled this session.`
      : `${streamerName}'s session has ended.`;
  return (
    <Container>
      <div className="live-page">
        <StreamerHeader streamer={streamer} />
        <section className="live-page__not-live">
          <p className="live-page__not-live-headline">{headline}</p>
          <p className="live-page__not-live-sub">
            {reason === "ended"
              ? "Thanks for watching. When the streamer goes live again, this page will populate with the new session."
              : "When the streamer kicks off another session, this page will populate again."}
          </p>
          {streamer.twitchHandle && (
            <p>
              <a
                href={`https://www.twitch.tv/${streamer.twitchHandle}`}
                target="_blank"
                rel="noopener noreferrer"
                className="live-page__twitch-link"
              >
                Watch on Twitch →
              </a>
            </p>
          )}
          <p className="live-page__brand">
            <Link href="/">GameShuffle</Link> · gameshuffle.co
          </p>
        </section>
      </div>
    </Container>
  );
}

function StreamerHeader({ streamer }: { streamer: StreamerProps }) {
  const name =
    streamer.displayName ?? streamer.twitchHandle ?? streamer.slug;
  return (
    <header className="live-page__header">
      <p className="live-page__eyebrow">GameShuffle Live</p>
      <div className="live-page__streamer">
        {streamer.avatar && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={streamer.avatar}
            alt=""
            width={48}
            height={48}
            className="live-page__streamer-avatar"
          />
        )}
        <div>
          <h1 className="live-page__streamer-name">{name}</h1>
          {streamer.twitchHandle && (
            <a
              href={`https://www.twitch.tv/${streamer.twitchHandle}`}
              target="_blank"
              rel="noopener noreferrer"
              className="live-page__twitch-link"
            >
              twitch.tv/{streamer.twitchHandle}
            </a>
          )}
        </div>
      </div>
    </header>
  );
}
