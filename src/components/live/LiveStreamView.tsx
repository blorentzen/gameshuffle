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
import { LiveEventsTab } from "./tabs/LiveEventsTab";
import type { LeaderboardRow } from "@/lib/economy/leaderboards";
import { TwitchEmbed } from "./TwitchEmbed";
import { ViewerBalanceBadge } from "./ViewerBalanceBadge";
import { LivePollCard } from "./LivePollCard";
import { CurrentSettings } from "./CurrentSettings";
import { LastStreamRecap } from "./LastStreamRecap";
import { LiveTournamentRace } from "./LiveTournamentRace";
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

/** Upcoming scheduled-lobby metadata (Spec 02 §5). Passed alongside
 *  `sessionState: null` to render the countdown card over the offline
 *  frame — a viewer sees the next lobby before it opens. */
export interface UpcomingProps {
  sessionName: string;
  /** Scheduled start (ISO) — when the session is set to begin. */
  scheduledAt: string | null;
  /** When the lobby becomes joinable (ISO). Equals `scheduledAt` for
   *  `auto_open`; earlier for `announce_only` with a pre-live window. The
   *  countdown targets this. */
  lobbyOpensAt: string | null;
  /** Friendly game name ("Mario Kart 8 Deluxe") or null if unset/other. */
  gameLabel: string | null;
}

interface LiveStreamViewProps {
  streamer: StreamerProps;
  sessionState: SessionStateProps | null;
  /** Set when there's no active session but a scheduled one is upcoming.
   *  Only meaningful when `sessionState` is null. */
  upcoming?: UpcomingProps | null;
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
  /** Latest broadcast VOD to replay on the offline page (null when the
   *  streamer is live on Twitch — the channel embed shows the live stream). */
  replayVodId?: string | null;
  /** Streamer's brand `--brand-*` overrides, applied on the view root so
   *  this customer-facing page reflects their channel colors. */
  brandStyle?: CSSProperties;
}

