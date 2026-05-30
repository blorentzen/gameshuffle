"use client";

/**
 * Leaderboard tab — community-scoped token rankings.
 *
 * Three flavors share one rendering shell:
 *   • Combined — raw balance from all sources (default)
 *   • Player   — gameplay-track winners (meta.source = 'in-game')
 *   • Crowd    — market-track winners (meta.source = 'market')
 *
 * Real-time via Supabase Realtime — subscribes to `token_events`
 * INSERTs filtered by `community_id`. Debounced (300ms) so a burst
 * of events triggers a single refresh. A slow safety-net poll
 * (90s) covers the case where the Realtime channel drops; the
 * visibility-restore handler also fires a fresh refresh.
 *
 * Per Spec 01 §5. The split is server-side via meta tags written at
 * earn/payout time — see `getLeaderboard` in `src/lib/economy/leaderboards.ts`.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { LeaderboardRow } from "@/lib/economy/leaderboards";
import { createClient } from "@/lib/supabase/client";

type LeaderboardKind = "combined" | "player" | "crowd";

interface LeaderboardSnapshot {
  combined: LeaderboardRow[];
  player: LeaderboardRow[];
  crowd: LeaderboardRow[];
}

interface Props {
  streamerSlug: string;
  /** SSR-seeded snapshot + community id for the Realtime subscription
   *  filter. `communityId` is null for streamers whose community
   *  hasn't been created yet (no economy interaction) — those tabs
   *  fall back to poll-only since there's nothing to subscribe to. */
  initial: LeaderboardSnapshot & { communityId: string | null };
}

const SAFETY_POLL_MS = 90_000;
const REALTIME_DEBOUNCE_MS = 300;

export function LiveLeaderboardTab({ streamerSlug, initial }: Props) {
  const [activeKind, setActiveKind] = useState<LeaderboardKind>("combined");
  const [data, setData] = useState<LeaderboardSnapshot>({
    combined: initial.combined,
    player: initial.player,
    crowd: initial.crowd,
  });
  const [error, setError] = useState<string | null>(null);
  const inflightRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(
    async (kind: LeaderboardKind) => {
      inflightRef.current?.abort();
      const ac = new AbortController();
      inflightRef.current = ac;
      try {
        const res = await fetch(
          `/api/live/${encodeURIComponent(streamerSlug)}/leaderboard?kind=${kind}`,
          { signal: ac.signal, cache: "no-store" },
        );
        if (!res.ok) {
          setError(`Couldn't refresh (${res.status}).`);
          return;
        }
        const body = (await res.json()) as {
          kind: LeaderboardKind;
          rows: LeaderboardRow[];
        };
        setData((prev) => ({ ...prev, [body.kind]: body.rows }));
        setError(null);
      } catch (err) {
        if ((err as { name?: string }).name === "AbortError") return;
        setError("Couldn't reach the leaderboard.");
      }
    },
    [streamerSlug],
  );

  // Realtime subscription on token_events filtered by community_id.
  // INSERT events trigger a debounced refresh — a burst of events
  // (e.g. resolving a market with N payouts) collapses to one
  // request. Visibility-pause handling stops the channel while
  // hidden and rejoins on return.
  useEffect(() => {
    const communityId = initial.communityId;
    if (!communityId) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`leaderboard-${communityId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "token_events",
          filter: `community_id=eq.${communityId}`,
        },
        () => {
          if (debounceRef.current) clearTimeout(debounceRef.current);
          debounceRef.current = setTimeout(() => {
            void refresh(activeKind);
          }, REALTIME_DEBOUNCE_MS);
        },
      )
      .subscribe();
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      void supabase.removeChannel(channel);
    };
  }, [initial.communityId, activeKind, refresh]);

  // Safety-net poll. 90s slow enough to be cheap; just covers
  // Realtime dropouts. Pauses on visibility-hidden + does an
  // immediate refresh on visibility-restore.
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (timer) return;
      timer = setInterval(() => void refresh(activeKind), SAFETY_POLL_MS);
    };
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void refresh(activeKind);
        start();
      } else {
        stop();
      }
    };
    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [activeKind, refresh]);

  const switchKind = (kind: LeaderboardKind) => {
    setActiveKind(kind);
    void refresh(kind);
  };

  const rows = data[activeKind];

  return (
    <div className="live-leaderboard">
      <div className="live-leaderboard__intro">
        <p>
          Top token holders in this community. Combined is raw balance;
          Player tracks gameplay payouts; Crowd tracks prediction-market
          payouts. Earn by playing along — chat <code>!tokens</code> for
          your balance.
        </p>
      </div>

      <div
        className="live-leaderboard__switch"
        role="tablist"
        aria-label="Leaderboard category"
      >
        {(
          [
            { id: "combined", label: "Combined" },
            { id: "player", label: "Player" },
            { id: "crowd", label: "Crowd" },
          ] as const
        ).map((opt) => (
          <button
            key={opt.id}
            type="button"
            role="tab"
            aria-selected={activeKind === opt.id}
            className={`live-leaderboard__switch-btn${
              activeKind === opt.id ? " live-leaderboard__switch-btn--active" : ""
            }`}
            onClick={() => switchKind(opt.id)}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {error && (
        <p className="live-leaderboard__error" role="status">
          {error}
        </p>
      )}

      {rows.length === 0 ? (
        <div className="live-leaderboard__empty">
          <p className="live-leaderboard__empty-headline">
            No tokens earned yet in this community.
          </p>
          <p className="live-leaderboard__empty-sub">
            Be the first — sign in with Twitch and start interacting,
            or chat <code>!gs-join</code> when the streamer&rsquo;s live.
          </p>
        </div>
      ) : (
        <ol className="live-leaderboard__list">
          {rows.map((row, idx) => (
            <li key={row.identityId} className="live-leaderboard__row">
              <span className="live-leaderboard__rank">{idx + 1}</span>
              <span className="live-leaderboard__name">
                {row.displayName ?? "Anonymous"}
              </span>
              <span className="live-leaderboard__score">
                {row.score.toLocaleString("en-US")}
                <span className="live-leaderboard__coin" aria-hidden>
                  🪙
                </span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
