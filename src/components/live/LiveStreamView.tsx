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

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import Link from "next/link";
import { Container, Tabs, ToastContainer, type ToastProps } from "@empac/cascadeds";
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
import { LiveVotingTab } from "./tabs/LiveVotingTab";
import { LiveLobbyTab } from "./tabs/LiveLobbyTab";
import { LiveRacesTab } from "./tabs/LiveRacesTab";
import { LiveLeaderboardTab } from "./tabs/LiveLeaderboardTab";
import { LiveMarketsTab } from "./tabs/LiveMarketsTab";
import type { LeaderboardRow } from "@/lib/economy/leaderboards";
import { TwitchEmbed } from "./TwitchEmbed";
import { CurrentSettings } from "./CurrentSettings";
import { LastStreamRecap } from "./LastStreamRecap";
import type { RecapHighlight } from "@/lib/sessions/recap";

/** Map a `RaceGame` enum back to the kebab slug stored in
 *  `gs_sessions.config.game` / `configured_games`. */
function gameSlugFromRaceGame(game: RaceGame | null): string | null {
  if (game === "mk8dx") return "mario-kart-8-deluxe";
  if (game === "mkworld") return "mario-kart-world";
  return null;
}

/** Inverse of `gameSlugFromRaceGame` — used to derive the active
 *  RaceGame from the live `gs_sessions.active_game` field as it updates
 *  in realtime. Returns null for slugs that don't have a race
 *  randomizer (GS Queue fallback, future games without rallies/items). */
function raceGameFromSlug(slug: string | null): RaceGame | null {
  if (slug === "mario-kart-8-deluxe") return "mk8dx";
  if (slug === "mario-kart-world") return "mkworld";
  return null;
}

interface StreamerProps {
  slug: string;
  /** Streamer's auth.users.id — used by host-side tactile controls
   *  to detect "the signed-in viewer IS this streamer." Server-side
   *  endpoints (market/admin, bounty/admin) re-verify ownership;
   *  this prop only gates UI visibility. */
  userId: string;
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
  /** SSR-seeded leaderboard snapshot — three flavors, one shell.
   *  Surfaces in both live and offline states because community +
   *  balances are persistent across stream sessions. The `communityId`
   *  is also threaded through so the Realtime subscription has a
   *  filter handle without a follow-up resolve. */
  initialLeaderboard: {
    communityId: string | null;
    combined: LeaderboardRow[];
    player: LeaderboardRow[];
    crowd: LeaderboardRow[];
  };
  /** Last-stream recap surface — populated only when sessionState is
   *  null AND the streamer has the live-page recap toggle on AND
   *  there's at least one prior ended (non-test) session. */
  recap?: RecapHighlight | null;
  /** Streamer's brand `--brand-*` overrides, applied on the view root so
   *  this customer-facing page reflects their channel colors. */
  brandStyle?: CSSProperties;
}

export function LiveStreamView({
  streamer,
  sessionState,
  recap,
  initialLeaderboard,
  brandStyle,
}: LiveStreamViewProps) {
  const streamerName =
    streamer.displayName ?? streamer.twitchHandle ?? streamer.slug;

  if (!sessionState) {
    return (
      <div style={{ display: "contents", ...brandStyle }}>
      <Container>
        <div className="live-page">
          <StreamerHeader streamer={streamer} />
          <section className="live-page__not-live">
            <p className="live-page__not-live-headline">
              {streamerName}
              {" "}
              isn&rsquo;t live on GameShuffle right now.
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
          {/* Leaderboard is community-scoped, not session-scoped, so it
              renders even when the streamer isn't live. Viewers can
              check rank + balance between streams. */}
          <section className="live-page__offline-leaderboard">
            <h2 className="live-page__offline-leaderboard-heading">
              Community Leaderboard
            </h2>
            <LiveLeaderboardTab
              streamerSlug={streamer.slug}
              initial={initialLeaderboard}
            />
          </section>
          {recap && <LastStreamRecap recap={recap} />}
        </div>
      </Container>
      </div>
    );
  }

  return (
    <div style={{ display: "contents", ...brandStyle }}>
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
      <LiveStreamShell
        streamer={streamer}
        sessionState={sessionState}
        initialLeaderboard={initialLeaderboard}
      />
    </RealtimeLiveView>
    </div>
  );
}

interface ShellProps {
  streamer: StreamerProps;
  sessionState: SessionStateProps;
  initialLeaderboard: LiveStreamViewProps["initialLeaderboard"];
}