export function LiveStreamView({
  streamer,
  sessionState,
  upcoming,
  recap,
  replayVodId,
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
          <LiveTournamentRace ownerUserId={streamer.userId} />
          {upcoming && (
            <UpcomingLobbyCard streamerName={streamerName} upcoming={upcoming} />
          )}
          {(streamer.twitchHandle || replayVodId) && (
            <div className="live-page__hero-stream live-page__hero-stream--offline">
              <TwitchEmbed twitchHandle={streamer.twitchHandle} videoId={replayVodId} />
            </div>
          )}
          <section className="live-page__not-live">
            <p className="live-page__not-live-headline">
              {upcoming
                ? `${streamerName} has a session coming up.`
                : `${streamerName} doesn’t have an active GameShuffle session right now.`}
            </p>
            <p className="live-page__not-live-sub">
              {upcoming
                ? "The lobby opens at the time above. This page fills with the race state + picks/bans + recent activity once it does. Catch the stream below in the meantime."
                : "When they start one, this page fills with the race state + picks/bans + recent activity. Catch the stream above in the meantime."}
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
            <p>
              <Link href={`/u/${streamer.slug}`} className="live-page__twitch-link">
                View {streamerName}&rsquo;s full profile →
              </Link>
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
        message: `Cast your ballot for ${gameLabel}. The streamer just opened a round.`,
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
      // Live event state — active modifiers + open public challenges fired
      // by !chaos / !random. The viewer face of the Spec 04 event system.
      id: "events",
      label: "Events",
      content: <LiveEventsTab streamerSlug={streamer.slug} />,
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
        <LiveTournamentRace ownerUserId={streamer.userId} />
        {liveStatus === "scheduled" && (
          <div className="live-page__prelive-banner" role="status">
            🎮 The lobby&rsquo;s open. Type <code>!gs-join</code> in chat to
            grab a seat. Waiting for the stream to go live.
          </div>
        )}
        {liveStatus === "ending" && (
          <div className="live-page__ending-banner" role="status">
            🏁 Wrap-up in progress. The streamer is ending this session.
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

        <LivePollCard communityId={initialLeaderboard.communityId} />

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
        <LiveTournamentRace ownerUserId={streamer.userId} />
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
      <div className="live-page__header-top">
        <p className="live-page__eyebrow">GameShuffle Live</p>
        <ViewerBalanceBadge />
      </div>
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

/** Break a millisecond remainder into display units. Drops days when the
 *  target is <24h out; drops seconds once it's ≥24h out (a live second
 *  ticker a week away is noise). */
function formatCountdownParts(ms: number): { label: string; value: string }[] {
  const totalSec = Math.floor(ms / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  const parts: { label: string; value: string }[] = [];
  if (days > 0) parts.push({ label: days === 1 ? "day" : "days", value: String(days) });
  parts.push({ label: "hr", value: String(hours).padStart(2, "0") });
  parts.push({ label: "min", value: String(minutes).padStart(2, "0") });
  if (days === 0) parts.push({ label: "sec", value: String(seconds).padStart(2, "0") });
  return parts;
}

/** Upcoming scheduled-lobby card (Spec 02 §5). Sits atop the offline
 *  frame with a live countdown to lobby-open. Time/countdown are rendered
 *  client-side only (post-mount) so the server paint doesn't bake in the
 *  server's clock/timezone — avoids a hydration mismatch. */
function UpcomingLobbyCard({
  streamerName,
  upcoming,
}: {
  streamerName: string;
  upcoming: UpcomingProps;
}) {
  const target = upcoming.lobbyOpensAt ?? upcoming.scheduledAt;
  const targetMs = target ? Date.parse(target) : null;

  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    // Initial fill deferred to a macrotask so the set isn't synchronous
    // inside the effect (avoids the cascading-render lint) — still lands
    // within a frame, keeping the countdown hydration-safe.
    const seed = setTimeout(tick, 0);
    const t = setInterval(tick, 1000);
    return () => {
      clearTimeout(seed);
      clearInterval(t);
    };
  }, []);
  const mounted = now != null;
  const remaining = targetMs != null && now != null ? targetMs - now : null;

  // Once the countdown crosses zero, re-fetch the page: the scheduler
  // flips scheduled → active around this moment (→ the live view) or the
  // schedule goes stale (→ the last-stream recap). This frame has no
  // realtime subscription, so a reload is how it self-transitions. Fires
  // once per expiry; both outcomes drop this card, so it can't loop
  // forever — only re-arms if a reload lands back on a still-open window.
  const expired = mounted && remaining != null && remaining <= 0;
  useEffect(() => {
    if (!expired) return;
    const t = setTimeout(() => window.location.reload(), 30_000);
    return () => clearTimeout(t);
  }, [expired]);

  const localTime =
    mounted && targetMs != null
      ? new Date(targetMs).toLocaleString(undefined, {
          weekday: "short",
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        })
      : null;

  return (
    <section className="live-page__upcoming" aria-live="polite">
      <p className="live-page__upcoming-eyebrow">Upcoming session</p>
      <h2 className="live-page__upcoming-title">
        {upcoming.sessionName?.trim() || `${streamerName}’s game night`}
      </h2>
      {upcoming.gameLabel && (
        <p className="live-page__upcoming-game">{upcoming.gameLabel}</p>
      )}
      <div className="live-page__upcoming-countdown">
        {!mounted ? (
          <span className="live-page__upcoming-soon">&nbsp;</span>
        ) : remaining == null || remaining <= 0 ? (
          <span className="live-page__upcoming-soon">Opening any moment…</span>
        ) : (
          formatCountdownParts(remaining).map((p) => (
            <span key={p.label} className="live-page__countdown-unit">
              <span className="live-page__countdown-value">{p.value}</span>
              <span className="live-page__countdown-label">{p.label}</span>
            </span>
          ))
        )}
      </div>
      {localTime && (
        <p className="live-page__upcoming-when">Lobby opens {localTime}</p>
      )}
      <p className="live-page__upcoming-how">
        When it opens, type <code>!gs-join</code> in chat to grab a seat.
      </p>
    </section>
  );
}
