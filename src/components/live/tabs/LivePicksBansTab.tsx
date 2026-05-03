"use client";

/**
 * Live-view picks/bans tab — viewer-facing tile picker. Replaces the
 * `!gs-pick-*` / `!gs-ban-*` chat commands with a click-to-cycle UI
 * that posts ballots through `/api/picks-bans/ballot`.
 *
 * Visibility option B (Britton's pick): running counts of in-progress +
 * locked ballots are visible to all viewers — bandwagon energy is part
 * of the chat-stream experience. The streamer's apply-top-N runs on
 * locked-only counts (server-side aggregation).
 *
 * Lock semantics: viewer assembles their ballot, then clicks "Lock my
 * vote." Once locked, the ballot is frozen for this round. Carry-over
 * from the previous round (same game) is auto-seeded so viewers can
 * adjust round-to-round without rebuilding from scratch.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Alert, Button } from "@empac/cascadeds";
import {
  listTracksForGame,
  listItemModesForGame,
  listItemsForGame,
  type Item,
  type ItemMode,
  type RaceGame,
  type Track,
} from "@/lib/randomizers/race";
import { createClient } from "@/lib/supabase/client";
import { useLiveState } from "../RealtimeLiveView";
import { useAnonViewerId } from "../useAnonViewerId";
import { aggregateBallots } from "@/lib/picks-bans/aggregate";
import type {
  PicksBansBallot,
  PicksBansResults,
  PicksBansRound,
} from "@/lib/picks-bans/types";

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

type Pool = "tracks" | "modes" | "items";

interface BallotState {
  picksTracks: string[];
  bansTracks: string[];
  picksModes: string[];
  bansModes: string[];
  picksItems: string[];
  bansItems: string[];
}

const EMPTY_BALLOT: BallotState = {
  picksTracks: [],
  bansTracks: [],
  picksModes: [],
  bansModes: [],
  picksItems: [],
  bansItems: [],
};

const POLL_INTERVAL_MS = 4000;

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
  void live; // consumed for realtime presence; not directly here

  const [round, setRound] = useState<PicksBansRound | null>(null);
  const [ballots, setBallots] = useState<PicksBansBallot[]>([]);
  const [ballot, setBallot] = useState<BallotState>(EMPTY_BALLOT);
  const [locked, setLocked] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activePool, setActivePool] = useState<Pool>("tracks");

  // Poll for the round + ballots. Realtime would be cleaner but the
  // round/ballot tables aren't wired into the `<RealtimeLiveView>`
  // provider yet — polling keeps PR B contained. Switch to realtime
  // in a follow-up.
  useEffect(() => {
    if (!gameSlug) return;
    let cancelled = false;
    const supabase = createClient();

    const refresh = async () => {
      const { data: rounds } = await supabase
        .from("session_picks_bans_rounds")
        .select("*")
        .eq("session_id", sessionId)
        .eq("game_slug", gameSlug)
        .eq("status", "open")
        .limit(1);
      if (cancelled) return;
      const open = (rounds?.[0] as PicksBansRound | undefined) ?? null;
      setRound(open);
      if (!open) {
        setBallots([]);
        setLocked(false);
        return;
      }
      const { data: rows } = await supabase
        .from("session_picks_bans_ballots")
        .select("*")
        .eq("round_id", open.id);
      if (cancelled) return;
      const list = (rows ?? []) as PicksBansBallot[];
      setBallots(list);

      const own = list.find((b) => {
        if (viewerTwitchUserId) return b.viewer_twitch_user_id === viewerTwitchUserId;
        if (anonId) return b.anon_session_id === anonId;
        return false;
      });
      if (own) {
        setBallot({
          picksTracks: [...own.picks_tracks],
          bansTracks: [...own.bans_tracks],
          picksModes: [...own.picks_item_modes],
          bansModes: [...own.bans_item_modes],
          picksItems: [...own.picks_item_literal],
          bansItems: [...own.bans_item_literal],
        });
        setLocked(!!own.locked_at);
      }
    };

    void refresh();
    const handle = window.setInterval(refresh, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(handle);
    };
  }, [sessionId, gameSlug, viewerTwitchUserId, anonId]);

  const tracks = useMemo<Track[]>(
    () => (game ? listTracksForGame(game) : []),
    [game]
  );
  const itemModes = useMemo<ItemMode[]>(
    () => (game ? listItemModesForGame(game) : []),
    [game]
  );
  const items = useMemo<Item[]>(
    () => (game ? listItemsForGame(game) : []),
    [game]
  );

  const aggregate: PicksBansResults = useMemo(
    () => aggregateBallots(ballots, { lockedOnly: false }),
    [ballots]
  );
  const lockedCount = ballots.filter((b) => b.locked_at != null).length;
  const inProgressCount = ballots.length - lockedCount;

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

  if (!round) {
    return (
      <div className="live-tab live-tab--empty">
        <p className="live-pb__no-round-headline">
          No picks/bans round open right now.
        </p>
        <p className="live-pb__no-round-sub">
          When the streamer opens a round, this tab populates with track
          and item tiles you can pick or ban. Sign in with Twitch to keep
          your vote across rounds.
        </p>
      </div>
    );
  }

  const submit = async (lock: boolean) => {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/picks-bans/ballot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roundId: round.id,
          anonSessionId: viewerTwitchUserId ? undefined : anonId,
          picks_tracks: ballot.picksTracks,
          bans_tracks: ballot.bansTracks,
          picks_item_modes: ballot.picksModes,
          bans_item_modes: ballot.bansModes,
          picks_item_literal: ballot.picksItems,
          bans_item_literal: ballot.bansItems,
          lock,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) {
        setError(body.error ?? `Submit failed (${res.status}).`);
      } else if (lock) {
        setLocked(true);
      }
    } catch (err) {
      console.error("[LivePicksBansTab] submit failed", err);
      setError("Submit failed (network error).");
    }
    setSubmitting(false);
  };

  const cyclePick = (pool: Pool, id: string) => {
    if (locked) return;
    setBallot((b) => cyclePoolState(b, pool, id));
    // Auto-save in-progress ballot (debounced via `lock=false`); the
    // server stores it without locking.
    void submit(false);
  };

  return (
    <div className="live-tab live-pb">
      {!isAuthenticated && (
        <Alert variant="info">
          You&rsquo;re voting anonymously — your ballot lives in this
          browser tab. <button
            type="button"
            className="live-pb__signin-link"
            onClick={onSignInClick}
          >
            Sign in with Twitch
          </button>{" "}
          to keep your vote across rounds + tabs.
        </Alert>
      )}

      <div className="live-pb__status">
        <div>
          <strong>Round open</strong> · {round.game_slug}
        </div>
        <div className="live-pb__counts">
          <span>{lockedCount} locked</span>
          <span> · {inProgressCount} in progress</span>
        </div>
      </div>

      <div className="live-pb__tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={activePool === "tracks"}
          className={`live-pb__tab${activePool === "tracks" ? " live-pb__tab--active" : ""}`}
          onClick={() => setActivePool("tracks")}
        >
          Tracks ({ballot.picksTracks.length}✓ / {ballot.bansTracks.length}✗)
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activePool === "modes"}
          className={`live-pb__tab${activePool === "modes" ? " live-pb__tab--active" : ""}`}
          onClick={() => setActivePool("modes")}
        >
          Item Modes ({ballot.picksModes.length}✓ / {ballot.bansModes.length}✗)
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activePool === "items"}
          className={`live-pb__tab${activePool === "items" ? " live-pb__tab--active" : ""}`}
          onClick={() => setActivePool("items")}
        >
          Items ({ballot.picksItems.length}✓ / {ballot.bansItems.length}✗)
        </button>
      </div>

      {activePool === "tracks" && (
        <PoolGrid
          options={tracks}
          picks={ballot.picksTracks}
          bans={ballot.bansTracks}
          counts={aggregate.tracks}
          onCycle={(id) => cyclePick("tracks", id)}
          locked={locked}
        />
      )}
      {activePool === "modes" && (
        <PoolGrid
          options={itemModes.map((m) => ({ id: m.id, name: m.name }))}
          picks={ballot.picksModes}
          bans={ballot.bansModes}
          counts={aggregate.itemModes}
          onCycle={(id) => cyclePick("modes", id)}
          locked={locked}
        />
      )}
      {activePool === "items" && (
        <PoolGrid
          options={items.map((i) => ({
            id: i.id,
            name: i.name,
            cup: i.category,
            image: i.image,
          }))}
          picks={ballot.picksItems}
          bans={ballot.bansItems}
          counts={aggregate.itemLiteral}
          onCycle={(id) => cyclePick("items", id)}
          locked={locked}
        />
      )}

      {error && (
        <Alert variant="error" onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <div className="live-pb__actions">
        {!locked ? (
          <>
            <Button
              variant="primary"
              onClick={() => void submit(true)}
              disabled={submitting}
            >
              {submitting ? "Locking…" : "Lock my vote"}
            </Button>
            <span className="live-pb__lock-hint">
              Once locked, your ballot is frozen for this round.
            </span>
          </>
        ) : (
          <Alert variant="success">
            Your vote is locked in. The streamer will review the top picks
            when the round closes.
          </Alert>
        )}
      </div>

      <p className="live-pb__footer-hint">
        Want to follow your vote across rounds? <Link href="/login">Sign in</Link>.
      </p>
    </div>
  );
}

interface PoolGridOption {
  id: string;
  name: string;
  cup?: string;
  image?: string;
}

function PoolGrid({
  options,
  picks,
  bans,
  counts,
  onCycle,
  locked,
}: {
  options: PoolGridOption[];
  picks: string[];
  bans: string[];
  counts: { topPicks: Array<{ id: string; count: number }>; topBans: Array<{ id: string; count: number }> };
  onCycle: (id: string) => void;
  locked: boolean;
}) {
  const pickedSet = new Set(picks);
  const bannedSet = new Set(bans);
  const pickCountById = new Map(counts.topPicks.map((r) => [r.id, r.count]));
  const banCountById = new Map(counts.topBans.map((r) => [r.id, r.count]));

  if (options.length === 0) {
    return (
      <div className="live-pb__empty">
        <p>No options available for this pool yet.</p>
      </div>
    );
  }

  return (
    <div className="live-pb__grid">
      {options.map((o) => {
        const isPicked = pickedSet.has(o.id);
        const isBanned = bannedSet.has(o.id);
        const pickCount = pickCountById.get(o.id) ?? 0;
        const banCount = banCountById.get(o.id) ?? 0;
        const stateClass = isPicked
          ? " live-pb__tile--picked"
          : isBanned
            ? " live-pb__tile--banned"
            : "";
        return (
          <button
            key={o.id}
            type="button"
            className={`live-pb__tile${stateClass}`}
            onClick={() => onCycle(o.id)}
            disabled={locked}
            aria-pressed={isPicked || isBanned}
            aria-label={`${o.name}${isPicked ? ", picked" : isBanned ? ", banned" : ""}`}
          >
            {o.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={o.image}
                alt=""
                className="live-pb__tile-img"
                loading="lazy"
              />
            ) : (
              <div className="live-pb__tile-img live-pb__tile-img--placeholder" />
            )}
            <span className="live-pb__tile-name">{o.name}</span>
            <div className="live-pb__tile-counts">
              <span className="live-pb__tile-pick-count" title="Total picks">
                ✓ {pickCount}
              </span>
              <span className="live-pb__tile-ban-count" title="Total bans">
                ✗ {banCount}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function cyclePoolState(b: BallotState, pool: Pool, id: string): BallotState {
  const fields = poolFields(pool);
  const picks = b[fields.picks];
  const bans = b[fields.bans];
  const isPicked = picks.includes(id);
  const isBanned = bans.includes(id);
  if (!isPicked && !isBanned) {
    return { ...b, [fields.picks]: [...picks, id] };
  }
  if (isPicked) {
    return {
      ...b,
      [fields.picks]: picks.filter((x) => x !== id),
      [fields.bans]: [...bans, id],
    };
  }
  return { ...b, [fields.bans]: bans.filter((x) => x !== id) };
}

function poolFields(pool: Pool): {
  picks: keyof BallotState;
  bans: keyof BallotState;
} {
  if (pool === "tracks") return { picks: "picksTracks", bans: "bansTracks" };
  if (pool === "modes") return { picks: "picksModes", bans: "bansModes" };
  return { picks: "picksItems", bans: "bansItems" };
}