function LiveStreamShell({ streamer, sessionState, initialLeaderboard }: ShellProps) {
  const live = useLiveState();
  // Active game flips in real time when the streamer changes their
  // Twitch category — the gs_sessions UPDATE flows through the
  // realtime layer, and we derive RaceGame here so every downstream
  // tab (Race History, Item History, Picks & Bans) re-renders against
  // the right game without a page refresh. Fall back to the SSR
  // snapshot when active_game is null (no current category) so the
  // initial paint isn't blank.
  const liveGame: RaceGame | null =
    raceGameFromSlug(live.session.activeGame) ?? sessionState.game;
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

  // Controlled tab state — let the round-open toast jump viewers
  // straight to the Picks & Bans tab when they click the action.
  const [activeTab, setActiveTab] = useState<string>("how-to-play");

  // Toast queue + the set of round IDs we've already announced. The
  // initial set is seeded with whatever rounds are open at SSR time
  // so we don't fire toasts for rounds the viewer arrived to find
  // already in progress — only for rounds that newly open after
  // they're on the page.
  const [toasts, setToasts] = useState<ToastProps[]>([]);
  const [seenOpenRoundIds, setSeenOpenRoundIds] = useState<Set<string>>(
    () =>
      new Set(
        live.rounds
          .filter((r) => r.status === "open")
          .map((r) => r.id)
      )
  );

  // Diff the live open rounds against what we've already announced.
  // New ones get a toast; closed/applied/cancelled rounds drop out
  // of the seen set so a future re-open of the same game (different
  // round id) fires a fresh toast. Render-time sentinel update per
  // React's "storing-information-from-previous-renders" pattern —
  // avoids the setState-in-effect cascade.
  const currentOpenRoundIds = useMemo(
    () =>
      new Set(
        live.rounds
          .filter((r) => r.status === "open")
          .map((r) => r.id)
      ),
    [live.rounds]
  );
  const newOpenRoundIds = useMemo(
    () =>
      [...currentOpenRoundIds].filter((id) => !seenOpenRoundIds.has(id)),
    [currentOpenRoundIds, seenOpenRoundIds]
  );
  if (newOpenRoundIds.length > 0) {
    setSeenOpenRoundIds(currentOpenRoundIds);
    const newToasts: ToastProps[] = newOpenRoundIds.map((roundId: string) => {
      const round = live.rounds.find((r) => r.id === roundId);
      const gameLabel =
        round?.game_slug === "mario-kart-8-deluxe"
          ? "MK8DX"
          : round?.game_slug === "mario-kart-world"
            ? "MKWorld"
            : "this game";
      const toastId = `round-open-${roundId}`;
      const dismiss = () =>
        setToasts((prev) => prev.filter((t) => t.id !== toastId));
      return {
        id: toastId,
        variant: "success",
        title: "Picks/bans open!",
        message: `Cast your ballot for ${gameLabel} — the streamer just opened a round.`,
        onClose: dismiss,
        action: {
          label: "Open Picks & Bans",
          onClick: () => {
            setActiveTab("picks-bans");
            dismiss();
          },
        },
      };
    });
    setToasts((prev) => [...prev, ...newToasts]);
  }

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

  // Tab order: How to play leads (newcomer-friendly), Activity sits
  // right after as the running event log, then Lobby + Race History +
  // Item History (the visual surfaces viewers spectate during a
  // stream), then Picks & Bans (the editor), then Live Voting (the
  // conditionally-enabled spectator surface for an open round). The
  // previous "Tracks" pool browser was retired — track picks/bans
  // are voted on inside Picks & Bans, and the active race history
  // lives in Races.
  const hasOpenRound = live.rounds.some((r) => r.status === "open");
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
      id: "activity",
      label: "Activity",
      content: <LiveActivityTab />,
    },
    {
      id: "lobby",
      label: "Lobby",
      content: <LiveLobbyTab />,
    },
    {
      id: "races",
      label: "Race History",
      content: <LiveRacesTab game={liveGame} />,
    },
    {
      id: "items",
      label: "Item History",
      content: <LiveItemsTab game={liveGame} />,
    },
    {
      id: "picks-bans",
      label: "Picks & Bans",
      content: (
        <LivePicksBansTab
          sessionId={sessionState.sessionId}
          game={liveGame}
          gameSlug={gameSlugFromRaceGame(liveGame)}
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
      // Live Voting — leaderboard / spectator surface for an open
      // picks/bans round. Disabled when no round is open; enables
      // (with a pulsing "LIVE" badge animation per CSS) when the
      // realtime layer pushes a new open round. Picks & Bans tab
      // remains where viewers act (cycle picks, lock); this tab is
      // where they watch the room.
      id: "live-voting",
      label: "Live Voting",
      disabled: !hasOpenRound,
      badge: hasOpenRound ? "LIVE" : undefined,
      content: (
        <LiveVotingTab
          game={sessionState.game}
          gameSlug={gameSlugFromRaceGame(sessionState.game)}
        />
      ),
    },
    {
      // Token-economy leaderboard. Community-scoped, three flavors:
      // combined / player / crowd. The split exists because gameplay
      // payouts (Player) and market payouts (Crowd) reward different
      // viewer behaviors — see Spec 01 §5.
      id: "leaderboard",
      label: "Leaderboard",
      content: (
        <LiveLeaderboardTab
          streamerSlug={streamer.slug}
          initial={initialLeaderboard}
        />
      ),
    },
    {
      // Prediction markets + streamer bounties — Spec 02 §1-§9 +
      // §8a. Viewer-facing surface for placing bets / watching pools /
      // seeing open bounties. Host admin (open / lock / resolve)
      // layers in via the same tab below the viewer section.
      id: "markets",
      label: "Markets",
      content: (
        <LiveMarketsTab
          streamerSlug={streamer.slug}
          isAuthenticated={isAuthenticated}
          isHost={viewerId === streamer.userId}
          communityId={initialLeaderboard.communityId}
          onSignInClick={() => {
            setAuthActionLabel("bet on this market");
            setAuthOpen(true);
          }}
        />
      ),
    },
  ];

  // Active tab is now controlled by `activeTab` state — the toast
  // fired on round-open jumps the viewer straight to Picks & Bans.
  // Default seeded to "how-to-play" at the useState declaration.

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

        <Tabs
          tabs={tabs}
          activeTab={activeTab}
          onChange={setActiveTab}
          variant="underline"
        />

        <footer className="live-page__footer">
          <p>
            <Link href="/">GameShuffle</Link> · the chat-first + tactile
            randomizer for kart streamers · gameshuffle.co
          </p>
        </footer>
      </div>

      <ToastContainer toasts={toasts} />

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
        <div className="live-page__streamer-meta">
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
