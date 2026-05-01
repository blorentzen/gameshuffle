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
import { createClient } from "@/lib/supabase/client";
import { RealtimeLiveView, useLiveState } from "./RealtimeLiveView";
import { AuthPromptModal } from "./AuthPromptModal";
import {
  rememberPendingAction,
  useReplayActionAfterAuth,
  type PendingAction,
} from "./useReplayActionAfterAuth";
import { LiveTracksTab } from "./tabs/LiveTracksTab";
import { LiveItemsTab } from "./tabs/LiveItemsTab";
import { LiveActivityTab } from "./tabs/LiveActivityTab";
import { LiveHowToPlayTab } from "./tabs/LiveHowToPlayTab";
import { LiveRaceState } from "./LiveRaceState";

interface StreamerProps {
  slug: string;
  displayName: string | null;
  twitchUsername: string | null;
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
}

interface LiveStreamViewProps {
  streamer: StreamerProps;
  sessionState: SessionStateProps | null;
}

export function LiveStreamView({ streamer, sessionState }: LiveStreamViewProps) {
  const streamerName =
    streamer.displayName ?? streamer.twitchUsername ?? streamer.slug;

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
            {streamer.twitchUsername && (
              <p>
                <a
                  href={`https://www.twitch.tv/${streamer.twitchUsername}`}
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
      initialParticipants={sessionState.initialParticipants}
      initialEvents={sessionState.initialEvents}
      initialRaceConfig={sessionState.raceConfig}
      initialRaceModuleEnabled={sessionState.raceModuleEnabled}
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
  const [viewerLoaded, setViewerLoaded] = useState(false);
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
    supabase.auth.getUser().then(({ data }) => {
      if (cancelled) return;
      setViewerId(data.user?.id ?? null);
      setViewerLoaded(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (cancelled) return;
      setViewerId(session?.user?.id ?? null);
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

  const tabs = [
    {
      id: "tracks",
      label: "Tracks",
      content: (
        <LiveTracksTab
          game={sessionState.game}
          requestAction={requestAction}
        />
      ),
    },
    {
      id: "items",
      label: "Items",
      content: (
        <LiveItemsTab
          game={sessionState.game}
          requestAction={requestAction}
        />
      ),
    },
    {
      id: "activity",
      label: "Activity",
      content: <LiveActivityTab />,
    },
    {
      id: "how-to-play",
      label: "How to play",
      content: (
        <LiveHowToPlayTab
          streamerName={streamer.displayName ?? streamer.twitchUsername ?? streamer.slug}
          twitchUsername={streamer.twitchUsername}
          isAuthenticated={isAuthenticated}
          onSignInClick={() => {
            setAuthActionLabel("pick or ban tracks and items");
            setAuthOpen(true);
          }}
        />
      ),
    },
  ];

  // Default tab: returning authed viewers go to Tracks; everyone else
  // gets How to play (discoverability for new viewers).
  const defaultTab = !viewerLoaded
    ? "how-to-play"
    : isAuthenticated
      ? "tracks"
      : "how-to-play";

  return (
    <Container>
      <div className="live-page">
        <StreamerHeader streamer={streamer} />
        <LiveRaceState
          sessionState={sessionState}
          participantCount={live.participants.length}
        />

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

function StreamerHeader({ streamer }: { streamer: StreamerProps }) {
  const name =
    streamer.displayName ?? streamer.twitchUsername ?? streamer.slug;
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
          {streamer.twitchUsername && (
            <a
              href={`https://www.twitch.tv/${streamer.twitchUsername}`}
              target="_blank"
              rel="noopener noreferrer"
              className="live-page__twitch-link"
            >
              twitch.tv/{streamer.twitchUsername}
            </a>
          )}
        </div>
      </div>
    </header>
  );
}
