"use client";

/**
 * Leaderboard tab — community-scoped token rankings.
 *
 * Three flavors share one rendering shell:
 *   • Combined — raw balance from all sources (default)
 *   • Player   — gameplay-track winners (meta.source = 'in-game')
 *   • Crowd    — market-track winners (meta.source = 'market')
 *
 * Refreshed every 30s while the tab is visible, and straight away when
 * it comes back (the API's answer is shared at the CDN for 15s).
 *
 * Per Spec 01 §5. The split is server-side via meta tags written at
 * earn/payout time — see `getLeaderboard` in `src/lib/economy/leaderboards.ts`.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Tabs } from "@empac/cascadeds";
import { TokenIcon } from "@/components/TokenIcon";
import { formatCompact } from "@/lib/format/number";
import type { LeaderboardRow } from "@/lib/economy/leaderboards";
import { everyVisible } from "@/lib/hooks/everyVisible";

type LeaderboardKind = "combined" | "player" | "crowd";

interface LeaderboardSnapshot {
  combined: LeaderboardRow[];
  player: LeaderboardRow[];
  crowd: LeaderboardRow[];
}

interface Props {
  streamerSlug: string;
  /** SSR-seeded snapshot. `communityId` is null for streamers whose
   *  community hasn't been created yet (no economy interaction). */
  initial: LeaderboardSnapshot & { communityId: string | null };
}

const REFRESH_MS = 30_000;

export function LiveLeaderboardTab({ streamerSlug, initial }: Props) {
  const [activeKind, setActiveKind] = useState<LeaderboardKind>("combined");
  const [data, setData] = useState<LeaderboardSnapshot>({
    combined: initial.combined,
    player: initial.player,
    crowd: initial.crowd,
  });
  const [error, setError] = useState<string | null>(null);
  const inflightRef = useRef<AbortController | null>(null);

  const refresh = useCallback(
    async (kind: LeaderboardKind) => {
      inflightRef.current?.abort();
      const ac = new AbortController();
      inflightRef.current = ac;
      try {
        const res = await fetch(
          `/api/live/${encodeURIComponent(streamerSlug)}/leaderboard?kind=${kind}`,
          { signal: ac.signal },
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

  // A light refresh while the tab is visible (and straight away on coming back). This used to be a
  // realtime subscription on token_events, but its row security only lets a viewer see their own
  // events, so it only ever fired for the viewer's own tokens and never for signed-out visitors.
  useEffect(() => everyVisible(() => void refresh(activeKind), REFRESH_MS), [activeKind, refresh]);

  const switchKind = (kind: LeaderboardKind) => {
    setActiveKind(kind);
    void refresh(kind);
  };

  const renderBoard = (kind: LeaderboardKind) => {
    const rows = data[kind];
    if (rows.length === 0) {
      return (
        <div className="live-leaderboard__empty">
          <p className="live-leaderboard__empty-headline">
            No tokens earned yet in this community.
          </p>
          <p className="live-leaderboard__empty-sub">
            Be the first. Sign in with Twitch and start interacting,
            or chat <code>!gs-join</code>{" "}when the streamer&rsquo;s live.
          </p>
        </div>
      );
    }
    return (
      <ol className="live-leaderboard__list">
        {rows.map((row, idx) => (
          <li key={row.identityId} className="live-leaderboard__row">
            <span className="live-leaderboard__rank">{idx + 1}</span>
            <span className="live-leaderboard__name">
              {row.displayName ?? "Anonymous"}
            </span>
            <span className="live-leaderboard__score">
              {formatCompact(row.score)}
              <TokenIcon size={14} />
            </span>
          </li>
        ))}
      </ol>
    );
  };

  return (
    <div className="live-leaderboard">
      <div className="live-leaderboard__intro">
        <p>
          Top token holders in this community. Combined is raw balance;
          Player tracks gameplay payouts; Crowd tracks prediction-market
          payouts. Earn by playing along, chat <code>!tokens</code> for
          your balance.
        </p>
      </div>

      {error && (
        <p className="live-leaderboard__error" role="status">
          {error}
        </p>
      )}

      <Tabs
        tabs={[
          { id: "combined", label: "Combined", content: renderBoard("combined") },
          { id: "player", label: "Player", content: renderBoard("player") },
          { id: "crowd", label: "Crowd", content: renderBoard("crowd") },
        ]}
        activeTab={activeKind}
        onChange={(id) => switchKind(id as LeaderboardKind)}
        variant="underline"
      />
    </div>
  );
}
